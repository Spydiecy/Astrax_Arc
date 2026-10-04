import { NextResponse } from "next/server"
import { PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import { getMint } from "@solana/spl-token"
import { getConnection, NATIVE_SYMBOL, NATIVE_DECIMALS, findToken, NATIVE_SENTINEL, isNativeToken } from "@/lib/solana"
import { keypairFromSecret, buildSolTransfer, buildTokenTransfer } from "@/lib/spl"
import { getDueSchedules, updateAfterRun, clearKey } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export const runtime = "nodejs"
export const maxDuration = 60

const connection = getConnection()

// Runs due scheduled payments. Protected by CRON_SECRET in production; open in dev
// so the in-app poller can trigger it locally.
async function run() {
  const now = Date.now()
  const due = getDueSchedules(now)
  const results: any[] = []

  for (const job of due) {
    try {
      if (!job.enc_key) {
        updateAfterRun(job.id, { status: "failed", note: "missing key" })
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
        const decimals = info?.decimals ?? (await getMint(connection, mint)).decimals
        const tx = await buildTokenTransfer(connection, keypair.publicKey, recipient, mint, job.amount, decimals)
        sig = await sendAndConfirmTransaction(connection, tx, [keypair])
      }

      const remaining = job.remaining - 1
      if (job.interval_secs > 0 && remaining > 0) {
        updateAfterRun(job.id, { remaining, next_run: now + job.interval_secs * 1000, last_tx: sig })
      } else {
        updateAfterRun(job.id, { remaining: Math.max(0, remaining), status: "done", last_tx: sig })
        clearKey(job.id) // wipe the stored key once there are no runs left
      }
      results.push({ id: job.id, hash: sig, remaining })
    } catch (e: any) {
      updateAfterRun(job.id, { status: "failed", note: (e?.message || "error").slice(0, 160) })
      results.push({ id: job.id, error: e?.message })
    }
  }

  return { ran: results.length, results, at: new Date(now).toISOString(), symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS }
}

function authorized(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get("authorization") || req.headers.get("x-cron-secret") || ""
  return auth === `Bearer ${secret}` || auth === secret
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await run())
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(await run())
}
