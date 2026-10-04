// Server-only "explain anything" engine for Solana. Give it a transaction
// signature or an account address and it returns a structured, human-readable
// breakdown + risk flags. Account classification is done via on-chain reads.
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { getConnection, NATIVE_SYMBOL, explorerTx, explorerAddress, isValidAddress } from "./solana"

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

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

export async function explainTarget(target: string): Promise<ExplainResult | { error: string }> {
  const t = target.trim()
  // Signatures are 64-byte base58 (~87-88 chars); addresses are 32-byte (32-44 chars).
  if (t.length > 50) return explainTx(t)
  if (isValidAddress(t)) return explainAddress(t)
  return { error: "Paste a transaction signature or an account address and I'll break it down." }
}

async function explainTx(signature: string): Promise<ExplainResult | { error: string }> {
  const connection = getConnection()
  let tx
  try {
    tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })
  } catch {
    tx = null
  }
  if (!tx) return { error: "I couldn't find that transaction on this cluster." }

  const ok = !tx.meta?.err
  const keys = tx.transaction.message.accountKeys
  const from = keys[0]?.pubkey.toBase58()
  const instructions = tx.transaction.message.instructions as any[]
  const programs = Array.from(new Set(instructions.map((i) => i.program || i.programId?.toBase58?.() || String(i.programId))))
  const pre = tx.meta?.preBalances?.[0] ?? 0
  const post = tx.meta?.postBalances?.[0] ?? 0
  const moved = Math.abs(pre - post) / LAMPORTS_PER_SOL
  const fee = (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL

  const risks: Risk[] = []
  if (!ok) risks.push({ level: "high", text: "This transaction failed — it did not complete." })
  if (programs.some((p) => /token/i.test(p))) risks.push({ level: "info", text: "Interacts with the token program (transfer / mint / account changes)." })
  if (!risks.length) risks.push({ level: "info", text: "A standard transaction — nothing unusual." })

  const fields: ExplainResult["fields"] = [
    { label: "Status", value: ok ? "Success" : "Failed" },
    { label: "Fee payer", value: short(from), mono: true },
    { label: "Value moved", value: `${moved.toFixed(6)} ${NATIVE_SYMBOL}` },
    { label: "Fee", value: `${fee.toFixed(6)} ${NATIVE_SYMBOL}` },
    { label: "Slot", value: tx.slot?.toString() ?? "—" },
    { label: "Instructions", value: String(instructions.length) },
  ]

  return {
    kind: "explain",
    type: "transaction",
    target: signature,
    title: "Transaction",
    summary: `${short(from)} submitted a transaction with ${instructions.length} instruction${instructions.length === 1 ? "" : "s"}${moved > 0 ? `, moving ${moved.toFixed(4)} ${NATIVE_SYMBOL}` : ""}.`,
    fields,
    method: programs.length
      ? { name: "functions", params: programs.map((p) => ({ name: short(p), type: "program", value: p })) }
      : undefined,
    risks,
    explorerUrl: explorerTx(signature),
  }
}

async function explainAddress(addr: string): Promise<ExplainResult | { error: string }> {
  const connection = getConnection()
  const pubkey = new PublicKey(addr)
  const info = await connection.getParsedAccountInfo(pubkey).catch(() => null)
  const value = info?.value
  const lamports = value?.lamports ?? 0
  const balance = lamports / LAMPORTS_PER_SOL
  const owner = value?.owner?.toBase58()

  // Executable account → a program.
  if (value?.executable) {
    return {
      kind: "explain",
      type: "contract",
      target: addr,
      title: "Program",
      summary: "An on-chain program (smart contract) on Solana.",
      fields: [
        { label: "Type", value: "Program (executable)" },
        { label: "Owner (loader)", value: short(owner), mono: true },
        { label: "Balance", value: `${balance.toFixed(4)} ${NATIVE_SYMBOL}` },
      ],
      risks: [
        { level: "medium", text: "Review the program's source/verification before trusting it with funds." },
        { level: "info", text: "Only interact with programs you trust." },
      ],
      explorerUrl: explorerAddress(addr),
    }
  }

  // Token program owned → mint or token account.
  const data: any = value?.data
  const parsed = data && typeof data === "object" && "parsed" in data ? data.parsed : null
  if (owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) {
    if (parsed?.type === "mint") {
      const supply = parsed.info?.supply
      const decimals = parsed.info?.decimals
      const uiSupply = supply != null && decimals != null ? Number(supply) / 10 ** decimals : undefined
      return {
        kind: "explain",
        type: "contract",
        target: addr,
        title: "Token mint",
        summary: "An SPL token mint on Solana.",
        fields: [
          { label: "Type", value: "SPL token mint" },
          { label: "Decimals", value: String(decimals ?? "—") },
          ...(uiSupply != null ? [{ label: "Supply", value: uiSupply.toLocaleString() }] : []),
          { label: "Mint authority", value: short(parsed.info?.mintAuthority) || "none", mono: true },
        ],
        risks: [
          ...(parsed.info?.mintAuthority ? [{ level: "medium" as const, text: "This mint still has a mint authority — supply can be increased." }] : []),
          { level: "info", text: "Verify the mint before trading or holding it." },
        ],
        explorerUrl: explorerAddress(addr),
      }
    }
    if (parsed?.type === "account") {
      return {
        kind: "explain",
        type: "contract",
        target: addr,
        title: "Token account",
        summary: "An SPL token account holding a balance for a mint.",
        fields: [
          { label: "Type", value: "SPL token account" },
          { label: "Mint", value: short(parsed.info?.mint), mono: true },
          { label: "Owner", value: short(parsed.info?.owner), mono: true },
          { label: "Amount", value: String(parsed.info?.tokenAmount?.uiAmountString ?? "—") },
        ],
        risks: [{ level: "info", text: "A token account is a holding account for a specific mint." }],
        explorerUrl: explorerAddress(addr),
      }
    }
  }

  // Otherwise, a regular wallet (system account).
  return {
    kind: "explain",
    type: "wallet",
    target: addr,
    title: "Wallet",
    summary: `A regular wallet account holding ${balance.toFixed(4)} ${NATIVE_SYMBOL}.`,
    fields: [
      { label: "Type", value: "Wallet (system account)" },
      { label: "Balance", value: `${balance.toFixed(4)} ${NATIVE_SYMBOL}` },
      { label: "Owner", value: short(owner) || "System Program", mono: true },
    ],
    risks: [{ level: "info", text: "This is a normal wallet address, not a program." }],
    explorerUrl: explorerAddress(addr),
  }
}
