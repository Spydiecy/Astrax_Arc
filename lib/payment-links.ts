// Server-only payment-link logic.
//
// Each link gets a Solana Pay "reference": a random public key (no private key
// is kept). Whoever pays — via the pay page or by scanning the QR with a mobile
// wallet — includes that key in the transfer, so we can find the payment
// on-chain with getSignaturesForAddress(reference) and check that the recipient
// really received the amount. Nothing relies on the payer's browser reporting it.
import "server-only"
import { randomBytes } from "crypto"
import { Keypair, PublicKey } from "@solana/web3.js"
import { getConnection, NATIVE_SYMBOL, explorerTx, MAX_TX_VERSION } from "./solana"
import { toBaseUnits, SOL_DECIMALS } from "./spl"
import {
  insertPaymentLink,
  getPaymentLink,
  markPaymentLinkPaid,
  type PaymentLinkRow,
} from "./db"

export const MAX_DESCRIPTION = 140

// Links are stored domain-free; the full URL is built from the domain the
// request came in on (see lib/origin.ts), so the same link works on any host.
export const paymentLinkPath = (id: string) => `/pay/${id}`
export const paymentLinkUrl = (id: string, origin: string) => `${origin}${paymentLinkPath(id)}`

/** Fields that are safe to show anyone who has the link. */
export function publicLink(l: PaymentLinkRow, origin: string) {
  return {
    id: l.id,
    path: paymentLinkPath(l.id),
    url: paymentLinkUrl(l.id, origin),
    recipient: l.recipient,
    amount: l.amount,
    token: l.token,
    description: l.description,
    reference: l.reference,
    status: l.status,
    paidSignature: l.paid_signature,
    paidExplorerUrl: l.paid_signature ? explorerTx(l.paid_signature) : null,
    payer: l.payer,
    paidAt: l.paid_at,
    createdAt: l.created_at,
  }
}
export type PublicPaymentLink = ReturnType<typeof publicLink>

export async function createPaymentLink(input: { owner: string; amount: string; description?: string }): Promise<PaymentLinkRow> {
  const id = `pl_${randomBytes(6).toString("hex")}`
  const row = {
    id,
    owner: input.owner,
    recipient: input.owner, // payments go to the owner's address
    amount: input.amount,
    token: NATIVE_SYMBOL,
    description: (input.description || "").trim().slice(0, MAX_DESCRIPTION),
    reference: Keypair.generate().publicKey.toBase58(),
  }
  await insertPaymentLink(row)
  const saved = await getPaymentLink(id)
  if (!saved) throw new Error("Payment link wasn't saved.")
  return saved
}

// Don't hit the RPC for the same link more than once every few seconds
// (the pay page polls while it's open). In-memory: per server instance.
const lastChecked = new Map<string, number>()
const CHECK_INTERVAL_MS = 4000

/**
 * If the link is still open, look for a confirmed transaction that carries its
 * reference key and paid the recipient at least the requested amount; if found,
 * mark it paid. Returns the (possibly updated) row.
 */
export async function verifyPaymentLink(link: PaymentLinkRow): Promise<PaymentLinkRow> {
  if (link.status !== "open") return link
  const now = Date.now()
  if (now - (lastChecked.get(link.id) ?? 0) < CHECK_INTERVAL_MS) return link
  lastChecked.set(link.id, now)

  const connection = getConnection()
  const expected = toBaseUnits(link.amount, SOL_DECIMALS)
  let sigs
  try {
    sigs = await connection.getSignaturesForAddress(new PublicKey(link.reference), { limit: 10 }, "confirmed")
  } catch {
    return link // RPC hiccup — try again on the next check
  }
  // Oldest first, so the first qualifying payment is the one recorded.
  for (const s of sigs.filter((x) => !x.err).reverse()) {
    try {
      const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: "confirmed" })
      if (!tx?.meta || tx.meta.err) continue
      const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58())
      const i = keys.indexOf(link.recipient)
      if (i < 0) continue
      // Links are only payable by other people: a transfer the owner paid
      // (fee payer = recipient) never counts as the link being paid.
      if (keys[0] === link.recipient || keys[0] === link.owner) continue
      const received = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i])
      if (received < expected) continue
      const paidAt = (s.blockTime ?? Math.floor(now / 1000)) * 1000
      await markPaymentLinkPaid(link.id, s.signature, keys[0], paidAt)
      return (await getPaymentLink(link.id)) ?? link
    } catch {
      /* skip unreadable tx */
    }
  }
  return link
}
