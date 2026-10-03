import { NextResponse } from "next/server"
import { createWalletClient, http, parseEther, parseUnits, isAddress, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sonicTestnet, getPublicClient, RPC_URL, NATIVE_SYMBOL, ERC20_ABI, findToken } from "@/lib/sonic"
import { getDueSchedules, updateAfterRun, clearKey } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

export const runtime = "nodejs"
export const maxDuration = 60

const publicClient = getPublicClient()

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
      const pk = decryptSecret(job.enc_key)
      const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex)
      const wallet = createWalletClient({ account, chain: sonicTestnet, transport: http(RPC_URL) })

      const isNative = !job.token || job.token.toUpperCase() === NATIVE_SYMBOL
      let hash: Hex
      if (isNative) {
        hash = await wallet.sendTransaction({ to: job.recipient as Hex, value: parseEther(job.amount) })
      } else {
        const info = findToken(job.token)
        const tokenAddr = (info?.address && isAddress(info.address) ? info.address : job.token) as Hex
        const decimals = info?.decimals ?? Number(await publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "decimals" }))
        hash = await wallet.writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "transfer", args: [job.recipient as Hex, parseUnits(job.amount, decimals)] })
      }

      const remaining = job.remaining - 1
      if (job.interval_secs > 0 && remaining > 0) {
        updateAfterRun(job.id, { remaining, next_run: now + job.interval_secs * 1000, last_tx: hash })
      } else {
        updateAfterRun(job.id, { remaining: Math.max(0, remaining), status: "done", last_tx: hash })
        clearKey(job.id) // wipe the stored key once there are no runs left
      }
      results.push({ id: job.id, hash, remaining })
    } catch (e: any) {
      updateAfterRun(job.id, { status: "failed", note: (e?.shortMessage || e?.message || "error").slice(0, 160) })
      results.push({ id: job.id, error: e?.shortMessage || e?.message })
    }
  }

  return { ran: results.length, results, at: new Date(now).toISOString() }
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
