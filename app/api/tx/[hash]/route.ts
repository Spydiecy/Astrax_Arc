import { NextResponse } from "next/server"
import { getPublicClient, isTxHash, resolveNetwork } from "@/lib/arc"
import { rateLimited } from "@/lib/db"

export const runtime = "nodejs"

// "Is this transaction confirmed yet?" for the browser. The pages used to poll the Arc
// RPC directly, which an ad-blocker, VPN or flaky endpoint can silently break, leaving a
// spinner that never ends. Asking Astrax's own server (same origin, with failover
// RPCs behind it) always works. Transactions are public on-chain data, so no auth.
//   GET /api/tx/<hash>?network=mainnet|testnet
//   → { status: "pending" | "success" | "reverted", blockNumber?, contractAddress? }
export async function GET(req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params
  if (!isTxHash(hash)) return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 })
  const network = resolveNetwork(new URL(req.url).searchParams.get("network"))

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  // ~1 poll per second per open tab is normal; this leaves room for several tabs.
  if (await rateLimited(`tx:${ip}`, 60_000, 300)) {
    return NextResponse.json({ error: "Too many requests. Try again in a moment." }, { status: 429 })
  }

  const headers = { "cache-control": "no-store" }
  try {
    const receipt = await getPublicClient(network).getTransactionReceipt({ hash })
    return NextResponse.json(
      {
        status: receipt.status === "success" ? "success" : "reverted",
        blockNumber: receipt.blockNumber.toString(),
        contractAddress: receipt.contractAddress ?? null,
      },
      { headers },
    )
  } catch (e) {
    // Not mined yet (or an RPC hiccup): the caller simply asks again.
    const name = (e as { name?: string })?.name
    return NextResponse.json({ status: "pending", note: name === "TransactionReceiptNotFoundError" ? undefined : "rpc" }, { headers })
  }
}
