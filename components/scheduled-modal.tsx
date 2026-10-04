"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, X, Loader2, Trash2, ArrowUpRight, RefreshCw } from "lucide-react"
import { useCredentials } from "@/contexts/CredentialsContext"
import { explorerTx } from "@/lib/solana"

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

interface Schedule {
  id: string
  recipient: string
  amount: string
  token: string
  nextRun: number
  intervalSecs: number
  remaining: number
  status: string
  lastTx: string | null
}

export function ScheduledModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeAddress } = useCredentials()
  const [items, setItems] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!activeAddress) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/schedules?owner=${activeAddress}`)
      const j = await res.json()
      setItems(j.schedules || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeAddress])

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen, load])

  const cancel = async (id: string) => {
    if (!activeAddress) return
    await fetch(`/api/schedules?id=${id}&owner=${activeAddress}`, { method: "DELETE" })
    load()
  }

  if (!isOpen) return null

  const statusColor: Record<string, string> = {
    active: "text-green-500",
    done: "text-gray-400",
    cancelled: "text-gray-400",
    failed: "text-red-500",
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 font-semibold">
            <CalendarClock className="w-5 h-5" /> Scheduled Payments
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 rounded-md text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900" title="Refresh">
              <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {!activeAddress && <p className="text-sm text-gray-500">Set a private key (Autonomous mode) to schedule payments.</p>}
          {activeAddress && loading && items.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          )}
          {activeAddress && !loading && items.length === 0 && (
            <p className="text-sm text-gray-500">No scheduled payments yet. Try: “pay 1 SOL to &lt;address&gt; every week for 4 weeks”.</p>
          )}
          {items.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.amount} {s.token}</span>
                <span className={`text-xs font-medium ${statusColor[s.status] || "text-gray-400"}`}>{s.status}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">To {short(s.recipient)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {s.intervalSecs > 0 ? `Recurring · ${s.remaining} left · next ` : "Runs "}
                {new Date(s.nextRun).toLocaleString()}
              </div>
              <div className="flex items-center gap-3 mt-2">
                {s.lastTx && (
                  <a href={explorerTx(s.lastTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    Last tx <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
                {s.status === "active" && (
                  <button onClick={() => cancel(s.id)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline">
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
