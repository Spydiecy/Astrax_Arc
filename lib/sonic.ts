// Shared Sonic Testnet config, viem clients, ABIs and helpers for Astrax.
// Safe to import from both server (API route) and client components — it contains
// no secrets and no node-only APIs.
import { createPublicClient, http, defineChain } from "viem"

// ── Chain ───────────────────────────────────────────────────────────────────
export const NATIVE_SYMBOL = "S"
export const CHAIN_ID = 14601
export const RPC_URL = process.env.SONIC_RPC_URL || "https://rpc.testnet.soniclabs.com"
export const EXPLORER_URL = "https://explorer.testnet.soniclabs.com"
export const BLOCKSCOUT_API = `${EXPLORER_URL}/api/v2`

export const sonicTestnet = defineChain({
  id: CHAIN_ID,
  name: "Sonic Testnet",
  nativeCurrency: { name: "Sonic", symbol: NATIVE_SYMBOL, decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Sonic Explorer", url: EXPLORER_URL },
  },
  testnet: true,
})

export function getPublicClient() {
  return createPublicClient({ chain: sonicTestnet, transport: http(RPC_URL) })
}

// ── Explorer link helpers ─────────────────────────────────────────────────────
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`
export const explorerBlock = (block: string | number) => `${EXPLORER_URL}/block/${block}`

export const shortAddr = (a?: string) =>
  a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || ""

// ── ERC-20 minimal ABI ─────────────────────────────────────────────────────────
export const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const

// ── Curated Sonic Testnet token list (used by the token-list tool & cards) ──────
// `S` is the native gas token (sentinel address). Others are real testnet ERC-20s.
export const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

export interface TokenInfo {
  symbol: string
  name: string
  address: string
  decimals: number
}

// Note: this testnet is periodically reset, so only the native token is guaranteed.
// Add verified ERC-20s here (symbol/name/address/decimals) as they're deployed.
export const SONIC_TOKENS: TokenInfo[] = [
  { symbol: "S", name: "Sonic", address: NATIVE_SENTINEL, decimals: 18 },
]

export function findToken(nameOrSymbol: string): TokenInfo | undefined {
  const q = nameOrSymbol.trim().toLowerCase()
  return SONIC_TOKENS.find(
    (t) => t.symbol.toLowerCase() === q || t.name.toLowerCase() === q,
  )
}
