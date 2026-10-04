// Shared chain config, connection, token list and helpers for Astrax.
// Safe to import from both server (API route) and client components — it contains
// no secrets and no node-only APIs.
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js"

// ── Network ───────────────────────────────────────────────────────────────────
export const NATIVE_SYMBOL = "SOL"
export const NATIVE_DECIMALS = 9
export const CLUSTER: "devnet" | "testnet" | "mainnet-beta" =
  (process.env.NEXT_PUBLIC_CLUSTER as "devnet" | "testnet" | "mainnet-beta") || "devnet"
export const RPC_URL =
  process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(CLUSTER)
export const EXPLORER_URL = "https://explorer.solana.com"

export { LAMPORTS_PER_SOL }

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed")
}

export interface BlockSummary {
  slot: number
  blockhash: string
  parentSlot: number
  blockTime: number | null
  transactionCount: number
}

/**
 * Lightweight block lookup (signatures only). Calls the JSON-RPC method directly:
 * web3.js 1.x's getBlock response schema rejects `transactionDetails: "signatures"`.
 * Returns null for skipped / unavailable slots.
 */
export async function getBlockSummary(slot: number, rpcUrl: string = RPC_URL): Promise<BlockSummary | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBlock",
      params: [slot, { commitment: "confirmed", maxSupportedTransactionVersion: 0, transactionDetails: "signatures", rewards: false }],
    }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const j = await res.json()
  if (j.error || !j.result) return null
  const b = j.result
  return {
    slot,
    blockhash: b.blockhash,
    parentSlot: b.parentSlot,
    blockTime: b.blockTime ?? null,
    transactionCount: Array.isArray(b.signatures) ? b.signatures.length : 0,
  }
}

// ── Explorer link helpers ─────────────────────────────────────────────────────
const clusterQuery = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`
export const explorerPath = (path: string) => `${EXPLORER_URL}${path}${clusterQuery}`
export const explorerTx = (sig: string) => `${EXPLORER_URL}/tx/${sig}${clusterQuery}`
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}${clusterQuery}`
export const explorerBlock = (slot: string | number) => `${EXPLORER_URL}/block/${slot}${clusterQuery}`

export const shortAddr = (a?: string) =>
  a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || ""

/** Validate a base58 Solana address. */
export function isValidAddress(value?: string | null): boolean {
  if (!value) return false
  try {
    // PublicKey throws on malformed base58 / wrong length.
    const key = new PublicKey(value)
    return key.toBytes().length === 32
  } catch {
    return false
  }
}

// ── Curated token list (used by the token-list tool & cards) ────────────────────
// `SOL` is the native token (sentinel mint). Others are known SPL mints.
export const NATIVE_SENTINEL = "native"

export interface TokenInfo {
  symbol: string
  name: string
  /** SPL mint address, or NATIVE_SENTINEL for native SOL. */
  address: string
  decimals: number
}

export const CLUSTER_LABEL =
  CLUSTER === "mainnet-beta" ? "Mainnet" : CLUSTER === "testnet" ? "Testnet" : "Devnet"

// Circle's canonical USDC mints per cluster (no official testnet USDC).
const USDC_MINT: Record<typeof CLUSTER, string | null> = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  testnet: null,
}

export const SOLANA_TOKENS: TokenInfo[] = [
  { symbol: "SOL", name: "Solana", address: NATIVE_SENTINEL, decimals: 9 },
  ...(USDC_MINT[CLUSTER]
    ? [{ symbol: "USDC", name: "USD Coin", address: USDC_MINT[CLUSTER] as string, decimals: 6 }]
    : []),
]

export function findToken(nameOrSymbol: string): TokenInfo | undefined {
  const q = nameOrSymbol.trim().toLowerCase()
  return SOLANA_TOKENS.find(
    (t) => t.symbol.toLowerCase() === q || t.name.toLowerCase() === q,
  )
}

export function isNativeToken(token?: string): boolean {
  if (!token) return true
  const t = token.trim().toLowerCase()
  return t === "sol" || t === NATIVE_SENTINEL
}
