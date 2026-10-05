// Server-only recent-activity lookup for an address.
// Arc has no "transactions by address" JSON-RPC method, so we try the network's
// Blockscout API first and fall back to scanning recent native USDC Transfer logs
// (EIP-7708, emitted by the system address) in and out of the address.
import "server-only"
import { pad } from "viem"
import { MAX_LOG_RANGE, SYSTEM_EMITTER, getPublicClient, type ArcNetwork } from "./arc"
import { formatAmount, getRawLogs } from "./evm"

export interface ActivityItem {
  hash: string
  from: string
  to: string
  value: string
  status: "Success" | "Failed"
  timestamp: string
}

interface ExplorerTx {
  hash: string
  from?: { hash: string }
  to?: { hash: string } | null
  created_contract?: { hash: string } | null
  value?: string
  status?: string
  result?: string
  timestamp?: string
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

async function fromExplorer(network: ArcNetwork, address: string, limit: number): Promise<ActivityItem[] | null> {
  try {
    const res = await fetch(`${network.explorerApi}/addresses/${address}/transactions`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null
    const j = await res.json()
    if (!Array.isArray(j?.items)) return null
    return (j.items as ExplorerTx[]).slice(0, limit).map((t) => ({
      hash: t.hash,
      from: t.from?.hash ?? "",
      to: t.to?.hash ?? t.created_contract?.hash ?? "",
      value: `${formatAmount(BigInt(t.value ?? "0"), 18, 6)} USDC`,
      status: t.status === "ok" || t.result === "success" ? "Success" : "Failed",
      timestamp: t.timestamp ? new Date(t.timestamp).toLocaleString() : "",
    }))
  } catch {
    return null
  }
}

async function fromLogs(network: ArcNetwork, address: string, limit: number): Promise<ActivityItem[]> {
  const client = getPublicClient(network)
  const latest = await client.getBlockNumber()
  const topic = pad(address as `0x${string}`, { size: 32 }).toLowerCase()
  const out = new Map<string, ActivityItem & { block: bigint }>()
  // Up to three 9,999-block windows (~4 hours of Arc history).
  for (let i = 0n, to = latest; i < 3n && to > 0n && out.size < limit; i++) {
    const from = to > MAX_LOG_RANGE ? to - MAX_LOG_RANGE : 0n
    const [sent, received] = await Promise.all([
      getRawLogs(client, { address: SYSTEM_EMITTER, fromBlock: from, toBlock: to, topics: [TRANSFER_TOPIC, topic] }),
      getRawLogs(client, { address: SYSTEM_EMITTER, fromBlock: from, toBlock: to, topics: [TRANSFER_TOPIC, null, topic] }),
    ])
    for (const log of [...sent, ...received]) {
      if (out.has(log.transactionHash)) continue
      out.set(log.transactionHash, {
        hash: log.transactionHash,
        from: `0x${log.topics[1].slice(26)}`,
        to: `0x${log.topics[2].slice(26)}`,
        value: `${formatAmount(BigInt(log.data), 18, 6)} USDC`,
        status: "Success", // reverted transactions emit no logs
        timestamp: "",
        block: BigInt(log.blockNumber),
      })
    }
    to = from - 1n
  }
  const items = [...out.values()].sort((a, b) => (a.block > b.block ? -1 : 1)).slice(0, limit)
  const blocks = await Promise.all(
    [...new Set(items.map((x) => x.block))].map((b) => client.getBlock({ blockNumber: b }).catch(() => null)),
  )
  const times = new Map(blocks.filter(Boolean).map((b) => [b!.number, Number(b!.timestamp) * 1000]))
  return items.map(({ block, ...x }) => ({ ...x, timestamp: times.get(block) ? new Date(times.get(block)!).toLocaleString() : "" }))
}

export async function recentActivity(
  network: ArcNetwork,
  address: string,
  limit = 8,
): Promise<{ transactions: ActivityItem[]; source: "explorer" | "logs" }> {
  const viaExplorer = await fromExplorer(network, address, limit)
  if (viaExplorer) return { transactions: viaExplorer, source: "explorer" }
  return { transactions: await fromLogs(network, address, limit), source: "logs" }
}
