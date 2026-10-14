"use client"
import { useCallback, useEffect, useState } from "react"
import { Code2, X, Loader2, Trash2, ArrowUpRight, RefreshCw, Copy, Check, MessageSquare } from "lucide-react"
import { useCredentials } from "@/contexts/CredentialsContext"
import { useOwnerSession } from "@/contexts/OwnerSessionContext"
import { useNetwork } from "@/contexts/NetworkContext"
import { VerifyWalletPrompt } from "@/components/verify-wallet"
import { cn } from "@/lib/utils"

interface ContractFn {
  name: string
  signature: string
  read: boolean
  payable: boolean
  inputs: number
}
interface DeployedContract {
  id: string
  name: string
  address: string
  explorerUrl: string
  createdAt: number
  functions: ContractFn[]
  live: { name: string; type: string; value: unknown }[]
}

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`
const show = (v: unknown) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))

/** Fill the chat box with a prompt (the chat page listens for this event). */
export function promptAstrax(prompt: string) {
  window.dispatchEvent(new CustomEvent("astrax:prompt", { detail: { prompt } }))
}

function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy address"}
      title="Copy address"
      onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export function ContractsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeAddress } = useCredentials()
  const { network } = useNetwork()
  const { isVerified } = useOwnerSession()
  const [items, setItems] = useState<DeployedContract[]>([])
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
      const res = await fetch(`/api/contracts?owner=${activeAddress}&network=${network.key}`, { cache: "no-store" })
      const j = await res.json()
      setItems(res.ok ? j.contracts || [] : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [activeAddress, isVerified, network.key])

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

  const remove = async (c: DeployedContract) => {
    if (!activeAddress || !window.confirm(`Remove "${c.name}" from this list? The contract stays on-chain; this only hides it here.`)) return
    await fetch(`/api/contracts?id=${c.id}&owner=${activeAddress}`, { method: "DELETE" })
    load()
  }

  const ask = (c: DeployedContract, f: ContractFn) => {
    onClose()
    // Name + address, so the agent picks the right contract even with several of the same name.
    const target = `${c.name} (${c.address})`
    promptAstrax(
      f.read
        ? f.inputs === 0 ? `What is ${f.name} on ${target}?` : `Call ${f.name} on ${target} with `
        : `Call ${f.name} on ${target}${f.inputs ? " with " : ""}`,
    )
  }

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="contracts-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black text-black dark:text-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 id="contracts-title" className="flex items-center gap-2 font-semibold">
            <Code2 className="w-5 h-5" /> Smart Contracts
            <span className="text-xs font-normal text-gray-500">{network.name}</span>
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

        <div className="overflow-y-auto p-4 space-y-3">
          {!activeAddress && <p className="text-sm text-gray-500">Connect a wallet or load a private key to see the contracts you deployed.</p>}
          {activeAddress && !isVerified && <VerifyWalletPrompt />}
          {activeAddress && isVerified && (loading || !loaded) && items.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          )}
          {activeAddress && isVerified && loaded && !loading && items.length === 0 && (
            <div className="text-sm text-gray-500 space-y-2">
              <p>No contracts deployed on {network.name} yet.</p>
              <button
                type="button"
                onClick={() => { onClose(); promptAstrax("Create and deploy a simple counter contract") }}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-900"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Deploy a simple counter
              </button>
            </div>
          )}

          {items.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{c.name}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">{new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-mono" title={c.address}>{short(c.address)}</span>
                <CopyAddress value={c.address} />
                <a href={c.explorerUrl} target="_blank" rel="noreferrer" aria-label={`View ${c.name} on the explorer`} title="View on explorer" className="p-1 rounded hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
                <button type="button" onClick={() => remove(c)} aria-label={`Remove ${c.name} from the list`} title="Remove from list" className="ml-auto p-1 rounded hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-900">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {c.live.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-gray-50 dark:bg-gray-900 px-2.5 py-2">
                  {c.live.map((l) => (
                    <div key={l.name} className="min-w-0">
                      <dt className="text-[11px] text-gray-500">{l.name}</dt>
                      <dd className="font-mono text-xs truncate" title={show(l.value)}>{show(l.value)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-2.5">
                <div className="text-[11px] text-gray-500 mb-1">Tap a function to ask Astrax to run it</div>
                <div className="flex flex-wrap gap-1">
                  {c.functions.map((f) => (
                    <button
                      key={f.signature}
                      type="button"
                      onClick={() => ask(c, f)}
                      title={f.signature}
                      className={cn(
                        "text-xs font-mono px-1.5 py-0.5 rounded border transition-colors",
                        f.read
                          ? "border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600"
                          : "border-amber-300/60 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 hover:border-amber-500",
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 dark:bg-gray-700 mr-1 align-middle" />read
                  <span className="inline-block w-2 h-2 rounded-sm bg-amber-300 dark:bg-amber-700 ml-3 mr-1 align-middle" />sends a transaction
                </p>
              </div>
            </div>
          ))}

          {items.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You can also just say it, e.g. “increment the counter” or “what&apos;s the count?”. Astrax finds the contract by name.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
