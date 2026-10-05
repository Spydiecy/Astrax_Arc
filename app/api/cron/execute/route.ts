import { createHash, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { runDueSchedules } from "@/lib/scheduler"

export const runtime = "nodejs"
export const maxDuration = 60

// Runs due scheduled payments right away. Called by Vercel Cron (vercel.json),
// which sends CRON_SECRET automatically. Protected by CRON_SECRET in production;
// open in dev. Opportunistic runs from app traffic go through /api/scheduler/tick.

const sha = (s: string) => createHash("sha256").update(s).digest()

function authorized(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true
  const secret = process.env.CRON_SECRET
  // Refuse to run with a missing or guessable secret.
  if (!secret || secret.length < 32) return false
  const header = req.headers.get("authorization") || req.headers.get("x-cron-secret") || ""
  const given = header.startsWith("Bearer ") ? header.slice(7) : header
  // Constant-time compare (hashing first makes the lengths equal).
  return timingSafeEqual(sha(given), sha(secret))
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await runDueSchedules())
}

export async function POST(req: Request) {
  return GET(req)
}
