import { NextResponse } from "next/server"
import type { Abi } from "viem"
import { hideContract, listContractsByOwner } from "@/lib/db"
import { addrKey, explorerAddress, getPublicClient, isValidAddress, resolveNetwork } from "@/lib/arc"
import { isOwner, NOT_OWNER } from "@/lib/auth"
import { abiFunctions, describeFunction, isReadOnly, stringifyResult } from "@/lib/abi-args"

export const runtime = "nodejs"

// The "Smart contracts" tab: contracts this wallet deployed through Astrax on one
// network (`?network=mainnet|testnet`). Only for an address this browser has
// verified it owns (see lib/auth.ts). Each contract also carries the live value of
// its no-argument read functions, e.g. a counter's `count`.
const MAX_LIVE_READS = 4

export async function GET(req: Request) {
  const url = new URL(req.url)
  const owner = url.searchParams.get("owner") || ""
  if (!isValidAddress(owner)) return NextResponse.json({ contracts: [] })
  if (!isOwner(req, owner)) return NextResponse.json(NOT_OWNER, { status: 401 })
  const network = resolveNetwork(url.searchParams.get("network"))
  const client = getPublicClient(network)

  const rows = await listContractsByOwner(addrKey(owner), network.key)
  const contracts = await Promise.all(
    rows.map(async (r) => {
      const abi = JSON.parse(r.abi) as Abi
      const fns = abiFunctions(abi)
      const readsNoArgs = fns.filter((f) => isReadOnly(f) && f.inputs.length === 0 && f.outputs.length === 1).slice(0, MAX_LIVE_READS)
      const live = await Promise.all(
        readsNoArgs.map(async (f) => {
          try {
            const v = await client.readContract({ address: r.address as `0x${string}`, abi: [f], functionName: f.name })
            return { name: f.name, type: f.outputs[0].type, value: stringifyResult(v) }
          } catch {
            return null
          }
        }),
      )
      return {
        id: r.id,
        name: r.name,
        address: r.address as string,
        explorerUrl: explorerAddress(network, r.address as string),
        createdAt: r.created_at,
        txHash: r.tx_hash,
        functions: fns.map((f) => ({
          name: f.name,
          signature: describeFunction(f),
          read: isReadOnly(f),
          payable: f.stateMutability === "payable",
          inputs: f.inputs.length,
        })),
        live: live.filter(Boolean),
      }
    }),
  )
  return NextResponse.json({ contracts }, { headers: { "cache-control": "no-store" } })
}

// Hide a contract from the list (owner only). It stays on-chain.
export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id") || ""
  const owner = url.searchParams.get("owner") || ""
  if (!/^ct_[0-9a-f]{16}$/.test(id) || !isValidAddress(owner)) return NextResponse.json({ ok: false }, { status: 400 })
  if (!isOwner(req, owner)) return NextResponse.json({ ok: false, ...NOT_OWNER }, { status: 401 })
  return NextResponse.json({ ok: await hideContract(id, addrKey(owner)) })
}
