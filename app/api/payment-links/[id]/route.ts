import { NextResponse } from "next/server"
import { getPaymentLink, rateLimited } from "@/lib/db"
import { publicLink, verifyPaymentLink, verifyPaymentLinkTx } from "@/lib/payment-links"
import { requestOrigin } from "@/lib/origin"
import { isTxHash } from "@/lib/arc"

export const runtime = "nodejs"

const validId = (id: string) => /^pl_[0-9a-f]{12}$/.test(id)

// Public details for the pay page. `?check=1` looks on-chain for the payment
// (throttled server-side), so the page can poll while it's open.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!validId(id)) return NextResponse.json({ error: "Invalid link." }, { status: 400 })
  let link = await getPaymentLink(id)
  if (!link) return NextResponse.json({ error: "Payment link not found." }, { status: 404 })
  if (new URL(req.url).searchParams.get("check") === "1") link = await verifyPaymentLink(link)
  return NextResponse.json({ link: publicLink(link, requestOrigin(req)) })
}

// The pay page reports the hash of the transaction it just sent. The server
// re-reads that transaction from the chain and only marks the link paid if it
// really paid the recipient the amount with this link's reference.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!validId(id)) return NextResponse.json({ error: "Invalid link." }, { status: 400 })
  const { hash } = await req.json().catch(() => ({}))
  if (!isTxHash(hash)) return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 })
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (await rateLimited(`paylink:${ip}`, 60_000, 30)) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 })
  }
  const link = await getPaymentLink(id)
  if (!link) return NextResponse.json({ error: "Payment link not found." }, { status: 404 })
  const updated = await verifyPaymentLinkTx(link, hash)
  return NextResponse.json({ link: publicLink(updated ?? link, requestOrigin(req)), matched: Boolean(updated && updated.status === "paid") })
}
