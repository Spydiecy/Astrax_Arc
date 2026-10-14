// Shared chain registry, viem clients, token list and helpers for Astrax.
// Safe to import from both server (API routes) and client components: it holds
// no secrets and uses no node-only APIs.
//
// Arc is an EVM Layer-1 whose native gas token is USDC. Two networks are
// supported and can be switched at runtime (see contexts/NetworkContext.tsx):
//   • Arc Mainnet  (chain id 5042)     real USDC
//   • Arc Testnet  (chain id 5042002)  free test USDC from https://faucet.circle.com
import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  http,
  isAddress,
  type Chain,
  type PublicClient,
  type Transport,
} from "viem"

export type NetworkKey = "mainnet" | "testnet"

export interface TokenInfo {
  symbol: string
  name: string
  /** ERC-20 contract address. */
  address: `0x${string}`
  decimals: number
}

/** Chain ids of the two Arc networks (5042 = Mainnet, 5042002 = Testnet). */
export type ArcChainId = 5042 | 5042002

export interface ArcNetwork {
  key: NetworkKey
  chain: Chain
  id: ArcChainId
  /** "Arc Mainnet" */
  name: string
  /** "Mainnet" */
  label: string
  badge: "LIVE" | "TEST"
  isTestnet: boolean
  rpcUrls: string[]
  explorerUrl: string
  /** Blockscout REST API (address history). Best-effort: may be bot-protected. */
  explorerApi: string
  tokens: TokenInfo[]
  faucetUrl?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────
/** Arc's gas token. Native accounting uses 18 decimals; the ERC-20 view uses 6. */
export const NATIVE_SYMBOL = "USDC"
export const NATIVE_DECIMALS = 18
export const USDC_DECIMALS = 6
/** ERC-20 interface of native USDC (same address on both networks). */
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const
/** Arc's mempool silently drops transactions with maxFeePerGas below 20 gwei. */
export const MIN_FEE_PER_GAS = 20_000_000_000n
/** `eth_getLogs` is limited to 10,000 blocks per call on Arc's public RPC. */
export const MAX_LOG_RANGE = 9_999n
/** Emitter of EIP-7708 Transfer logs for native USDC movements. */
export const SYSTEM_EMITTER = "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE" as const
export const NATIVE_SENTINEL = "native"
export const CIRCLE_FAUCET_URL = "https://faucet.circle.com"

// ── RPC endpoints ─────────────────────────────────────────────────────────────
// NEXT_PUBLIC_* values must be read as literal `process.env.X` expressions so
// Next.js inlines them into the browser bundle.
function parseRpcUrls(raw: string | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    try {
      const u = new URL(part)
      if (u.protocol === "https:" || u.protocol === "http:") out.push(part)
    } catch {
      /* ignore malformed entries */
    }
  }
  return out
}

function rpcList(override: string | undefined, defaults: string[]): string[] {
  return [...new Set([...parseRpcUrls(override), ...defaults])]
}

// Your own endpoints (NEXT_PUBLIC_ARC_*_RPC_URL, e.g. Infura or QuickNode URLs with your
// key) are tried first. After them come Circle's primary endpoint and the keyless public
// endpoints of its node partners (Blockdaemon, dRPC, QuickNode), so one blocked or
// rate-limited RPC never takes the app down.
const MAINNET_RPCS = rpcList(process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL, [
  "https://rpc.mainnet.arc.io",
  "https://rpc.blockdaemon.mainnet.arc.io",
  "https://rpc.drpc.mainnet.arc.io",
  "https://rpc.quicknode.mainnet.arc.io",
])
const TESTNET_RPCS = rpcList(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL, [
  "https://rpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io",
  "https://rpc.testnet.arc.network",
])

// ── Chains ────────────────────────────────────────────────────────────────────
/**
 * EIP-1559 fees for Arc. The mempool silently drops transactions whose
 * maxFeePerGas is under 20 gwei, and a default estimate can land below that
 * right after a fee drop, so the floor is enforced here. Only the actual base
 * fee + tip is charged; the 2x headroom just survives fee changes.
 */
export async function estimateArcFees(client: { request: (args: { method: "eth_gasPrice" }) => Promise<unknown> }) {
  let gasPrice: bigint
  try {
    gasPrice = BigInt((await client.request({ method: "eth_gasPrice" })) as string)
  } catch {
    // The fee quote is a convenience: if every RPC is unreachable right now, assume a
    // normal Arc price (20-25 gwei) rather than failing a transaction that is otherwise fine.
    gasPrice = 30_000_000_000n
  }
  const tip = 1_000_000_000n
  const base = gasPrice > MIN_FEE_PER_GAS ? gasPrice : MIN_FEE_PER_GAS
  return { maxFeePerGas: base * 2n + tip, maxPriorityFeePerGas: tip }
}

const feeOverrides: Chain["fees"] = {
  estimateFeesPerGas: async ({ client }) => estimateArcFees(client as never),
}

const nativeCurrency = { name: "USDC", symbol: "USDC", decimals: 18 } as const

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency,
  rpcUrls: { default: { http: MAINNET_RPCS } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  fees: feeOverrides,
  testnet: false,
})

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency,
  rpcUrls: { default: { http: TESTNET_RPCS } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
  fees: feeOverrides,
  testnet: true,
})

// ── Known tokens (addresses from Circle's Arc docs, verified on-chain) ──────────
const MAINNET_TOKENS: TokenInfo[] = [
  { symbol: "USDC", name: "USD Coin", address: USDC_ADDRESS, decimals: 6 },
  { symbol: "EURC", name: "Euro Coin", address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", decimals: 6 },
  { symbol: "USYC", name: "US Yield Coin", address: "0x8a5D989Bbb96929F689B0200f435f53dA42bF490", decimals: 6 },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB", decimals: 18 },
]
const TESTNET_TOKENS: TokenInfo[] = [
  { symbol: "USDC", name: "USD Coin", address: USDC_ADDRESS, decimals: 6 },
  { symbol: "EURC", name: "Euro Coin", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6 },
  { symbol: "USYC", name: "US Yield Coin", address: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C", decimals: 6 },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", decimals: 8 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0x2c4047028a72803939b6fb674D01bC059B5C4961", decimals: 18 },
]

// ── Registry ──────────────────────────────────────────────────────────────────
export const ARC_NETWORKS: Record<NetworkKey, ArcNetwork> = {
  mainnet: {
    key: "mainnet",
    chain: arcMainnet,
    id: arcMainnet.id,
    name: "Arc Mainnet",
    label: "Mainnet",
    badge: "LIVE",
    isTestnet: false,
    rpcUrls: MAINNET_RPCS,
    explorerUrl: arcMainnet.blockExplorers.default.url,
    explorerApi: `${arcMainnet.blockExplorers.default.url}/api/v2`,
    tokens: MAINNET_TOKENS,
  },
  testnet: {
    key: "testnet",
    chain: arcTestnet,
    id: arcTestnet.id,
    name: "Arc Testnet",
    label: "Testnet",
    badge: "TEST",
    isTestnet: true,
    rpcUrls: TESTNET_RPCS,
    explorerUrl: arcTestnet.blockExplorers.default.url,
    explorerApi: `${arcTestnet.blockExplorers.default.url}/api/v2`,
    tokens: TESTNET_TOKENS,
    faucetUrl: CIRCLE_FAUCET_URL,
  },
}

export const ARC_NETWORK_LIST: ArcNetwork[] = [ARC_NETWORKS.mainnet, ARC_NETWORKS.testnet]

/**
 * Network a fresh visitor lands on. Testnet unless overridden, so nobody touches
 * real funds by accident. Returning users keep their last choice (see NetworkContext).
 */
export const DEFAULT_NETWORK_KEY: NetworkKey =
  process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "mainnet" ? "mainnet" : "testnet"

export function isNetworkKey(v: unknown): v is NetworkKey {
  return v === "mainnet" || v === "testnet"
}

/** Resolve a user/API-supplied value to a network, falling back to the default. */
export function resolveNetwork(v?: unknown): ArcNetwork {
  return ARC_NETWORKS[isNetworkKey(v) ? v : DEFAULT_NETWORK_KEY]
}

export function networkByChainId(id?: number | null): ArcNetwork | undefined {
  return ARC_NETWORK_LIST.find((n) => n.id === id)
}

// ── Clients ───────────────────────────────────────────────────────────────────
// The public endpoints rate-limit bursts (Mainnet more than Testnet), so
// concurrent reads are folded into JSON-RPC batches. Batches are capped at 25
// because the endpoints answer at most 30 calls per batch.
export const RPC_BATCH_SIZE = 25

function rpcHttp(url: string, retryCount: number) {
  return http(url, {
    batch: { batchSize: RPC_BATCH_SIZE, wait: 20 },
    retryCount,
    retryDelay: 250,
    timeout: 10_000,
  })
}

/**
 * With several endpoints, a failing one is skipped after a single retry and the next is
 * tried straight away (a dead endpoint costs well under a second, not several).
 */
export function arcTransport(network: ArcNetwork): Transport {
  if (network.rpcUrls.length === 1) return rpcHttp(network.rpcUrls[0], 4)
  return fallback(network.rpcUrls.map((u) => rpcHttp(u, 1)), { retryCount: 2, retryDelay: 250 })
}

const clients = new Map<NetworkKey, PublicClient>()
export function getPublicClient(network: ArcNetwork | NetworkKey = DEFAULT_NETWORK_KEY): PublicClient {
  const n = typeof network === "string" ? ARC_NETWORKS[network] : network
  let c = clients.get(n.key)
  if (!c) {
    c = createPublicClient({ chain: n.chain, transport: arcTransport(n) }) as PublicClient
    clients.set(n.key, c)
  }
  return c
}

// ── Explorer links ────────────────────────────────────────────────────────────
export const explorerTx = (n: ArcNetwork, hash: string) => `${n.explorerUrl}/tx/${hash}`
export const explorerAddress = (n: ArcNetwork, addr: string) => `${n.explorerUrl}/address/${addr}`
export const explorerBlock = (n: ArcNetwork, block: string | number | bigint) => `${n.explorerUrl}/block/${block}`
export const explorerToken = (n: ArcNetwork, addr: string) => `${n.explorerUrl}/token/${addr}`

export const shortAddr = (a?: string | null) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

// ── Addresses ─────────────────────────────────────────────────────────────────
const ZERO = "0x0000000000000000000000000000000000000000"

/** Valid EVM address (checksummed if mixed-case, any case accepted if lowercase). */
export function isValidAddress(value?: string | null): value is `0x${string}` {
  if (!value || typeof value !== "string") return false
  return isAddress(value.trim(), { strict: false })
}

/** Normalises to the EIP-55 checksummed form. Throws on an invalid address. */
export function normalizeAddress(value: string): `0x${string}` {
  return getAddress(value.trim())
}

/** Arc rejects value transfers to the zero address, so never offer it as a recipient. */
export function isSendableAddress(value?: string | null): value is `0x${string}` {
  return isValidAddress(value) && value.trim().toLowerCase() !== ZERO
}

/** Lower-cased form used for storing/comparing owners. */
export const addrKey = (a: string) => a.trim().toLowerCase()

export function isTxHash(v?: string | null): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)
}

// ── Tokens ────────────────────────────────────────────────────────────────────
export function findToken(network: ArcNetwork, nameOrSymbolOrAddress: string): TokenInfo | undefined {
  const q = nameOrSymbolOrAddress.trim().toLowerCase()
  return network.tokens.find(
    (t) => t.symbol.toLowerCase() === q || t.name.toLowerCase() === q || t.address.toLowerCase() === q,
  )
}

/** True when the user means Arc's native gas asset (USDC). */
export function isNativeToken(token?: string): boolean {
  if (!token) return true
  const t = token.trim().toLowerCase()
  return t === "usdc" || t === NATIVE_SENTINEL || t === USDC_ADDRESS.toLowerCase()
}
