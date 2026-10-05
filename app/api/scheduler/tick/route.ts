import { NextResponse } from "next/server"
import { maybeRunDueSchedules } from "@/lib/scheduler"

export const runtime = "nodejs"
export const maxDuration = 60

// Public "heartbeat" from open Astrax tabs. Safe without a secret: it takes no
// input, only sends payments that are already due (each claimed once in the
// database), runs at most once per 30s across all servers, and reveals nothing.
export async function POST() {
  const res = await maybeRunDueSchedules()
  return NextResponse.json({ ok: true, ran: res ? res.ran : null }, { headers: { "cache-control": "no-store" } })
}
