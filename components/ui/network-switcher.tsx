"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, AlertTriangle, Loader2 } from "lucide-react"
import { useNetwork } from "@/contexts/NetworkContext"
import { ARC_NETWORK_LIST } from "@/lib/arc"
import { cn } from "@/lib/utils"

const badgeCls = (testnet: boolean) =>
  testnet
    ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"

/** Arc logo + network name pill with a menu to switch between Mainnet and Testnet. */
export function NetworkSwitcher({ className }: { className?: string }) {
  const { network, setNetwork } = useNetwork()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!mounted) return <div className={cn("h-10 w-[140px]", className)} aria-hidden />

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Network: ${network.name}. Change network`}
        className="inline-flex items-center gap-2 h-10 rounded-full px-3 text-sm font-medium border border-gray-300 dark:border-white/20 bg-white dark:bg-black hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chain/arc.png" alt="" className="h-5 w-5 rounded-full" />
        <span className="hidden sm:inline">{network.name}</span>
        <span className="sm:hidden">{network.label}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", badgeCls(network.isTestnet))}>{network.badge}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Arc network"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black p-1 shadow-lg text-black dark:text-white"
        >
          {ARC_NETWORK_LIST.map((n) => (
            <li key={n.key} role="option" aria-selected={n.key === network.key}>
              <button
                type="button"
                onClick={() => {
                  setNetwork(n.key)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-900 focus-visible:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/chain/arc.png" alt="" className="h-6 w-6 rounded-full" />
                <span className="flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {n.name}
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", badgeCls(n.isTestnet))}>{n.badge}</span>
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Chain {n.id} · {n.isTestnet ? "free test USDC" : "real USDC"}
                  </span>
                </span>
                {n.key === network.key && <Check className="h-4 w-4 text-green-500" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Banner shown when the connected wallet is on a different chain than the app. */
export function WalletNetworkBanner() {
  const { network, walletMismatch, switchWallet, switching } = useNetwork()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !walletMismatch) return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4" />
      <span>Your wallet is on a different network than Astrax ({network.name}).</span>
      <button
        type="button"
        onClick={switchWallet}
        disabled={switching}
        className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {switching && <Loader2 className="h-3 w-3 animate-spin" />} Switch wallet to {network.label}
      </button>
    </div>
  )
}
