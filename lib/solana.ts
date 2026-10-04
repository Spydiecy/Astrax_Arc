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

// ── Explorer link helpers ─────────────────────────────────────────────────────
const clusterQuery = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`
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

// Devnet mints. USDC-Dev is Circle's canonical devnet mint.
export const SOLANA_TOKENS: TokenInfo[] = [
  { symbol: "SOL", name: "Solana", address: NATIVE_SENTINEL, decimals: 9 },
  { symbol: "USDC", name: "USD Coin (Dev)", address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", decimals: 6 },
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
