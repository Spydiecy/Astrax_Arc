"use client"

import { useCallback, useEffect, useState } from "react"
import {
  useSendTransaction,
  useWriteContract,
  useWalletClient,
  useWaitForTransactionReceipt,
} from "wagmi"
import { Loader2, Zap, CheckCircle2, ArrowUpRight } from "lucide-react"
import { ERC20_ABI, EXPLORER_URL, explorerTx } from "@/lib/sonic"
import { ASTRAX_TOKEN_ABI, ASTRAX_TOKEN_BYTECODE } from "@/lib/erc20"
import type { Hex } from "viem"

export interface PendingAction {
  action: "sendNative" | "sendToken" | "deployToken" | "deployContract"
  label: string
  to?: string
  valueWei?: string
  tokenAddress?: string
  amountWei?: string
  symbol?: string
  amount?: string
  name?: string
  supply?: string
  bytecode?: string
}

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

export function TxActionButton({ action, onDone }: { action: PendingAction; onDone?: (hash: string) => void }) {
  const { sendTransactionAsync } = useSendTransaction()
  const { writeContractAsync } = useWriteContract()
  const { data: walletClient } = useWalletClient()
  const [txHash, setTxHash] = useState<Hex | undefined>()
  const [phase, setPhase] = useState<"idle" | "wallet" | "mining" | "done" | "error">("idle")
  const [errMsg, setErrMsg] = useState("")
  const [contractAddress, setContractAddress] = useState<string | undefined>()

  const { data: receipt, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess && phase === "mining") {
      if (receipt?.contractAddress) setContractAddress(receipt.contractAddress)
      setPhase("done")
      if (txHash) onDone?.(txHash)
    }
  }, [isSuccess, phase, receipt, txHash, onDone])

  const execute = useCallback(async () => {
    setPhase("wallet")
    setErrMsg("")
    try {
      let hash: Hex
      if (action.action === "sendNative") {
        hash = await sendTransactionAsync({ to: action.to as Hex, value: BigInt(action.valueWei || "0") })
      } else if (action.action === "sendToken") {
        hash = await writeContractAsync({
          address: action.tokenAddress as Hex,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [action.to as Hex, BigInt(action.amountWei || "0")],
        })
      } else if (action.action === "deployToken") {
        if (!walletClient) throw new Error("Wallet not ready")
        hash = await walletClient.deployContract({
          abi: ASTRAX_TOKEN_ABI,
          bytecode: ASTRAX_TOKEN_BYTECODE,
          args: [action.name as string, action.symbol as string, BigInt(action.supply || "0")],
        })
      } else {
        if (!walletClient) throw new Error("Wallet not ready")
        hash = await walletClient.deployContract({ abi: [], bytecode: action.bytecode as Hex })
      }
      setTxHash(hash)
      setPhase("mining")
    } catch (e: any) {
      setErrMsg((e?.shortMessage || e?.message || "Transaction rejected").slice(0, 120))
      setPhase("error")
    }
  }, [action, sendTransactionAsync, writeContractAsync, walletClient])

  if (phase === "done") {
    return (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" /> Confirmed
        </div>
        {contractAddress && (
          <div className="mt-1 text-xs font-mono text-green-700 dark:text-green-300">Contract: {short(contractAddress)}</div>
        )}
        {txHash && (
          <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
            View on Sonic Explorer <ArrowUpRight className="w-3 h-3" />
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
