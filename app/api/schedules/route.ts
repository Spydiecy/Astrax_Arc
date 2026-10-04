import { NextResponse } from "next/server"
import { listSchedulesByOwner, cancelSchedule } from "@/lib/db"
import { NATIVE_SYMBOL, isValidAddress } from "@/lib/solana"
import { isOwner, NOT_OWNER } from "@/lib/auth"

export const runtime = "nodejs"

// List a user's scheduled payments (never returns the encrypted key).
// Only for an address this browser has verified it owns (see lib/auth.ts).
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner") || ""
  if (!isValidAddress(owner)) return NextResponse.json({ schedules: [] })
  if (!isOwner(req, owner)) return NextResponse.json(NOT_OWNER, { status: 401 })
  const rows = listSchedulesByOwner(owner).map((r) => ({
    id: r.id,
    recipient: r.recipient,
    amount: r.amount,
    token: r.token || NATIVE_SYMBOL,
    nextRun: r.next_run,
    intervalSecs: r.interval_secs,
    remaining: r.remaining,
    status: r.status,
    lastTx: r.last_tx,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ schedules: rows })
}

// Cancel a schedule (verified owner only).
export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id") || ""
  const owner = url.searchParams.get("owner") || ""
  if (!id || !isValidAddress(owner)) return NextResponse.json({ ok: false }, { status: 400 })
  if (!isOwner(req, owner)) return NextResponse.json({ ok: false, ...NOT_OWNER }, { status: 401 })
  return NextResponse.json({ ok: cancelSchedule(id, owner) })
}
