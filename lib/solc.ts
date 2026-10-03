// Server-only Solidity compiler using solc-js. Lets the agent deploy contracts it
// (or the user) writes as source. Keep contracts SELF-CONTAINED (no imports) and
// targeting the installed compiler (pragma ^0.8.x) — solc-js here has no import resolver.

import fs from "fs"
import path from "path"

export interface Compiled {
  abi: any[]
  bytecode: string
  contractName: string
}

// Resolve imports (e.g. @openzeppelin/contracts/...) from node_modules.
// solc calls this synchronously with fully-resolved paths.
function resolveImport(importPath: string): { contents: string } | { error: string } {
  try {
    const candidates = [
      path.join(process.cwd(), "node_modules", importPath),
      path.join(process.cwd(), "node_modules", importPath.replace(/^@/, "@")),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return { contents: fs.readFileSync(c, "utf8") }
      }
    }
    return { error: `File not found: ${importPath}` }
  } catch (e: any) {
    return { error: e?.message || `Could not resolve ${importPath}` }
  }
}

export async function compileSolidity(
  source: string,
  preferredName?: string,
): Promise<{ ok: true; result: Compiled } | { ok: false; error: string }> {
  let solc: any
  try {
    const mod = await import("solc")
    solc = (mod as any).default ?? mod
  } catch {
    return { ok: false, error: "Solidity compiler is not available on the server." }
  }

  const input = {
    language: "Solidity",
    sources: { "Contract.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  }

  let out: any
  try {
    out = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }))
  } catch (e: any) {
    return { ok: false, error: `Compile failed: ${e?.message || "unknown error"}` }
  }

  const errors = (out.errors || []).filter((e: any) => e.severity === "error")
  if (errors.length) {
    return { ok: false, error: errors.map((e: any) => e.formattedMessage || e.message).join("\n").slice(0, 600) }
  }

  const file = out.contracts?.["Contract.sol"] || {}
  const names = Object.keys(file)
  if (names.length === 0) return { ok: false, error: "No contract found in the source." }

  const name =
    (preferredName && names.includes(preferredName) && preferredName) ||
    names.find((n) => file[n]?.evm?.bytecode?.object) ||
    names[names.length - 1]

  const c = file[name]
  const bytecode = c?.evm?.bytecode?.object
  if (!bytecode) return { ok: false, error: `Contract ${name} produced no bytecode (abstract/interface?).` }

  return { ok: true, result: { abi: c.abi, bytecode: `0x${bytecode}`, contractName: name } }
}
