"use client"

import { useEffect, useState } from "react"
import { Loader2, Check, X, ChevronDown, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const LABELS: Record<string, string> = {
  resolveContact: "Resolving contact",
  saveContact: "Saving contact",
  deleteContact: "Removing contact",
  listContacts: "Loading contacts",
  getBalance: "Checking balance",
  getTokenBalance: "Checking token balance",
  getTransaction: "Fetching transaction",
  getLatestBlocks: "Reading latest blocks",
  getBlock: "Reading block",
  listTokens: "Listing tokens",
  getMarketData: "Fetching market data",
  getPriceChart: "Loading price chart",
  getAddressActivity: "Reading address activity",
  explain: "Analysing on-chain data",
  sendPayment: "Preparing transfer",
  deployToken: "Creating token",
  deployNFT: "Creating NFT",
  mintTokens: "Minting tokens",
  deployContract: "Compiling & deploying contract",
  callContract: "Calling contract",
  listContracts: "Loading your contracts",
  scheduleTransfer: "Scheduling payment",
  listSchedules: "Loading schedules",
  cancelSchedule: "Cancelling schedule",
  createPaymentLink: "Creating payment link",
  listPaymentLinks: "Loading payment links",
  storeAsset: "Storing asset on IPFS",
  listAssets: "Loading assets",
  swap: "Preparing swap",
  generateDiagram: "Drawing diagram",
  generateImage: "Generating image",
}

const short = (a?: string) => (typeof a === "string" && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a || "")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function labelFor(inv: any): string {
  return LABELS[inv.toolName] || inv.toolName
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detailFor(inv: any): string | undefined {
  const r = inv.state === "result" ? inv.result : null
  const a = inv.args || {}
  if (r && !r.error) {
    if (r.hash) return short(r.hash)
    if (r.contractAddress) return short(r.contractAddress)
    if (r.resolvedAddress) return short(r.resolvedAddress)
    if (r.address) return short(r.address)
    if (r.url) return "link ready"
  }
  // Long strings are addresses; short ones are contact names.
  if (typeof a.to === "string") return a.to.length > 30 ? short(a.to) : a.to
  if (typeof a.target === "string") return short(a.target)
  if (typeof a.name === "string") return a.name
  if (typeof a.symbol === "string") return a.symbol
  return undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AgentSteps({ invocations, active }: { invocations: any[]; active: boolean }) {
  const [expanded, setExpanded] = useState(active)
  useEffect(() => setExpanded(active), [active])

  const count = invocations?.length ?? 0
  if (count === 0 && !active) return null

  return (
    <div className="mb-2 w-full max-w-xl rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center gap-2 px-3 py-2 text-xs">
        <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          {active ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        </span>
        <span className="font-medium text-gray-600 dark:text-gray-300">
          {active ? "Thinking…" : `Worked through ${count} step${count === 1 ? "" : "s"}`}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 ml-auto text-gray-400 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && count > 0 && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 border-t border-gray-200/60 dark:border-gray-800/60">
          {invocations.map((inv, i) => {
            const done = inv.state === "result"
            const err = done && inv.result?.error
            const detail = detailFor(inv)
            return (
              <div key={inv.toolCallId || i} className="flex items-center gap-2 text-xs pt-1.5">
                <span className="flex-shrink-0">
                  {err ? (
                    <X className="w-3.5 h-3.5 text-red-500" />
                  ) : done ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  )}
                </span>
                <span className={cn("text-gray-600 dark:text-gray-300", done && !err && "text-gray-500 dark:text-gray-400")}>{labelFor(inv)}</span>
                {detail && <span className="font-mono text-gray-400 truncate">{detail}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
