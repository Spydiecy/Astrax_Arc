"use client"

import { useCallback, useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import type { Keypair, Transaction } from "@solana/web3.js"
import { Loader2, Zap, CheckCircle2, ArrowUpRight } from "lucide-react"
import { explorerTx } from "@/lib/solana"
import { buildCreateToken, deserializeTx } from "@/lib/spl"

export interface PendingAction {
  action: "sendNative" | "sendToken" | "deployToken" | "deployNFT" | "mintTokens"
  label: string
  /** Server-prepared transaction (transfers / mint-to). Absent for create actions. */
  txBase64?: string
  to?: string
  mint?: string
  symbol?: string
  amount?: string
  // Create-token / NFT params — the tx is built in the browser so the fresh
  // mint keypair can co-sign without ever leaving this page.
  name?: string
  supply?: string
  decimals?: number
  uri?: string
  fixedSupply?: boolean
  metadataUri?: string
  image?: string
}

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

export function TxActionButton({ action, onDone }: { action: PendingAction; onDone?: (sig: string) => void }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const [signature, setSignature] = useState<string>()
  const [createdMint, setCreatedMint] = useState<string>()
  const [phase, setPhase] = useState<"idle" | "wallet" | "mining" | "done" | "error">("idle")
  const [errMsg, setErrMsg] = useState("")

  const execute = useCallback(async () => {
    if (!connected || !publicKey) {
      setErrMsg("Connect your wallet first.")
      setPhase("error")
      return
    }
    setPhase("wallet")
    setErrMsg("")
    try {
      let tx: Transaction
      const signers: Keypair[] = []
      if (action.action === "deployToken" || action.action === "deployNFT") {
        const built = await buildCreateToken(connection, publicKey, {
          name: action.name || "Token",
          symbol: action.symbol || "TKN",
          uri: action.uri || "",
          decimals: action.decimals ?? 9,
          supply: action.supply || "0",
          fixedSupply: action.fixedSupply,
        })
        tx = built.tx
        signers.push(built.mint)
        setCreatedMint(built.mint.publicKey.toBase58())
      } else {
        if (!action.txBase64) throw new Error("Missing prepared transaction")
        tx = deserializeTx(action.txBase64)
        if (tx.feePayer && !tx.feePayer.equals(publicKey)) {
          throw new Error("This transaction was prepared for a different wallet. Ask Astrax again with this wallet connected.")
        }
      }
      // Fresh blockhash so a card that sat for a while still confirms.
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      const sig = await sendTransaction(tx, connection, { signers })
      setSignature(sig)
      setPhase("mining")
      const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      if (res.value.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(res.value.err)}`)
      setPhase("done")
      onDone?.(sig)
    } catch (e: any) {
      setErrMsg((e?.message || "Transaction rejected").slice(0, 160))
      setPhase("error")
    }
  }, [action, connection, publicKey, sendTransaction, connected, onDone])

  if (phase === "done") {
    return (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" /> Confirmed
        </div>
        {createdMint && (
          <div className="mt-1 text-xs font-mono text-green-700 dark:text-green-300 break-all">Mint: {createdMint}</div>
        )}
        {signature && (
          <a href={explorerTx(signature)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
            View on Solana Explorer ({short(signature)}) <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
        <span className="break-all">{errMsg}</span>
        <button onClick={() => setPhase("idle")} className="underline flex-shrink-0 text-xs">retry</button>
      </div>
    )
  }

  const busy = phase === "wallet" || phase === "mining"
  return (
    <button
      onClick={execute}
      disabled={busy}
      className="mt-3 w-full max-w-xl flex items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black px-4 py-3 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-70 transition-colors"
    >
      {phase === "mining" ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Confirming on-chain…</>
      ) : phase === "wallet" ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in wallet…</>
      ) : (
        <><Zap className="w-4 h-4" /> {action.label}</>
      )}
    </button>
  )
}
