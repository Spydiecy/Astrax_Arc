"use client"

import { useCallback, useState } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { Transaction } from "@solana/web3.js"
import { Loader2, Zap, CheckCircle2, ArrowUpRight } from "lucide-react"
import { explorerTx } from "@/lib/solana"

export interface PendingAction {
  action: "sendNative" | "sendToken" | "deployToken" | "deployNFT" | "mintNFT"
  label: string
  /** base64-encoded transaction built server-side; signed & sent in the wallet. */
  txBase64: string
  to?: string
  contract?: string
  mint?: string
  symbol?: string
  amount?: string
  name?: string
  supply?: string
  metadataUri?: string
  image?: string
}

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

export function TxActionButton({ action, onDone }: { action: PendingAction; onDone?: (sig: string) => void }) {
  const { connection } = useConnection()
  const { sendTransaction, connected } = useWallet()
  const [signature, setSignature] = useState<string>()
  const [phase, setPhase] = useState<"idle" | "wallet" | "mining" | "done" | "error">("idle")
  const [errMsg, setErrMsg] = useState("")

  const execute = useCallback(async () => {
    if (!connected) {
      setErrMsg("Connect your wallet first.")
      setPhase("error")
      return
    }
    setPhase("wallet")
    setErrMsg("")
    try {
      const tx = Transaction.from(Buffer.from(action.txBase64, "base64"))
      // Refresh the blockhash in case the prepared one expired while displayed.
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
      tx.recentBlockhash = blockhash
      const sig = await sendTransaction(tx, connection)
      setSignature(sig)
      setPhase("mining")
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      setPhase("done")
      onDone?.(sig)
    } catch (e: any) {
      setErrMsg((e?.message || "Transaction rejected").slice(0, 140))
      setPhase("error")
    }
  }, [action, connection, sendTransaction, connected, onDone])

  if (phase === "done") {
    return (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" /> Confirmed
        </div>
        {action.mint && (
          <div className="mt-1 text-xs font-mono text-green-700 dark:text-green-300">Mint: {short(action.mint)}</div>
        )}
        {signature && (
          <a href={explorerTx(signature)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
            View on Solana Explorer <ArrowUpRight className="w-3 h-3" />
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
