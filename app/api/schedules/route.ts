import { NextResponse, after } from "next/server"
import { maybeRunDueSchedules } from "@/lib/scheduler"
import { listSchedulesByOwner, cancelSchedule } from "@/lib/db"
import { NATIVE_SYMBOL, addrKey, explorerTx, isValidAddress, resolveNetwork } from "@/lib/arc"
import { isOwner, NOT_OWNER } from "@/lib/auth"

export const runtime = "nodejs"

// List a user's scheduled payments on one network (`?network=mainnet|testnet`).
// Never returns the encrypted key.
// Only for an address this browser has verified it owns (see lib/auth.ts).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const owner = url.searchParams.get("owner") || ""
  const network = resolveNetwork(url.searchParams.get("network"))
  if (!isValidAddress(owner)) return NextResponse.json({ schedules: [] })
  if (!isOwner(req, owner)) return NextResponse.json(NOT_OWNER, { status: 401 })
  after(() => maybeRunDueSchedules())
  const rows = (await listSchedulesByOwner(addrKey(owner), network.key)).map((r) => ({
    id: r.id,
    recipient: r.recipient,
    amount: r.amount,
    token: r.token || NATIVE_SYMBOL,
    nextRun: r.next_run,
    intervalSecs: r.interval_secs,
    remaining: r.remaining,
    status: r.status,
    lastTx: r.last_tx,
    lastTxUrl: r.last_tx ? explorerTx(network, r.last_tx) : null,
    note: r.note,
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
  return NextResponse.json({ ok: await cancelSchedule(id, addrKey(owner)) })
}
