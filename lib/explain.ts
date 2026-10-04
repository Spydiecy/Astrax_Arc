// Server-only "explain anything" engine — viem-first (no explorer API key needed).
// Give it a tx hash or an address and it returns a structured, human-readable
// breakdown + risk flags. Calldata is decoded against a local ABI dictionary
// (covers the common ERC-20/721 + DEX calls), with a validated 4byte.directory
// fallback for exotic selectors. Address classification is done via on-chain reads.
import {
  formatEther,
  isAddress,
  parseAbi,
  decodeFunctionData,
  toFunctionSelector,
  type Hex,
  type AbiFunction,
} from "viem"
import { getPublicClient, NATIVE_SYMBOL, ERC20_ABI, explorerTx, explorerAddress } from "./sonic"

export type RiskLevel = "high" | "medium" | "info"
export interface Risk {
  level: RiskLevel
  text: string
}
export interface ExplainResult {
  kind: "explain"
  type: "transaction" | "contract" | "wallet"
  target: string
  title: string
  summary: string
  fields: { label: string; value: string; mono?: boolean }[]
  method?: { name: string; params: { name: string; type: string; value: string }[] }
  risks: Risk[]
  explorerUrl: string
}

const short = (a?: string) => (typeof a === "string" && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

// ── Local calldata dictionary ───────────────────────────────────────────────
const KNOWN_SIGS = [
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  "function setApprovalForAll(address operator, bool approved)",
  "function mint(address to)",
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  "function deposit()",
  "function withdraw(uint256 amount)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)",
]
const KNOWN_ABI = parseAbi(KNOWN_SIGS)
const SELECTORS = new Map<string, AbiFunction>()
for (const item of KNOWN_ABI as readonly AbiFunction[]) {
  if (item.type === "function") {
    try {
      SELECTORS.set(toFunctionSelector(item).toLowerCase(), item)
    } catch {
      /* ignore */
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtArg(v: any): string {
  if (typeof v === "bigint") return v.toString()
  if (Array.isArray(v)) return v.map(fmtArg).join(", ")
  return String(v)
}

interface Decoded {
  name: string
  params: { name: string; type: string; value: string }[]
}

function decodeKnown(input: Hex): Decoded | null {
  if (!input || input.length < 10) return null
  const sel = input.slice(0, 10).toLowerCase()
  const item = SELECTORS.get(sel)
  if (!item) return null
  try {
    const { functionName, args } = decodeFunctionData({ abi: KNOWN_ABI, data: input })
    return {
      name: functionName,
      params: (item.inputs || []).map((inp, i) => ({ name: inp.name || `arg${i}`, type: inp.type, value: fmtArg((args as unknown[])[i]) })),
    }
  } catch {
    return null
  }
}

async function decode4byte(input: Hex): Promise<Decoded | null> {
  try {
    const sel = input.slice(0, 10)
    const res = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}`, { headers: { accept: "application/json" } })
    if (!res.ok) return null
    const j = await res.json()
    const sigs: string[] = (j.results || []).map((r: { text_signature: string }) => r.text_signature)
    for (const sig of sigs) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const abi = parseAbi([`function ${sig}`] as any)
        const { functionName, args } = decodeFunctionData({ abi, data: input })
        const item = (abi as readonly AbiFunction[]).find((x) => x.type === "function")!
        return { name: functionName, params: (item.inputs || []).map((inp, i) => ({ name: inp.name || `arg${i}`, type: inp.type, value: fmtArg((args as unknown[])[i]) })) }
      } catch {
        /* try next candidate */
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function approvalRisk(d: Decoded): Risk | null {
  if (!/approve|setApprovalForAll/i.test(d.name)) return null
  if (/setApprovalForAll/i.test(d.name) && d.params.some((p) => p.type === "bool" && p.value === "true")) {
    return { level: "high", text: "Approves an operator for ALL your NFTs in this collection. Only do this for trusted marketplaces." }
  }
  const amt = d.params.find((p) => p.type.startsWith("uint"))
  if (amt && /^\d+$/.test(amt.value) && amt.value.length >= 30) {
    return { level: "high", text: "Very large (likely unlimited) token approval — the spender could move your tokens anytime. Revoke if you don't recognise it." }
  }
  return null
}

export async function explainTarget(target: string): Promise<ExplainResult | { error: string }> {
  const t = target.trim()
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return explainTx(t as Hex)
  if (isAddress(t)) return explainAddress(t)
  return { error: "Paste a transaction hash (0x + 64 hex) or an address (0x + 40 hex) and I'll break it down." }
}

async function explainTx(hash: Hex): Promise<ExplainResult | { error: string }> {
  const client = getPublicClient()
  let tx
  try {
    tx = await client.getTransaction({ hash })
  } catch {
    return { error: "I couldn't find that transaction on Sonic Testnet." }
  }
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null)
  const toCode = tx.to ? await client.getCode({ address: tx.to }).catch(() => undefined) : undefined
  const toIsContract = !!toCode && toCode !== "0x"
  const ok = receipt ? receipt.status === "success" : undefined

  let decoded: Decoded | null = null
  if (tx.input && tx.input !== "0x") decoded = decodeKnown(tx.input) || (await decode4byte(tx.input))

  const risks: Risk[] = []
  if (ok === false) risks.push({ level: "high", text: "This transaction reverted — it did not complete." })
  if (decoded) {
    const ar = approvalRisk(decoded)
    if (ar) risks.push(ar)
  }
  if (toIsContract) risks.push({ level: "info", text: "Interacts with a contract. Always confirm you trust it before signing similar calls." })
  if (!risks.length) risks.push({ level: "info", text: "A plain value transfer — nothing unusual." })

  const fields: ExplainResult["fields"] = [
    { label: "Status", value: receipt ? (ok ? "Success" : "Failed") : "Pending" },
    { label: "From", value: short(tx.from), mono: true },
    { label: "To", value: `${short(tx.to ?? "(contract creation)")}${toIsContract ? " · contract" : ""}`, mono: true },
    { label: "Value", value: `${formatEther(tx.value)} ${NATIVE_SYMBOL}` },
    { label: "Block", value: tx.blockNumber?.toString() ?? "pending" },
  ]
  if (receipt?.gasUsed) fields.push({ label: "Gas used", value: receipt.gasUsed.toString() })

  const verb = decoded ? `called \`${decoded.name}\`` : tx.input && tx.input !== "0x" ? "made a contract call" : "transferred value"
  return {
    kind: "explain",
    type: "transaction",
    target: hash,
    title: "Transaction",
    summary: `${short(tx.from)} ${verb}${tx.to ? ` on ${short(tx.to)}` : ""}${tx.value > 0n ? `, sending ${formatEther(tx.value)} ${NATIVE_SYMBOL}` : ""}.`,
    fields,
    method: decoded ?? undefined,
    risks,
    explorerUrl: explorerTx(hash),
  }
}

const I165_ABI = parseAbi(["function supportsInterface(bytes4) view returns (bool)"])

async function explainAddress(addr: string): Promise<ExplainResult | { error: string }> {
  const client = getPublicClient()
  const code = await client.getCode({ address: addr as Hex }).catch(() => undefined)
  const isContract = !!code && code !== "0x"

  if (!isContract) {
    const [bal, nonce] = await Promise.all([
      client.getBalance({ address: addr as Hex }).catch(() => 0n),
      client.getTransactionCount({ address: addr as Hex }).catch(() => 0),
    ])
    return {
      kind: "explain",
      type: "wallet",
      target: addr,
      title: "Wallet",
      summary: `A regular wallet (EOA) holding ${formatEther(bal)} ${NATIVE_SYMBOL}.`,
      fields: [
        { label: "Type", value: "Wallet (EOA)" },
        { label: "Balance", value: `${formatEther(bal)} ${NATIVE_SYMBOL}` },
        { label: "Tx sent", value: String(nonce) },
      ],
      risks: [{ level: "info", text: "This is a normal wallet address, not a contract." }],
      explorerUrl: explorerAddress(addr),
    }
  }

  // Contract — classify via on-chain reads.
  const read = async (fn: string) => {
    try {
      return await client.readContract({ address: addr as Hex, abi: ERC20_ABI, functionName: fn as never })
    } catch {
      return undefined
    }
  }
  const [name, symbol, decimals, totalSupply] = await Promise.all([read("name"), read("symbol"), read("decimals"), read("totalSupply")])
  const isErc721 = await client
    .readContract({ address: addr as Hex, abi: I165_ABI, functionName: "supportsInterface", args: ["0x80ac58cd"] })
    .catch(() => false)

  const fields: ExplainResult["fields"] = [{ label: "Type", value: isErc721 ? "NFT contract (ERC-721)" : symbol ? "Token contract (ERC-20)" : "Contract" }]
  if (name) fields.push({ label: "Name", value: `${name}${symbol ? ` (${symbol})` : ""}` })
  if (!isErc721 && decimals !== undefined) fields.push({ label: "Decimals", value: String(decimals) })
  if (!isErc721 && totalSupply !== undefined && decimals !== undefined)
    fields.push({ label: "Total supply", value: (Number(totalSupply as bigint) / 10 ** Number(decimals)).toLocaleString() })

  const risks: Risk[] = [
    { level: "medium", text: "Source verification can't be confirmed without an explorer API key — review the contract on the explorer before trusting it." },
    { level: "info", text: "Only approve or send to this contract if you trust it." },
  ]

  const kind = isErc721 ? "NFT contract" : symbol ? "Token contract" : "Contract"
  return {
    kind: "explain",
    type: "contract",
    target: addr,
    title: kind,
    summary: name
      ? `${name}${symbol ? ` (${symbol})` : ""} — a${isErc721 ? "n ERC-721 NFT" : "n ERC-20 token"} contract on Sonic Testnet.`
      : "A smart contract on Sonic Testnet.",
    fields,
    risks,
    explorerUrl: explorerAddress(addr),
  }
}
