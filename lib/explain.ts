// Server-only "explain anything" engine for Arc. Give it a transaction hash or an
// address and it returns a structured, human-readable breakdown plus risk flags.
// Calldata is decoded against a local ABI dictionary (common ERC-20 / ERC-721 and
// Astrax calls), with a validated 4byte.directory fallback for other selectors.
// Address classification is done with on-chain reads; no explorer API key needed.
import {
  parseAbi,
  decodeFunctionData,
  toFunctionSelector,
  type Hex,
  type AbiFunction,
} from "viem"
import {
  NATIVE_SYMBOL,
  USDC_ADDRESS,
  SYSTEM_EMITTER,
  explorerTx,
  explorerAddress,
  findToken,
  getPublicClient,
  isTxHash,
  isValidAddress,
  normalizeAddress,
  type ArcNetwork,
} from "./arc"
import { ERC20_ABI, formatAmount } from "./evm"

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

const short = (a?: string | null) => (typeof a === "string" && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

/** Native USDC uses 18 decimals; show at most 6 like the ERC-20 view. */
const usdc = (wei: bigint) => `${formatAmount(wei, 18, 6)} ${NATIVE_SYMBOL}`

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
  "function transferOwnership(address newOwner)",
  "function deposit()",
  "function withdraw(uint256 amount)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
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

function fmtArg(v: unknown): string {
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
  const item = SELECTORS.get(input.slice(0, 10).toLowerCase())
  if (!item) return null
  try {
    const { args } = decodeFunctionData({ abi: [item], data: input })
    return {
      name: item.name,
      params: (item.inputs || []).map((inp, i) => ({ name: inp.name || `arg${i}`, type: inp.type, value: fmtArg((args as unknown[])[i]) })),
    }
  } catch {
    return null
  }
}

async function decode4byte(input: Hex): Promise<Decoded | null> {
  try {
    const sel = input.slice(0, 10)
    const res = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const j = await res.json()
    const sigs: string[] = (j.results || []).map((r: { text_signature: string }) => r.text_signature)
    for (const sig of sigs) {
      try {
        const abi = parseAbi([`function ${sig}`] as readonly string[]) as readonly AbiFunction[]
        const item = abi.find((x) => x.type === "function")!
        const { args } = decodeFunctionData({ abi: [item], data: input })
        return { name: item.name, params: (item.inputs || []).map((inp, i) => ({ name: inp.name || `arg${i}`, type: inp.type, value: fmtArg((args as unknown[])[i]) })) }
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
  if (!/approve|setApprovalForAll|permit/i.test(d.name)) return null
  if (/setApprovalForAll/i.test(d.name) && d.params.some((p) => p.type === "bool" && p.value === "true")) {
    return { level: "high", text: "Approves an operator for ALL your NFTs in this collection. Only do this for trusted marketplaces." }
  }
  const amt = d.params.find((p) => p.type.startsWith("uint"))
  if (amt && /^\d+$/.test(amt.value) && amt.value.length >= 30) {
    return { level: "high", text: "Very large (likely unlimited) token approval: the spender could move your tokens at any time. Revoke it if you don't recognise the spender." }
  }
  return { level: "medium", text: "Grants another address permission to move your tokens. Make sure you trust the spender." }
}

export async function explainTarget(network: ArcNetwork, target: string): Promise<ExplainResult | { error: string }> {
  const t = target.trim()
  if (isTxHash(t)) return explainTx(network, t)
  if (isValidAddress(t)) return explainAddress(network, normalizeAddress(t))
  return { error: "Paste a transaction hash (0x + 64 hex characters) or an address (0x + 40 hex characters) and I'll break it down." }
}

async function explainTx(network: ArcNetwork, hash: Hex): Promise<ExplainResult | { error: string }> {
  const client = getPublicClient(network)
  let tx
  try {
    tx = await client.getTransaction({ hash })
  } catch {
    return { error: `I couldn't find that transaction on ${network.name}.` }
  }
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null)
  const toCode = tx.to ? await client.getCode({ address: tx.to }).catch(() => undefined) : undefined
  const toIsContract = !!toCode && toCode !== "0x"
  const ok = receipt ? receipt.status === "success" : undefined

  let decoded: Decoded | null = null
  if (tx.input && tx.input !== "0x" && toIsContract) decoded = decodeKnown(tx.input) || (await decode4byte(tx.input))

  // Token amounts are easier to read with decimals applied.
  const token = tx.to ? findToken(network, tx.to) : undefined
  if (decoded && token) {
    for (const p of decoded.params) {
      if (p.type === "uint256" && /amount|value/i.test(p.name)) p.value = `${formatAmount(BigInt(p.value), token.decimals)} ${token.symbol}`
    }
  }

  const risks: Risk[] = []
  if (ok === false) risks.push({ level: "high", text: "This transaction reverted, so it did not complete (the fee was still paid)." })
  if (decoded) {
    const ar = approvalRisk(decoded)
    if (ar) risks.push(ar)
  }
  if (!tx.to) risks.push({ level: "info", text: "Deploys a new contract." })
  else if (toIsContract) risks.push({ level: "info", text: "Interacts with a contract. Confirm you trust it before signing similar calls." })
  if (!risks.length) risks.push({ level: "info", text: "A plain USDC transfer, nothing unusual." })

  const fee = receipt ? receipt.gasUsed * receipt.effectiveGasPrice : undefined
  const fields: ExplainResult["fields"] = [
    { label: "Status", value: receipt ? (ok ? "Success" : "Failed") : "Pending" },
    { label: "From", value: short(tx.from), mono: true },
    {
      label: "To",
      value: tx.to ? `${short(tx.to)}${token ? ` · ${token.symbol}` : toIsContract ? " · contract" : ""}` : `(new contract ${short(receipt?.contractAddress)})`,
      mono: true,
    },
    { label: "Value", value: usdc(tx.value) },
    { label: "Block", value: tx.blockNumber?.toString() ?? "pending" },
  ]
  if (fee !== undefined) fields.push({ label: "Fee", value: usdc(fee) })

  const verb = decoded
    ? `called \`${decoded.name}\``
    : !tx.to
      ? "deployed a contract"
      : tx.input && tx.input !== "0x" && toIsContract
        ? "made a contract call"
        : "sent USDC"
  return {
    kind: "explain",
    type: "transaction",
    target: hash,
    title: "Transaction",
    summary: `${short(tx.from)} ${verb}${tx.to ? ` ${verb === "sent USDC" ? "to" : "on"} ${token ? token.symbol : short(tx.to)}` : ""}${tx.value > 0n ? `, moving ${usdc(tx.value)}` : ""}.`,
    fields,
    method: decoded ?? undefined,
    risks,
    explorerUrl: explorerTx(network, hash),
  }
}

const I165_ABI = parseAbi(["function supportsInterface(bytes4) view returns (bool)"])

async function explainAddress(network: ArcNetwork, addr: `0x${string}`): Promise<ExplainResult | { error: string }> {
  const client = getPublicClient(network)

  if (addr.toLowerCase() === SYSTEM_EMITTER.toLowerCase()) {
    return {
      kind: "explain",
      type: "contract",
      target: addr,
      title: "Arc system address",
      summary: "The protocol address that emits a Transfer log for every native USDC movement on Arc (EIP-7708). It isn't a wallet and can't be sent to.",
      fields: [{ label: "Type", value: "System emitter" }],
      risks: [{ level: "info", text: "Logs from this address are bookkeeping, not real token contract events." }],
      explorerUrl: explorerAddress(network, addr),
    }
  }

  const [code, bal] = await Promise.all([
    client.getCode({ address: addr }).catch(() => undefined),
    client.getBalance({ address: addr }).catch(() => 0n),
  ])
  const isContract = !!code && code !== "0x"

  if (!isContract) {
    const nonce = await client.getTransactionCount({ address: addr }).catch(() => 0)
    return {
      kind: "explain",
      type: "wallet",
      target: addr,
      title: "Wallet",
      summary: `A regular wallet (EOA) on ${network.name} holding ${usdc(bal)}.`,
      fields: [
        { label: "Type", value: "Wallet (EOA)" },
        { label: "Balance", value: usdc(bal) },
        { label: "Transactions sent", value: String(nonce) },
      ],
      risks: [
        nonce === 0
          ? { level: "info", text: "This wallet has never sent a transaction. Double-check the address before sending to it." }
          : { level: "info", text: "This is a normal wallet address, not a contract." },
      ],
      explorerUrl: explorerAddress(network, addr),
    }
  }

  // Contract: classify via on-chain reads.
  const read = async (fn: "name" | "symbol" | "decimals" | "totalSupply" | "owner") => {
    try {
      return await client.readContract({ address: addr, abi: ERC20_ABI, functionName: fn })
    } catch {
      return undefined
    }
  }
  const [name, symbol, decimals, totalSupply, owner, isErc721] = await Promise.all([
    read("name"),
    read("symbol"),
    read("decimals"),
    read("totalSupply"),
    read("owner"),
    client.readContract({ address: addr, abi: I165_ABI, functionName: "supportsInterface", args: ["0x80ac58cd"] }).catch(() => false),
  ])
  const known = findToken(network, addr)
  const isToken = !isErc721 && symbol !== undefined && decimals !== undefined

  const fields: ExplainResult["fields"] = [
    { label: "Type", value: isErc721 ? "NFT contract (ERC-721)" : isToken ? "Token contract (ERC-20)" : "Contract" },
  ]
  if (name) fields.push({ label: "Name", value: `${name}${symbol ? ` (${symbol})` : ""}` })
  if (isToken) fields.push({ label: "Decimals", value: String(decimals) })
  if (isToken && totalSupply !== undefined)
    fields.push({ label: "Total supply", value: Number(formatAmount(totalSupply as bigint, Number(decimals), 2)).toLocaleString() })
  if (owner) fields.push({ label: "Owner", value: short(owner as string), mono: true })
  if (bal > 0n) fields.push({ label: "USDC held", value: usdc(bal) })

  const risks: Risk[] = []
  if (known) risks.push({ level: "info", text: `This is the official ${known.name} (${known.symbol}) contract on ${network.name}.` })
  else {
    if (isToken && owner) risks.push({ level: "medium", text: "This token has an owner who may be able to mint more supply." })
    if (isToken && symbol && findToken(network, String(symbol)))
      risks.push({ level: "high", text: `Uses the symbol ${symbol} but is NOT the official ${symbol} contract on Arc. It may be an imitation.` })
    risks.push({ level: "medium", text: "Review the contract's verified source on the explorer before trusting it with funds." })
  }

  const kind = isErc721 ? "NFT contract" : isToken ? "Token contract" : "Contract"
  return {
    kind: "explain",
    type: "contract",
    target: addr,
    title: kind,
    summary:
      addr.toLowerCase() === USDC_ADDRESS
        ? "The ERC-20 interface of Arc's native USDC. It shares one balance with the native gas token (18 decimals natively, 6 through this contract)."
        : name
          ? `${name}${symbol ? ` (${symbol})` : ""}, a${isErc721 ? "n ERC-721 NFT" : isToken ? "n ERC-20 token" : ""} contract on ${network.name}.`
          : `A smart contract on ${network.name}.`,
    fields,
    risks,
    explorerUrl: explorerAddress(network, addr),
  }
}
