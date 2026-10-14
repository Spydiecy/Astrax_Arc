"use client"

import { useCallback, useEffect, useState } from "react"
import { useAccount } from "wagmi"
import { getWalletClient, switchChain } from "wagmi/actions"
import { Loader2, Zap, CheckCircle2, ArrowUpRight } from "lucide-react"
import { useCredentials } from "@/contexts/CredentialsContext"
import { wagmiConfig } from "@/lib/wagmi"
import { estimateArcFees, explorerTx, explorerToken, getPublicClient, resolveNetwork, type NetworkKey } from "@/lib/arc"
import { buildDeployNFT, buildDeployToken, friendlyError, type PreparedTx } from "@/lib/evm"

export interface PendingAction {
  action: "sendNative" | "sendToken" | "deployToken" | "deployNFT" | "mintTokens" | "deployContract" | "callContract"
  label: string
  /** Network the agent prepared this for; the wallet is switched to it before signing. */
  network?: NetworkKey
  chainId?: number
  /** Server-prepared transaction (transfers / mints). Absent for deployments. */
  tx?: PreparedTx
  /** Contract deployment parameters (token / NFT); the request is built here. */
  deploy?:
    | { type: "token"; name: string; symbol: string; decimals: number; supply: string }
    | { type: "nft"; name: string; symbol: string; uri: string }
  /** Custom contract compiled by the agent; its bytecode is fetched from /api/contracts/<id>. */
  contractId?: string
  contractName?: string
  functions?: string[]
  gasEstimate?: string
  to?: string
  token?: string
  symbol?: string
  amount?: string
  name?: string
  supply?: string
  image?: string
  metadataUri?: string
}

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

// Confirmed actions are remembered per tool call, so a reloaded chat shows
// "Confirmed" instead of offering to pay again.
const doneKey = (id: string) => `astrax_tx_done:${id}`
interface DoneRecord { hash: string; contract?: string }

export function TxActionButton({ id, action, onDone }: { id?: string; action: PendingAction; onDone?: (hash: string) => void }) {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { signingMode } = useCredentials()
  const network = resolveNetwork(action.network)
  const [hash, setHash] = useState<string>()
  const [contract, setContract] = useState<string>()
  const [phase, setPhase] = useState<"idle" | "wallet" | "mining" | "done" | "error">("idle")
  const [errMsg, setErrMsg] = useState("")

  useEffect(() => {
    if (!id) return
    try {
      const rec = JSON.parse(localStorage.getItem(doneKey(id)) || "null") as DoneRecord | null
      if (rec?.hash) {
        setHash(rec.hash)
        setContract(rec.contract)
        setPhase("done")
      }
    } catch {
      /* ignore corrupt entries */
    }
  }, [id])

  const execute = useCallback(async () => {
    if (!isConnected || !address) {
      setErrMsg("Connect your wallet first.")
      setPhase("error")
      return
    }
    setPhase("wallet")
    setErrMsg("")
    try {
      if (walletChainId !== network.id) await switchChain(wagmiConfig, { chainId: network.id })
      const wallet = await getWalletClient(wagmiConfig, { chainId: network.id, account: address })
      const client = getPublicClient(network)
      // Arc's mempool drops anything below its 20 gwei floor, so set fees explicitly.
      const fees = await estimateArcFees(client)

      let txHash: `0x${string}`
      if (action.deploy) {
        const req = action.deploy.type === "token" ? buildDeployToken(action.deploy) : buildDeployNFT(action.deploy)
        txHash = await wallet.deployContract({ account: address, chain: network.chain, abi: req.abi, bytecode: req.bytecode, args: req.args, ...fees })
      } else if (action.contractId) {
        const res = await fetch(`/api/contracts/${encodeURIComponent(action.contractId)}`, { cache: "no-store" })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j.deployData) throw new Error(j.error || "This deployment is no longer available. Ask Astrax to deploy it again.")
        if (String(j.owner).toLowerCase() !== address.toLowerCase()) {
          throw new Error("This contract was prepared for a different wallet. Ask Astrax again with this wallet connected.")
        }
        txHash = await wallet.sendTransaction({ account: address, chain: network.chain, data: j.deployData, ...fees })
      } else {
        if (!action.tx) throw new Error("Missing prepared transaction")
        txHash = await wallet.sendTransaction({
          account: address,
          chain: network.chain,
          to: action.tx.to,
          data: action.tx.data,
          value: action.tx.value ? BigInt(action.tx.value) : undefined,
          ...fees,
        })
      }
      setHash(txHash)
      setPhase("mining")
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 })
      if (receipt.status !== "success") throw new Error("The transaction was mined but reverted on-chain.")
      const created = receipt.contractAddress ?? undefined
      // Let the server record the address (it re-checks the deployment on-chain),
      // so the agent can call this contract's functions by name afterwards.
      if (action.contractId && created) {
        await fetch(`/api/contracts/${encodeURIComponent(action.contractId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: txHash }),
        }).catch(() => {})
      }
      if (created) setContract(created)
      if (id) localStorage.setItem(doneKey(id), JSON.stringify({ hash: txHash, contract: created } satisfies DoneRecord))
      setPhase("done")
      onDone?.(txHash)
    } catch (e) {
      setErrMsg(friendlyError(e, network))
      setPhase("error")
    }
  }, [id, action, address, isConnected, walletChainId, network, onDone])

  // NFT artwork + links to the IPFS image and metadata, shown before and after confirming.
  const nftPreview = action.action === "deployNFT" && action.image ? (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={action.image} alt={`${action.name || "NFT"} artwork`} className="w-20 h-20 rounded-md object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-900" />
      <div className="min-w-0 text-xs">
        <div className="text-sm font-medium truncate">{action.name}{action.symbol ? ` (${action.symbol})` : ""}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <a href={action.image} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
            Image on IPFS <ArrowUpRight className="w-3 h-3" />
          </a>
          {action.metadataUri && (
            <a href={action.metadataUri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
              Metadata JSON <ArrowUpRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  ) : null

  if (phase === "done") {
    return (
      <div className="w-full max-w-xl">
      {nftPreview}
      <div className="mt-3 w-full rounded-lg border border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" /> Confirmed on {network.name}
        </div>
        {contract && (
          <a href={explorerToken(network, contract)} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-mono text-green-700 dark:text-green-300 break-all hover:underline">
            Contract: {contract}
          </a>
        )}
        {hash && (
          <a href={explorerTx(network, hash)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
            View on Arc Explorer ({short(hash)}) <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
      </div>
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
        <span className="break-words">{errMsg}</span>
        <button onClick={() => setPhase("idle")} className="underline flex-shrink-0 text-xs">retry</button>
      </div>
    )
  }

  // Autonomous mode signs server-side, so wallet confirm buttons don't apply.
  // (Only reachable for an action prepared earlier, before switching modes.)
  if (signingMode === "auto" && phase === "idle") {
    return (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        {action.label}: prepared in wallet mode and not sent. Switch to <strong>Wallet</strong> signing to confirm it, or ask again to run it autonomously.
      </div>
    )
  }

  const busy = phase === "wallet" || phase === "mining"
  const contractPreview = action.action === "deployContract" ? (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{action.contractName}</span>
        {action.gasEstimate && <span className="text-gray-500">~{Number(action.gasEstimate).toLocaleString()} gas</span>}
      </div>
      {!!action.functions?.length && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {action.functions.map((f) => (
            <span key={f} className="font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{f}</span>
          ))}
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="w-full max-w-xl">
      {nftPreview}
      {contractPreview}
      {action.to && (
        <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-xs">
          <div className="text-gray-500 dark:text-gray-400">{action.action === "mintTokens" ? "Mint to" : "Recipient"}</div>
          <div className="font-mono break-all mt-0.5">{action.to}</div>
        </div>
      )}
      {!network.isTestnet && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Arc Mainnet: this uses real USDC and can&apos;t be undone.</p>
      )}
      <button
        onClick={execute}
        disabled={busy}
        className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black px-4 py-3 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-70 transition-colors"
      >
        {phase === "mining" ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Confirming on-chain…</>
        ) : phase === "wallet" ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in wallet…</>
        ) : (
          <><Zap className="w-4 h-4" /> {action.label}{walletChainId !== undefined && walletChainId !== network.id ? ` (switch to ${network.label})` : ""}</>
        )}
      </button>
    </div>
  )
}
