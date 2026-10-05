"use client"

import { ShieldCheck, Loader2 } from "lucide-react"
import { useOwnerSession } from "@/contexts/OwnerSessionContext"
import { useCredentials } from "@/contexts/CredentialsContext"
import { cn } from "@/lib/utils"

/** Inline prompt shown wherever owner-only data needs a verified wallet. */
export function VerifyWalletPrompt({ onVerified, className, compact }: { onVerified?: () => void; className?: string; compact?: boolean }) {
  const { verify, verifying, error, canVerify } = useOwnerSession()
  const { signingMode } = useCredentials()
  const auto = signingMode === "auto"
  return (
    <div className={cn("rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm", className)}>
      {!compact && (
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-gray-600 dark:text-gray-300">
            Only the wallet that created them can see or cancel these. {auto ? "Confirm your loaded key" : "Sign a free message in your wallet"} to prove it&apos;s yours — no transaction, no fee.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={async () => { if (await verify()) onVerified?.() }}
        disabled={verifying || !canVerify}
        className={cn("inline-flex items-center gap-2 rounded-md bg-gray-900 dark:bg-white text-white dark:text-black px-3 py-1.5 text-xs font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-60", !compact && "mt-2")}
      >
        {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
        {verifying ? (auto ? "Verifying…" : "Check your wallet…") : "Verify wallet"}
      </button>
      {!canVerify && <p className="mt-2 text-xs text-gray-500">{auto ? "Load a valid private key first." : "Connect your wallet (e.g. MetaMask, Rabby, Coinbase Wallet) first."}</p>}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  )
}
