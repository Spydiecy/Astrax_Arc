"use client"

import { useCallback, useEffect, useState } from "react"
import { Link2, X, Loader2, Trash2, ArrowUpRight, RefreshCw, Copy, Check } from "lucide-react"
import { useCredentials } from "@/contexts/CredentialsContext"
import { absoluteUrl } from "@/lib/origin"
import { useOwnerSession } from "@/contexts/OwnerSessionContext"
import { VerifyWalletPrompt } from "@/components/verify-wallet"

interface PaymentLink {
  id: string
  path: string
  url: string
  amount: string
  token: string
  description: string
  status: "open" | "paid" | "cancelled"
  paidExplorerUrl: string | null
  paidAt: number | null
  createdAt: number
}

const statusStyle: Record<PaymentLink["status"], string> = {
  open: "text-blue-500",
  paid: "text-green-500",
  cancelled: "text-gray-400",
}
const statusLabel: Record<PaymentLink["status"], string> = { open: "awaiting payment", paid: "paid", cancelled: "cancelled" }

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:underline"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy link"}
    </button>
  )
}

export function PaymentLinksModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeAddress } = useCredentials()
  const { isVerified } = useOwnerSession()
  const [items, setItems] = useState<PaymentLink[]>([])
  const [loading, setLoading] = useState(false)
  // Avoid flashing the empty state before the first fetch completes.
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!activeAddress || !isVerified) {
      setItems([])
      setLoaded(true)
      return
    }
    setLoading(true)
    try {
      // check=1 re-checks open links on-chain, so QR payments show up as paid.
      const res = await fetch(`/api/payment-links?owner=${activeAddress}&check=1`, { cache: "no-store" })
      const j = await res.json()
      setItems(res.ok ? j.links || [] : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [activeAddress, isVerified])

  useEffect(() => {
    if (isOpen) load()
    else setLoaded(false)
  }, [isOpen, load])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  const cancel = async (id: string) => {
    if (!activeAddress || !window.confirm("Cancel this payment link? Anyone opening it will see it's no longer payable.")) return
    await fetch(`/api/payment-links?id=${id}&owner=${activeAddress}`, { method: "DELETE" })
    load()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="payment-links-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black text-black dark:text-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 id="payment-links-title" className="flex items-center gap-2 font-semibold">
            <Link2 className="w-5 h-5" /> Payment Links
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={load} aria-label="Refresh" className="p-1.5 rounded-md text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
              <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
            </button>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {!activeAddress && <p className="text-sm text-gray-500">Connect a wallet or load a secret key to see your payment links.</p>}
          {activeAddress && !isVerified && <VerifyWalletPrompt />}
          {activeAddress && isVerified && (loading || !loaded) && items.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          )}
          {activeAddress && isVerified && loaded && !loading && items.length === 0 && (
            <p className="text-sm text-gray-500">No payment links yet. Try: “create a payment link for 0.5 SOL for design work”.</p>
          )}
          {items.map((l) => (
            <div key={l.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{l.amount} {l.token}</span>
                <span className={`text-xs font-medium ${statusStyle[l.status]}`}>{statusLabel[l.status]}</span>
              </div>
              {l.description && <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 break-words">{l.description}</div>}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Created {new Date(l.createdAt).toLocaleString()}
                {l.paidAt ? ` · paid ${new Date(l.paidAt).toLocaleString()}` : ""}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <CopyLink url={absoluteUrl(l.path)} />
                <a href={absoluteUrl(l.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Open <ArrowUpRight className="w-3 h-3" />
                </a>
                {l.paidExplorerUrl && (
                  <a href={l.paidExplorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline">
                    Payment tx <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
                {l.status === "open" && (
                  <button onClick={() => cancel(l.id)} className="ml-auto inline-flex items-center gap-1 text-xs text-red-500 hover:underline">
                    <Trash2 className="w-3 h-3" /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
