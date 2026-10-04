"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { Wallet, ChevronDown, Copy, Check, LogOut, RefreshCw, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Same footprint as the header's theme toggle (h-10, pill, thin border).
const pill =
  "inline-flex items-center gap-2 h-10 rounded-full px-4 text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500 " +
  "disabled:opacity-60 disabled:cursor-not-allowed"

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`

export function CustomConnectButton({ className }: { className?: string }) {
  const { publicKey, wallet, connected, connecting, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const address = publicKey?.toBase58()

  const copy = useCallback(async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [address])

  // Wallet state only exists in the browser; reserve the space to avoid a layout jump.
  if (!mounted) return <div className={cn("h-10 w-[150px]", className)} aria-hidden />

  if (!connected || !address) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        disabled={connecting}
        className={cn(pill, "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200", className)}
      >
        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    )
  }

  const itemCls =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 focus-visible:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-900"

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Wallet ${address}`}
        className={cn(
          pill,
          "border border-gray-300 dark:border-white/20 bg-white dark:bg-black text-black dark:text-white hover:bg-gray-100 dark:hover:bg-white/10",
        )}
      >
        {wallet?.adapter.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="h-4 w-4 rounded-sm" />
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        <span className="font-mono text-xs">{short(address)}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black p-1 shadow-lg text-black dark:text-white"
        >
          <div className="px-3 pt-2 pb-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">{wallet?.adapter.name ?? "Wallet"}</div>
            <div className="font-mono text-xs break-all mt-0.5">{address}</div>
          </div>
          <div className="my-1 h-px bg-gray-200 dark:bg-gray-800" />
          <button type="button" role="menuitem" onClick={copy} className={itemCls}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setVisible(true)
            }}
            className={itemCls}
          >
            <RefreshCw className="h-4 w-4" /> Change wallet
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              disconnect().catch(() => {})
            }}
            className={cn(itemCls, "text-red-600 dark:text-red-400")}
          >
            <LogOut className="h-4 w-4" /> Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
