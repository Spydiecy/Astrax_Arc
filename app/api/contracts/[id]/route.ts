import { NextResponse } from "next/server"
import { keccak256 } from "viem"
import { confirmContract, getContractById, rateLimited } from "@/lib/db"
import { explorerAddress, getPublicClient, isTxHash, resolveNetwork } from "@/lib/arc"

export const runtime = "nodejs"

// Wallet-mode contract deployments compiled by the agent.
//   GET  → the deployment calldata, so the browser wallet can sign it (the large
//          bytecode isn't carried in the chat history).
//   POST → the browser reports the transaction hash. The server re-reads it from
//          the chain and only stores the address if that transaction deployed
//          exactly this compiled code from the wallet it was prepared for.

const validId = (id: string) => /^ct_[0-9a-f]{16}$/.test(id)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!validId(id)) return NextResponse.json({ error: "Invalid deployment id." }, { status: 400 })
  const row = await getContractById(id)
  if (!row) return NextResponse.json({ error: "Unknown deployment. Ask Astrax to deploy it again." }, { status: 404 })
  const network = resolveNetwork(row.network)
  return NextResponse.json({
    id: row.id,
    name: row.name,
    network: network.key,
    owner: row.owner,
    deployData: row.address ? null : row.deploy_data,
    address: row.address,
    explorerUrl: row.address ? explorerAddress(network, row.address) : null,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { hash } = await req.json().catch(() => ({}))
  if (!validId(id) || !isTxHash(hash)) return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (await rateLimited(`contract-confirm:${ip}`, 60_000, 30)) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 })
  }

  const row = await getContractById(id)
  if (!row) return NextResponse.json({ error: "Unknown deployment." }, { status: 404 })
  const network = resolveNetwork(row.network)
  if (row.address) return NextResponse.json({ address: row.address, explorerUrl: explorerAddress(network, row.address) })

  const client = getPublicClient(network)
  try {
    const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
    const ok =
      receipt.status === "success" &&
      !tx.to &&
      Boolean(receipt.contractAddress) &&
      tx.from.toLowerCase() === row.owner &&
      keccak256(tx.input) === row.deploy_hash
    if (!ok || !receipt.contractAddress) {
      return NextResponse.json({ error: "That transaction didn't deploy this contract." }, { status: 422 })
    }
    await confirmContract(id, receipt.contractAddress, hash)
    return NextResponse.json({ address: receipt.contractAddress, explorerUrl: explorerAddress(network, receipt.contractAddress) })
  } catch {
    return NextResponse.json({ error: "Transaction not found yet. Try again in a moment." }, { status: 404 })
  }
}
