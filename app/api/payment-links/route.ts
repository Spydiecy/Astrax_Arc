import { NextResponse } from "next/server"
import { listPaymentLinksByOwner, cancelPaymentLink } from "@/lib/db"
import { publicLink, verifyPaymentLink } from "@/lib/payment-links"
import { isValidAddress } from "@/lib/solana"
import { requestOrigin } from "@/lib/origin"
import { isOwner, NOT_OWNER } from "@/lib/auth"

export const runtime = "nodejs"

// List an owner's payment links. `?check=1` also re-checks the chain for open
// links (newest 10) so the list reflects payments made via QR / other devices.
// Only for an address this browser has verified it owns (see lib/auth.ts).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const owner = url.searchParams.get("owner") || ""
  if (!isValidAddress(owner)) return NextResponse.json({ links: [] })
  if (!isOwner(req, owner)) return NextResponse.json(NOT_OWNER, { status: 401 })
  let rows = await listPaymentLinksByOwner(owner)
  if (url.searchParams.get("check") === "1") {
    const open = rows.filter((r) => r.status === "open").slice(0, 10)
    const updated = new Map((await Promise.all(open.map(verifyPaymentLink))).map((r) => [r.id, r]))
    rows = rows.map((r) => updated.get(r.id) ?? r)
  }
  const origin = requestOrigin(req)
  return NextResponse.json({ links: rows.map((r) => publicLink(r, origin)) })
}

// Cancel an open link (owner-scoped).
export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id") || ""
  const owner = url.searchParams.get("owner") || ""
  if (!id || !isValidAddress(owner)) return NextResponse.json({ ok: false }, { status: 400 })
  if (!isOwner(req, owner)) return NextResponse.json({ ok: false, ...NOT_OWNER }, { status: 401 })
  return NextResponse.json({ ok: await cancelPaymentLink(id, owner) })
}
