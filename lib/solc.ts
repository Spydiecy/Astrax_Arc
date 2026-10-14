/* eslint-disable @typescript-eslint/no-explicit-any -- solc-js is untyped; its JSON output is parsed defensively below */
// Server-only Solidity compiler (solc-js) for the agent's deployContract tool.
// Sources must be self-contained, except for OpenZeppelin imports
// ("@openzeppelin/contracts/..."), which are resolved from node_modules.
import "server-only"
import fs from "fs"
import path from "path"
import type { Abi } from "viem"

export const MAX_SOURCE_CHARS = 40_000
/** EIP-170 limit on deployed (runtime) code size. */
const MAX_RUNTIME_BYTES = 24_576

export interface CompiledContract {
  contractName: string
  abi: Abi
  bytecode: `0x${string}`
  runtimeBytes: number
  compilerVersion: string
  /** Non-fatal compiler warnings (trimmed). */
  warnings: string[]
}

const OZ_ROOT = path.join(process.cwd(), "node_modules", "@openzeppelin", "contracts")
const OZ_IMPORT = /^@openzeppelin\/contracts\/[A-Za-z0-9_\/.-]+\.sol$/

// Only OpenZeppelin files can be imported, and only from inside its package
// folder, so contract source can never read other files on the server.
function resolveImport(importPath: string): { contents: string } | { error: string } {
  if (!OZ_IMPORT.test(importPath) || importPath.includes("..")) {
    return { error: `Import "${importPath}" isn't available. Only @openzeppelin/contracts imports are supported; inline anything else.` }
  }
  const file = path.join(OZ_ROOT, importPath.slice("@openzeppelin/contracts/".length))
  if (!file.startsWith(OZ_ROOT + path.sep)) return { error: `Import "${importPath}" isn't allowed.` }
  try {
    return { contents: fs.readFileSync(file, "utf8") }
  } catch {
    return { error: `File not found: ${importPath}` }
  }
}

// solc-js is ~10 MB; load it once per server instance.
let solcPromise: Promise<any> | null = null
function loadSolc(): Promise<any> {
  if (!solcPromise) {
    solcPromise = import("solc").then((m: any) => m.default ?? m)
    solcPromise.catch(() => { solcPromise = null })
  }
  return solcPromise
}

/** Compile `source` and pick the contract to deploy (`preferredName`, or the last deployable one). */
export async function compileSolidity(
  source: string,
  preferredName?: string,
): Promise<{ ok: true; result: CompiledContract } | { ok: false; error: string }> {
  if (!source.trim()) return { ok: false, error: "No Solidity source given." }
  if (source.length > MAX_SOURCE_CHARS) return { ok: false, error: `Source is too long (max ${MAX_SOURCE_CHARS.toLocaleString()} characters).` }
  if (!/pragma\s+solidity/.test(source)) return { ok: false, error: "Add a pragma line, e.g. `pragma solidity ^0.8.20;`." }

  let solc: any
  try {
    solc = await loadSolc()
  } catch {
    return { ok: false, error: "The Solidity compiler isn't available on this server." }
  }

  const input = {
    language: "Solidity",
    sources: { "Contract.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Arc targets Ethereum's Osaka fork, so everything up to Cancun is supported.
      evmVersion: "cancun",
      outputSelection: { "Contract.sol": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  }

  let out: any
  try {
    out = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }))
  } catch (e: any) {
    return { ok: false, error: `Compile failed: ${String(e?.message || e).slice(0, 300)}` }
  }

  const diagnostics: any[] = out.errors || []
  const errors = diagnostics.filter((e) => e.severity === "error")
  if (errors.length) {
    const lines = source.split("\n")
    // "TypeError: message (line 9: `onlyOwner`)" plus a hint when it's a known OpenZeppelin v5 pitfall.
    const msg = errors
      .slice(0, 3)
      .map((e) => {
        const row = e.sourceLocation ? source.slice(0, e.sourceLocation.start).split("\n").length : undefined
        const text = row ? lines[row - 1]?.trim().slice(0, 100) : undefined
        const where = row ? ` (line ${row}${text ? `: \`${text}\`` : ""})` : ""
        return `${e.type || "Error"}: ${String(e.message).replace(/\s+/g, " ").slice(0, 220)}${where}`
      })
      .join("\n")
    const all = errors.map((e) => String(e.message)).join(" ")
    const hints: string[] = []
    if (/Counters\.sol/.test(all)) hints.push("OpenZeppelin v5 has no Counters.sol; use a plain `uint256` counter.")
    if (/base constructor/i.test(all) || /Wrong argument count for modifier/i.test(all))
      hints.push("In OpenZeppelin v5, `Ownable` needs its owner: `constructor() Ownable(msg.sender) {}`.")
    if (/SafeMath/.test(all)) hints.push("SafeMath isn't needed: Solidity 0.8 checks overflow itself.")
    if (/Identifier not found|Undeclared identifier/i.test(all) && /Ownable|ReentrancyGuard|ERC20|ERC721/.test(source) && !/import/.test(source))
      hints.push('Add the import, e.g. `import "@openzeppelin/contracts/access/Ownable.sol";`.')
    return { ok: false, error: `Compile error:\n${msg}${hints.length ? `\nHint: ${hints.join(" ")}` : ""}`.slice(0, 1100) }
  }

  const file = out.contracts?.["Contract.sol"] || {}
  const deployable = Object.keys(file).filter((n) => (file[n]?.evm?.bytecode?.object || "").length > 0)
  if (deployable.length === 0) return { ok: false, error: "No deployable contract found (only interfaces, libraries or abstract contracts?)." }

  let name = deployable[deployable.length - 1]
  if (preferredName) {
    if (!deployable.includes(preferredName)) {
      return { ok: false, error: `No deployable contract named "${preferredName}". Found: ${deployable.join(", ")}.` }
    }
    name = preferredName
  }
  const c = file[name]
  const runtimeBytes = (c.evm.deployedBytecode?.object || "").length / 2
  if (runtimeBytes > MAX_RUNTIME_BYTES) {
    return { ok: false, error: `${name} is ${runtimeBytes.toLocaleString()} bytes, over the 24,576-byte contract size limit.` }
  }

  return {
    ok: true,
    result: {
      contractName: name,
      abi: c.abi as Abi,
      bytecode: `0x${c.evm.bytecode.object}`,
      runtimeBytes,
      compilerVersion: String(solc.version()).split("+")[0],
      warnings: diagnostics
        .filter((e) => e.severity === "warning")
        .slice(0, 3)
        .map((e) => String(e.message).slice(0, 160)),
    },
  }
}
