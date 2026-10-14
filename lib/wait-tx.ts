// Browser helper: wait for a transaction to be confirmed without trusting any single
// connection. Two independent checks run at once and the first answer wins:
//   1. Astrax's own server (/api/tx/<hash>), which is same-origin and so can't be
//      blocked by extensions, VPNs or CORS, and reads through failover RPCs.
//   2. The Arc RPC directly from the browser (viem).
// Never throws: it returns null if nothing is seen in time, so the UI can say "sent,
// not confirmed yet" instead of spinning forever.
import { getPublicClient, type ArcNetwork } from "./arc"

export interface TxOutcome {
  status: "success" | "reverted"
  blockNumber?: string
  contractAddress?: string
}

const POLL_MS = 1200

export async function waitForTx(
  network: ArcNetwork,
  hash: `0x${string}`,
  opts: { timeoutMs?: number } = {},
): Promise<TxOutcome | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000)
  let stopped = false

  const viaServer = async (): Promise<TxOutcome | null> => {
    while (!stopped && Date.now() < deadline) {
      try {
        const res = await fetch(`/api/tx/${hash}?network=${network.key}`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
        if (res.ok) {
          const j = await res.json()
          if (j.status === "success" || j.status === "reverted") {
            return { status: j.status, blockNumber: j.blockNumber, contractAddress: j.contractAddress ?? undefined }
          }
        }
      } catch {
        /* try again */
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    return null
  }

  const viaRpc = async (): Promise<TxOutcome | null> => {
    try {
      const rc = await getPublicClient(network).waitForTransactionReceipt({ hash, timeout: Math.max(1000, deadline - Date.now()) })
      return { status: rc.status === "success" ? "success" : "reverted", blockNumber: rc.blockNumber.toString(), contractAddress: rc.contractAddress ?? undefined }
    } catch {
      return null
    }
  }

  // First real answer wins; a null from one side doesn't end the race for the other.
  const result = await new Promise<TxOutcome | null>((resolve) => {
    let pending = 2
    const settle = (r: TxOutcome | null) => {
      if (r) resolve(r)
      else if (--pending === 0) resolve(null)
    }
    viaServer().then(settle)
    viaRpc().then(settle)
  })
  stopped = true
  return result
}
