import { createHash, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import { getConnection, findToken, NATIVE_SENTINEL, isNativeToken } from "@/lib/solana"
import { keypairFromSecret, getMintInfo, buildSolTransfer, buildTokenTransfer } from "@/lib/spl"
import { getDueSchedules, updateAfterRun, clearKey } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export const runtime = "nodejs"
export const maxDuration = 60

const connection = getConnection()

// Runs due scheduled payments. Protected by CRON_SECRET in production; open in dev
// so the in-app poller can trigger it locally.
async function run() {
  const now = Date.now()
  const due = await getDueSchedules(now)
  const results: any[] = []

  for (const job of due) {
    try {
      if (!job.enc_key) {
        await updateAfterRun(job.id, { status: "failed", note: "missing key" })
        continue
      }
      const secret = decryptSecret(job.enc_key)
      const keypair = keypairFromSecret(secret)
      const recipient = new PublicKey(job.recipient)

      let sig: string
      if (isNativeToken(job.token)) {
        const tx = await buildSolTransfer(connection, keypair.publicKey, recipient, job.amount)
        sig = await sendAndConfirmTransaction(connection, tx, [keypair])
      } else {
        const info = findToken(job.token)
        const mintStr = info?.address && info.address !== NATIVE_SENTINEL ? info.address : job.token
        const mint = new PublicKey(mintStr)
        const { programId, decimals } = await getMintInfo(connection, mint)
        const tx = await buildTokenTransfer(connection, keypair.publicKey, recipient, mint, job.amount, decimals, programId)
        sig = await sendAndConfirmTransaction(connection, tx, [keypair])
      }

      const remaining = job.remaining - 1
      if (job.interval_secs > 0 && remaining > 0) {
        await updateAfterRun(job.id, { remaining, next_run: now + job.interval_secs * 1000, last_tx: sig })
      } else {
        await updateAfterRun(job.id, { remaining: Math.max(0, remaining), status: "done", last_tx: sig })
        await clearKey(job.id) // wipe the stored key once there are no runs left
      }
      results.push({ id: job.id, hash: sig, remaining })
    } catch (e: any) {
      await updateAfterRun(job.id, { status: "failed", note: (e?.message || "error").slice(0, 160) })
      results.push({ id: job.id, error: e?.message })
    }
  }

  return { ran: results.length, results, at: new Date(now).toISOString() }
}

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
  return NextResponse.json(await run())
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await run())
}
