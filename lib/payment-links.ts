// Server-only payment-link logic.
//
// Each link gets a random 32-byte "reference". The payer's transaction is a plain
// native USDC transfer to the owner whose calldata is exactly that reference, so
// the payment can be tied to the link on-chain without any smart contract:
//   • the pay page reports the transaction hash right after sending, and
//   • otherwise the server scans recent USDC transfers to the recipient (EIP-7708
//     logs) for a transaction carrying the reference.
// Either way the server re-reads the transaction from the chain and checks the
// recipient, amount, reference and status itself; the browser's word is never trusted.
import "server-only"
import { randomBytes } from "crypto"
import { pad } from "viem"
import {
  MAX_LOG_RANGE,
  NATIVE_SYMBOL,
  SYSTEM_EMITTER,
  explorerTx,
  getPublicClient,
  resolveNetwork,
  addrKey,
  type ArcNetwork,
} from "./arc"
import { getRawLogs, toNativeValue } from "./evm"
import { insertPaymentLink, getPaymentLink, markPaymentLinkPaid, type PaymentLinkRow } from "./db"

export const MAX_DESCRIPTION = 140

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const

// Links are stored domain-free; the full URL is built from the domain the
// request came in on (see lib/origin.ts), so the same link works on any host.
export const paymentLinkPath = (id: string) => `/pay/${id}`
export const paymentLinkUrl = (id: string, origin: string) => `${origin}${paymentLinkPath(id)}`

/** Fields that are safe to show anyone who has the link. */
export function publicLink(l: PaymentLinkRow, origin: string) {
  const network = resolveNetwork(l.network)
  return {
    id: l.id,
    path: paymentLinkPath(l.id),
    url: paymentLinkUrl(l.id, origin),
    network: network.key,
    chainId: network.id,
    recipient: l.recipient,
    amount: l.amount,
    token: l.token,
    description: l.description,
    reference: l.reference,
    status: l.status,
    paidSignature: l.paid_signature,
    paidExplorerUrl: l.paid_signature ? explorerTx(network, l.paid_signature) : null,
    payer: l.payer,
    paidAt: l.paid_at,
    createdAt: l.created_at,
  }
}
export type PublicPaymentLink = ReturnType<typeof publicLink>

export async function createPaymentLink(input: {
  owner: string
  network: ArcNetwork
  amount: string
  description?: string
}): Promise<PaymentLinkRow> {
  const id = `pl_${randomBytes(6).toString("hex")}`
  let startBlock = 0
  try {
    startBlock = Number(await getPublicClient(input.network).getBlockNumber())
  } catch {
    /* without a start block we only rely on the reported transaction hash */
  }
  await insertPaymentLink({
    id,
    owner: addrKey(input.owner),
    network: input.network.key,
    recipient: input.owner, // payments go to the owner's address
    amount: input.amount,
    token: NATIVE_SYMBOL,
    description: (input.description || "").trim().slice(0, MAX_DESCRIPTION),
    reference: `0x${randomBytes(32).toString("hex")}`,
    start_block: startBlock,
  })
  const saved = await getPaymentLink(id)
  if (!saved) throw new Error("Payment link wasn't saved.")
  return saved
}

/**
 * Check one transaction against a link. Returns the payer and the time it was
 * mined if it is a successful, sufficient, reference-carrying payment.
 */
async function checkTransaction(
  link: PaymentLinkRow,
  hash: `0x${string}`,
): Promise<{ payer: string; paidAt: number } | null> {
  const network = resolveNetwork(link.network)
  const client = getPublicClient(network)
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ])
  if (receipt.status !== "success") return null
  if (!tx.to || tx.to.toLowerCase() !== link.recipient.toLowerCase()) return null
  if (tx.input.toLowerCase() !== link.reference.toLowerCase()) return null
  if (tx.value < toNativeValue(link.amount)) return null
  // Links are only payable by other people: a transfer the owner paid never counts.
  if (tx.from.toLowerCase() === link.owner.toLowerCase() || tx.from.toLowerCase() === link.recipient.toLowerCase()) return null
  const block = await client.getBlock({ blockNumber: receipt.blockNumber })
  return { payer: tx.from, paidAt: Number(block.timestamp) * 1000 }
}

async function settle(link: PaymentLinkRow, hash: `0x${string}`): Promise<PaymentLinkRow | null> {
  const hit = await checkTransaction(link, hash)
  if (!hit) return null
  await markPaymentLinkPaid(link.id, hash, hit.payer, hit.paidAt)
  return (await getPaymentLink(link.id)) ?? link
}

/** Verify a transaction hash the payer's browser reported. Returns the updated link, or null if it doesn't qualify. */
export async function verifyPaymentLinkTx(link: PaymentLinkRow, hash: `0x${string}`): Promise<PaymentLinkRow | null> {
  if (link.status !== "open") return link
  try {
    return await settle(link, hash)
  } catch {
    return null // not mined yet or RPC hiccup
  }
}

// Don't hit the RPC for the same link more than once every few seconds
// (the pay page polls while it's open). In-memory: per server instance.
const lastChecked = new Map<string, number>()
const CHECK_INTERVAL_MS = 4000
/** How many 9,999-block log windows (~83 min each on Arc) one check may scan. */
const MAX_WINDOWS = 3
const MAX_CANDIDATES = 15

/**
 * If the link is still open, look for a successful transfer to the recipient
 * that carries the link's reference; if found, mark it paid. Returns the
 * (possibly updated) row.
 */
export async function verifyPaymentLink(link: PaymentLinkRow): Promise<PaymentLinkRow> {
  if (link.status !== "open") return link
  const now = Date.now()
  if (now - (lastChecked.get(link.id) ?? 0) < CHECK_INTERVAL_MS) return link
  lastChecked.set(link.id, now)

  const network = resolveNetwork(link.network)
  const client = getPublicClient(network)
  const expected = toNativeValue(link.amount)
  try {
    const latest = await client.getBlockNumber()
    const floor = latest > MAX_LOG_RANGE * BigInt(MAX_WINDOWS) ? latest - MAX_LOG_RANGE * BigInt(MAX_WINDOWS) : 0n
    let from = BigInt(link.start_block) > floor ? BigInt(link.start_block) : floor
    const seen = new Set<string>()
    const candidates: `0x${string}`[] = []
    while (from <= latest && candidates.length < MAX_CANDIDATES) {
      const to = from + MAX_LOG_RANGE < latest ? from + MAX_LOG_RANGE : latest
      const logs = await getRawLogs(client, {
        address: SYSTEM_EMITTER,
        fromBlock: from,
        toBlock: to,
        // Transfer(from, to, value) with `to` = the link's recipient.
        topics: [TRANSFER_TOPIC, null, pad(link.recipient as `0x${string}`, { size: 32 }).toLowerCase()],
      })
      for (const log of logs) {
        const value = BigInt(log.data)
        if (value < expected || !log.transactionHash || seen.has(log.transactionHash)) continue
        seen.add(log.transactionHash)
        candidates.push(log.transactionHash as `0x${string}`)
      }
      from = to + 1n
    }
    for (const hash of candidates.slice(0, MAX_CANDIDATES)) {
      try {
        const updated = await settle(link, hash)
        if (updated) return updated
      } catch {
        /* skip unreadable tx */
      }
    }
  } catch {
    /* RPC hiccup; try again on the next check */
  }
  return link
}
