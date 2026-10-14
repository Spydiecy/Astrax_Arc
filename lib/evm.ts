// EVM helpers shared by the agent route, the scheduler and the browser:
// amounts, ABIs, prepared-transaction shapes, token resolution and signing.
// Isomorphic: no secrets, but the signing helpers are only ever called server-side.
import {
  formatUnits,
  parseAbi,
  parseUnits,
  encodeFunctionData,
  toHex,
  type Abi,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem"
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts"
import { createWalletClient } from "viem"
import {
  arcTransport,
  findToken,
  isValidAddress,
  normalizeAddress,
  NATIVE_DECIMALS,
  NATIVE_SYMBOL,
  USDC_ADDRESS,
  USDC_DECIMALS,
  type ArcNetwork,
} from "./arc"
import { ASTRAX_NFT_ABI, ASTRAX_NFT_BYTECODE, ASTRAX_TOKEN_ABI, ASTRAX_TOKEN_BYTECODE } from "./contracts"

// ── ABIs ──────────────────────────────────────────────────────────────────────
export const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function owner() view returns (address)",
  "function mint(address to, uint256 amount)",
])

export const ERC721_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
])

// ── Amounts ───────────────────────────────────────────────────────────────────
/** Convert a decimal string ("1.5") into integer base units without float drift. */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const str = String(amount).trim()
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount "${amount}"`)
  const frac = str.split(".")[1] ?? ""
  if (frac.length > decimals) throw new Error(`Too many decimal places (this token supports ${decimals}).`)
  return parseUnits(str, decimals)
}

/** 18-decimal native value for a USDC amount (at most 6 decimals, like the ERC-20 view). */
export function toNativeValue(amount: string | number): bigint {
  const str = String(amount).trim()
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount "${amount}"`)
  if ((str.split(".")[1] ?? "").length > USDC_DECIMALS) throw new Error(`USDC supports at most ${USDC_DECIMALS} decimal places.`)
  return parseUnits(str, NATIVE_DECIMALS)
}

/** Format base units, trimming trailing zeros but keeping at least `min` decimals. */
export function formatAmount(value: bigint, decimals: number, maxDecimals = 6): string {
  const s = formatUnits(value, decimals)
  const [whole, frac = ""] = s.split(".")
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole
}

/** Fixed-decimals display for balance cards. */
export function formatFixed(value: bigint, decimals: number, places = 4): string {
  const s = formatUnits(value, decimals)
  const [whole, frac = ""] = s.split(".")
  return places > 0 ? `${whole}.${(frac + "0".repeat(places)).slice(0, places)}` : whole
}

// ── Prepared transactions ────────────────────────────────────────────────────
/** JSON-safe transaction request. The server prepares it; the browser wallet signs it. */
export interface PreparedTx {
  to: `0x${string}`
  data?: Hex
  /** Wei (18-decimals native USDC) as a decimal string. */
  value?: string
}

export interface ResolvedToken {
  address: `0x${string}`
  decimals: number
  symbol: string
}

/** Resolve a symbol or contract address to an ERC-20 (reading on-chain for unknown ones). */
export async function resolveToken(
  network: ArcNetwork,
  client: PublicClient,
  token: string,
): Promise<ResolvedToken | { error: string }> {
  const known = findToken(network, token)
  if (known) return { address: known.address, decimals: known.decimals, symbol: known.symbol }
  if (!isValidAddress(token)) return { error: `Unknown token: ${token}` }
  const address = normalizeAddress(token)
  try {
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }).catch(() => `${address.slice(0, 6)}…`),
    ])
    return { address, decimals: Number(decimals), symbol: String(symbol) }
  } catch {
    return { error: `${address} isn't an ERC-20 token on ${network.name}.` }
  }
}

export function buildTokenTransfer(token: ResolvedToken, to: string, amount: string): PreparedTx {
  const units = toBaseUnits(amount, token.decimals)
  if (units <= 0n) throw new Error("Amount must be greater than zero")
  return {
    to: token.address,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [normalizeAddress(to), units] }),
    value: "0",
  }
}

export function buildMint(token: `0x${string}`, to: string, amount: string, decimals: number): PreparedTx {
  const units = toBaseUnits(amount, decimals)
  if (units <= 0n) throw new Error("Amount must be greater than zero")
  return {
    to: token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: "mint", args: [normalizeAddress(to), units] }),
    value: "0",
  }
}

/** Native USDC transfer (the gas token), sent as transaction value in 18-decimal units. */
export function buildNativeTransfer(to: string, amount: string, data?: Hex): PreparedTx {
  const value = toNativeValue(amount)
  if (value <= 0n) throw new Error("Amount must be greater than zero")
  return { to: normalizeAddress(to), value: value.toString(), ...(data ? { data } : {}) }
}

/** The same USDC balance, moved through its 6-decimal ERC-20 interface. */
export const USDC_TOKEN: ResolvedToken = { address: USDC_ADDRESS, decimals: USDC_DECIMALS, symbol: NATIVE_SYMBOL }

// ── Contract deployment ──────────────────────────────────────────────────────
export interface DeployRequest {
  abi: Abi
  bytecode: Hex
  args: readonly unknown[]
}

export const MAX_DECIMALS = 18

export function buildDeployToken(p: { name: string; symbol: string; decimals: number; supply: string }): DeployRequest {
  if (!/^\d+$/.test(p.supply)) throw new Error("Supply must be a whole number of tokens.")
  return {
    abi: ASTRAX_TOKEN_ABI as unknown as Abi,
    bytecode: ASTRAX_TOKEN_BYTECODE,
    args: [p.name.slice(0, 64), p.symbol.slice(0, 16), p.decimals, BigInt(p.supply)],
  }
}

export function buildDeployNFT(p: { name: string; symbol: string; uri: string }): DeployRequest {
  return {
    abi: ASTRAX_NFT_ABI as unknown as Abi,
    bytecode: ASTRAX_NFT_BYTECODE,
    args: [p.name.slice(0, 64), p.symbol.slice(0, 16), p.uri],
  }
}

// ── Signing (server-side, autonomous mode and the scheduler) ───────────────────
/** Accepts a 64-hex-character private key, with or without the 0x prefix. */
export function normalizePrivateKey(secret: string): `0x${string}` {
  const s = secret.trim()
  const hex = s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Private key must be 64 hex characters.")
  return `0x${hex.toLowerCase()}`
}

export function accountFromSecret(secret: string): PrivateKeyAccount {
  return privateKeyToAccount(normalizePrivateKey(secret))
}

/** Derive an address from a private key; null if the key is empty or invalid. */
export function addressFromSecret(secret: string): `0x${string}` | null {
  try {
    return secret.trim() ? accountFromSecret(secret).address : null
  } catch {
    return null
  }
}

export function makeWalletClient(network: ArcNetwork, account: PrivateKeyAccount): WalletClient {
  return createWalletClient({ account, chain: network.chain, transport: arcTransport(network) })
}

export class TxFailedError extends Error {
  constructor(public hash: Hex, message = "The transaction was mined but reverted.") {
    super(message)
  }
}

/** Send a prepared transaction, wait for the receipt and throw if it reverted. */
export async function sendPrepared(
  wallet: WalletClient,
  client: PublicClient,
  tx: PreparedTx,
): Promise<{ hash: Hex; blockNumber: bigint }> {
  const account = wallet.account!
  const hash = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : undefined,
  })
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
  if (receipt.status !== "success") throw new TxFailedError(hash)
  return { hash, blockNumber: receipt.blockNumber }
}

export async function deployPrepared(
  wallet: WalletClient,
  client: PublicClient,
  req: DeployRequest,
): Promise<{ hash: Hex; address: `0x${string}` }> {
  const hash = await wallet.deployContract({
    account: wallet.account!,
    chain: wallet.chain,
    abi: req.abi,
    bytecode: req.bytecode,
    args: req.args,
  })
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
  if (receipt.status !== "success" || !receipt.contractAddress) throw new TxFailedError(hash, "Deployment reverted.")
  return { hash, address: receipt.contractAddress }
}

/** Deploy from encoded creation calldata (bytecode + constructor args). */
export async function deployData(
  wallet: WalletClient,
  client: PublicClient,
  data: Hex,
): Promise<{ hash: Hex; address: `0x${string}` }> {
  const hash = await wallet.sendTransaction({ account: wallet.account!, chain: wallet.chain, data })
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 })
  if (receipt.status !== "success" || !receipt.contractAddress) throw new TxFailedError(hash, "Deployment reverted.")
  return { hash, address: receipt.contractAddress }
}

// ── Errors ────────────────────────────────────────────────────────────────────
/** Turn raw viem / RPC errors into a short, accurate reason so the model doesn't guess. */
export function friendlyError(e: unknown, network: ArcNetwork): string {
  const err = e as { shortMessage?: string; message?: string; details?: string; cause?: { message?: string } }
  const msg = String(err?.shortMessage || err?.message || e || "unknown error")
  const all = `${msg} ${err?.details ?? ""} ${err?.cause?.message ?? ""}`
  if (/insufficient funds for gas|exceeds the balance|insufficient funds/i.test(all))
    return `Not enough USDC on ${network.name} to cover the amount plus the network fee.${
      network.faucetUrl ? ` Get test USDC at ${network.faucetUrl}.` : ""
    }`
  if (/transfer amount exceeds balance|InsufficientBalance|ERC20: transfer amount/i.test(all))
    return "Not enough tokens in the signing wallet for this transfer."
  if (/NotOwner|caller is not the owner|Ownable/i.test(all)) return "The signing wallet isn't the owner of this token, so it can't mint more."
  if (/underpriced|fee cap less than/i.test(all)) return "The network fee was below Arc's 20 gwei minimum. Try again in a moment."
  if (/Zero address not allowed|ZeroAddress/i.test(all)) return "Arc doesn't allow sending to the zero address."
  if (/blocklist|blacklist/i.test(all)) return "One of the addresses is blocklisted on Arc, so the transfer is refused."
  if (/User rejected|denied transaction|rejected the request/i.test(all)) return "The request was declined in the wallet."
  if (/timed out|timeout|Timed out/i.test(all)) return "The network didn't confirm in time. Check the explorer before retrying."
  if (/429|rate limit|Too Many Requests/i.test(all)) return `The ${network.name} RPC is rate-limiting requests right now. Try again in a moment.`
  if (e instanceof TxFailedError) return "The transaction was mined but reverted on-chain."
  return msg.split("\n")[0].slice(0, 160)
}

export interface RawLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
}

/** eth_getLogs with raw topic filters (viem's getLogs only takes decoded events). */
export async function getRawLogs(
  client: PublicClient,
  p: { address: string; fromBlock: bigint; toBlock: bigint; topics: (string | null)[] },
): Promise<RawLog[]> {
  return (await client.request({
    method: "eth_getLogs",
    params: [{ address: p.address as `0x${string}`, fromBlock: toHex(p.fromBlock), toBlock: toHex(p.toBlock), topics: p.topics as Hex[] }],
  })) as unknown as RawLog[]
}
