// Server-only runner for scheduled payments.
//
// Serverless functions only run when something calls them, so due payments are
// picked up from several places (no outside service needed):
//   • Vercel Cron, once per hour (vercel.json)
//   • any open Astrax tab, about once a minute (components/schedule-poller.tsx)
//   • normal app traffic: chat and schedule requests (via next/server `after`)
// Every job is claimed in the database before it's sent, so no matter how many of
// these fire at once, each payment goes out exactly once.
import "server-only"
import { getPublicClient, isNativeToken, resolveNetwork } from "./arc"
import { accountFromSecret, buildNativeTransfer, buildTokenTransfer, makeWalletClient, resolveToken, sendPrepared } from "./evm"
import { getDueSchedules, claimSchedule, failStaleClaims, updateAfterRun, clearKey, rateLimited } from "./db"
import { decryptSecret } from "./crypto"

// Longer than any single send+confirm, shorter than the gap between triggers.
const LEASE_MS = 3 * 60_000
// At most one opportunistic run per this window, across all servers.
const TICK_WINDOW_MS = 30_000

export interface RunResult {
  ran: number
  results: { id: string; hash?: string; remaining?: number; error?: string }[]
  interrupted: number
  at: string
}

export async function runDueSchedules(): Promise<RunResult> {
  const now = Date.now()
  const interrupted = await failStaleClaims(now)
  const due = await getDueSchedules(now)
  const results: RunResult["results"] = []

  for (const job of due) {
    if (!(await claimSchedule(job.id, now, LEASE_MS))) continue // another run has it
    try {
      if (!job.enc_key) {
        await updateAfterRun(job.id, { status: "failed", note: "missing key", locked_until: 0 })
        continue
      }
      const network = resolveNetwork(job.network)
      const client = getPublicClient(network)
      const account = accountFromSecret(decryptSecret(job.enc_key))
      if (account.address.toLowerCase() !== job.owner.toLowerCase()) throw new Error("stored key doesn't match the owner")

      let tx
      if (isNativeToken(job.token)) {
        tx = buildNativeTransfer(job.recipient, job.amount)
      } else {
        const token = await resolveToken(network, client, job.token)
        if ("error" in token) throw new Error(token.error)
        tx = buildTokenTransfer(token, job.recipient, job.amount)
      }
      const { hash: sig } = await sendPrepared(makeWalletClient(network, account), client, tx)

      const remaining = job.remaining - 1
      if (job.interval_secs > 0 && remaining > 0) {
        // Next run is based on the scheduled time, not "now", so a late run doesn't drift.
        let next = job.next_run + job.interval_secs * 1000
        while (next <= now) next += job.interval_secs * 1000 // skip slots missed while nothing ran
        await updateAfterRun(job.id, { remaining, next_run: next, last_tx: sig, locked_until: 0 })
      } else {
        await updateAfterRun(job.id, { remaining: Math.max(0, remaining), status: "done", last_tx: sig, locked_until: 0 })
        await clearKey(job.id) // wipe the stored key once there are no runs left
      }
      results.push({ id: job.id, hash: sig, remaining })
    } catch (e: any) {
      await updateAfterRun(job.id, { status: "failed", note: (e?.message || "error").slice(0, 160), locked_until: 0 })
      await clearKey(job.id)
      results.push({ id: job.id, error: e?.message })
    }
  }
  return { ran: results.length, results, interrupted, at: new Date(now).toISOString() }
}

/** Run due payments unless another run started in the last 30s (anywhere). Never throws. */
export async function maybeRunDueSchedules(): Promise<RunResult | null> {
  try {
    if (await rateLimited("scheduler:tick", TICK_WINDOW_MS, 1)) return null
    return await runDueSchedules()
  } catch (e) {
    console.error("[scheduler]", (e as Error)?.message)
    return null
  }
}
