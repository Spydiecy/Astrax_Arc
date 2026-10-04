import { NextResponse } from "next/server"
import { getPaymentLink } from "@/lib/db"
import { publicLink, verifyPaymentLink } from "@/lib/payment-links"
import { requestOrigin } from "@/lib/origin"

export const runtime = "nodejs"

// Public details for the pay page. `?check=1` looks on-chain for the payment
// (throttled server-side), so the page can poll while it's open.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^pl_[0-9a-f]{12}$/.test(id)) return NextResponse.json({ error: "Invalid link." }, { status: 400 })
  let link = getPaymentLink(id)
  if (!link) return NextResponse.json({ error: "Payment link not found." }, { status: 404 })
  if (new URL(req.url).searchParams.get("check") === "1") link = await verifyPaymentLink(link)
  return NextResponse.json({ link: publicLink(link, requestOrigin(req)) })
}
