"use client"

import { useChat } from "@ai-sdk/react"
import { useEffect, useRef, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import {
  Bot, User, Send, Mic, MicOff, Loader2, Wallet, ArrowUpRight, Coins,
  Boxes, LineChart, Link2, Copy, Check, CalendarClock, FileText, Rocket,
  Paperclip, X, Image as ImageIcon, Code, ShieldCheck, ShieldAlert, Info, AlertTriangle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCredentials } from "@/contexts/CredentialsContext"
import { OnboardingModal } from "@/components/onboarding-modal"
import { TxActionButton, type PendingAction } from "@/components/ui/tx-action-button"
import TokenListCard from "@/components/ui/token-list-card"
import CandlestickChart from "@/components/ui/candlestick-chart"
import { AgentSteps } from "@/components/ui/agent-steps"
import { uploadFileToIPFS } from "@/lib/pinata"
import { getCurrentId, newChat, getMessages, saveMessages } from "@/lib/chat-history"
import { explorerTx } from "@/lib/solana"
import type { Message } from "@ai-sdk/react"

// ── Minimal markdown renderer (bold / code / lists / breaks) ────────────────────
function Markdown({ text }: { text: string }) {
  const fmt = (line: string, key: string | number) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return (
      <span key={key}>
        {parts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
          if (p.startsWith("`") && p.endsWith("`"))
            return <code key={j} className="font-mono text-xs px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-800">{p.slice(1, -1)}</code>
          return <span key={j}>{p}</span>
        })}
      </span>
    )
  }
  const lines = text.split("\n")
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1" />
        if (line.startsWith("- ") || line.startsWith("• "))
          return <div key={i} className="flex gap-2"><span>•</span><span>{fmt(line.slice(2), i)}</span></div>
        if (/^\d+\.\s/.test(line))
          return <div key={i} className="pl-1">{fmt(line, i)}</div>
        return <p key={i}>{fmt(line, i)}</p>
      })}
    </div>
  )
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
    </button>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 text-sm py-1">
    <span className="text-gray-500 dark:text-gray-400">{label}</span>
    <span className="font-medium text-right break-all">{children}</span>
  </div>
)

const CardShell = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="mt-3 w-full max-w-xl rounded-lg border border-gray-300 dark:border-gray-800 bg-white dark:bg-black p-4">
    <div className="flex items-center gap-2 mb-3 text-sm font-medium">
      <div className="w-7 h-7 rounded-full bg-gray-800 dark:bg-white text-white dark:text-black flex items-center justify-center">{icon}</div>
      {title}
    </div>
    {children}
  </div>
)

const short = (a?: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "")

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// ── Image / diagram card (generated images + mermaid diagrams) ──────────────────
function ImageCard({ result }: { result: any }) {
  const [showSource, setShowSource] = useState(false)
  const src = result.imageBase64 ? `data:image/png;base64,${result.imageBase64}` : result.imageUrl
  return (
    <div className="mt-3 w-full max-w-xl rounded-lg border border-gray-300 dark:border-gray-800 bg-white dark:bg-black p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className="w-7 h-7 rounded-full bg-gray-800 dark:bg-white text-white dark:text-black flex items-center justify-center"><ImageIcon className="w-4 h-4" /></div>
          {result.title || "Image"}
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
          Open <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={result.title || "generated image"} className="w-full rounded-md border border-gray-200 dark:border-gray-800" />
      {result.mermaid && (
        <div className="mt-2">
          <button onClick={() => setShowSource((s) => !s)} className="text-xs text-gray-500 hover:text-black dark:hover:text-white inline-flex items-center gap-1">
            <Code className="w-3.5 h-3.5" /> {showSource ? "Hide" : "View"} Mermaid source
          </button>
          {showSource && (
            <pre className="mt-2 text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{result.mermaid}</pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Render a tool result into a card ────────────────────────────────────────────
function ToolCard({ result }: { result: any }) {
  if (!result || result.error) {
    return result?.error ? (
      <div className="mt-3 w-full max-w-xl rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
        <Markdown text={result.error} />
      </div>
    ) : null
  }

  // Wallet-mode prepared transaction → render a one-click confirm button.
  if (result.kind === "action") {
    return <TxActionButton action={result as PendingAction} />
  }

  switch (result.kind) {
    case "balance":
      return (
        <CardShell icon={<Wallet className="w-4 h-4" />} title="Balance">
          <Field label="Address">{short(result.address)}</Field>
          <Field label="Balance">{result.balance} {result.symbol}</Field>
          {result.usdValue && <Field label="≈ USD">${result.usdValue}</Field>}
        </CardShell>
      )
    case "transaction":
      return (
        <CardShell icon={<ArrowUpRight className="w-4 h-4" />} title={result.action === "send" ? "Payment Sent" : result.action === "mint" ? "NFT Minted" : "Transaction"}>
          <div className="flex items-center justify-between gap-3 text-sm py-1">
            <span className="text-gray-500 dark:text-gray-400">Hash</span>
            <span className="font-mono text-xs flex items-center gap-1">{short(result.hash)} <CopyBtn value={result.hash} /></span>
          </div>
          {result.status && <Field label="Status">{result.status}</Field>}
          {result.from && <Field label="From">{short(result.from)}</Field>}
          {result.to && <Field label="To">{short(result.to)}</Field>}
          {result.value && <Field label="Value">{result.value}</Field>}
          {result.blockNumber && <Field label="Block">{result.blockNumber}</Field>}
          {result.gasUsed && <Field label="Gas Used">{result.gasUsed}</Field>}
          <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View on Solana Explorer <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </CardShell>
      )
    case "blocks":
      return (
        <CardShell icon={<Boxes className="w-4 h-4" />} title="Latest Blocks">
          <div className="space-y-2">
            {result.blocks.map((b: any) => (
              <div key={b.blockNumber} className="rounded border border-gray-200 dark:border-gray-800 p-2 text-sm">
                <div className="flex justify-between"><span className="font-medium">#{b.blockNumber}</span><span className="text-gray-500">{b.transactionCount} txns</span></div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{b.timestamp}</div>
              </div>
            ))}
          </div>
        </CardShell>
      )
    case "block":
      return (
        <CardShell icon={<Boxes className="w-4 h-4" />} title={`Block #${result.blockNumber}`}>
          <Field label="Hash">{short(result.hash)}</Field>
          <Field label="Time">{result.timestamp}</Field>
          <Field label="Transactions">{result.transactionCount}</Field>
          <Field label="Gas Used">{result.gasUsed}</Field>
          {result.miner && <Field label="Miner">{short(result.miner)}</Field>}
        </CardShell>
      )
    case "tokenList":
      return <div className="mt-3 w-full max-w-xl"><TokenListCard tokens={result.tokens} /></div>
    case "candlestick":
      return (
        <div className="mt-3 w-full max-w-2xl">
          <CandlestickChart data={result.data} symbol={result.symbol} />
          {result.indicative && (
            <p className="mt-1 text-xs text-gray-500">Indicative series — {result.symbol} has no live Coinbase market, derived from spot price.</p>
          )}
        </div>
      )
    case "image":
      return <ImageCard result={result} />
    case "market":
      return (
        <CardShell icon={<LineChart className="w-4 h-4" />} title={`${result.name} Market`}>
          {result.price != null && <Field label="Price">${result.price}</Field>}
          {result.change24h != null && <Field label="24h"><span className={result.change24h >= 0 ? "text-green-500" : "text-red-500"}>{result.change24h.toFixed(2)}%</span></Field>}
          {result.marketCap != null && <Field label="Market Cap">${Number(result.marketCap).toLocaleString()}</Field>}
          {result.volume24h != null && <Field label="24h Volume">${Number(result.volume24h).toLocaleString()}</Field>}
        </CardShell>
      )
    case "activity":
      return (
        <CardShell icon={<LineChart className="w-4 h-4" />} title="Recent Activity">
          <div className="space-y-2">
            {result.transactions.length === 0 && (
              <p className="text-sm text-gray-500">{result.note || "No recent transactions."}</p>
            )}
            {result.transactions.map((t: any) => (
              <a key={t.hash} href={explorerTx(t.hash)} target="_blank" rel="noreferrer" className="block rounded border border-gray-200 dark:border-gray-800 p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-900">
                <div className="flex justify-between"><span className="font-mono text-xs">{short(t.hash)}</span><span className="text-gray-500">{t.value}</span></div>
                <div className="text-xs text-gray-500">{short(t.from)} → {short(t.to)}</div>
              </a>
            ))}
            {result.explorerUrl && (
              <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                View on Solana Explorer <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </CardShell>
      )
    case "deploy":
      return (
        <CardShell icon={<Rocket className="w-4 h-4" />} title={result.what === "token" ? "Token Deployed" : result.what === "nft" ? "NFT Collection Deployed" : "Contract Deployed"}>
          {result.name && <Field label="Name">{result.name}{result.symbol ? ` (${result.symbol})` : ""}</Field>}
          {result.supply && <Field label="Supply">{result.supply}</Field>}
          {result.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.image} alt="NFT artwork" className="my-2 max-h-40 rounded-md border border-gray-200 dark:border-gray-800" />
          )}
          <div className="flex items-center justify-between gap-3 text-sm py-1">
            <span className="text-gray-500 dark:text-gray-400">Contract</span>
            <span className="font-mono text-xs flex items-center gap-1">{short(result.contractAddress)} <CopyBtn value={result.contractAddress || ""} /></span>
          </div>
          <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View on Solana Explorer <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </CardShell>
      )
    case "schedule":
      return (
        <CardShell icon={<CalendarClock className="w-4 h-4" />} title="Transfer Scheduled">
          <Field label="To">{short(result.to)}</Field>
          <Field label="Amount">{result.amount}</Field>
          <Field label="First run">{result.runAt}</Field>
          {result.recurrence && result.recurrence !== "once" && <Field label="Repeats">{result.recurrence}</Field>}
          {result.note && <p className="mt-2 text-xs text-gray-500">{result.note}</p>}
        </CardShell>
      )
    case "scheduleList":
      return (
        <CardShell icon={<CalendarClock className="w-4 h-4" />} title="Scheduled Payments">
          {result.schedules.length === 0 ? <p className="text-sm text-gray-500">Nothing scheduled.</p> : result.schedules.map((s: any) => (
            <div key={s.id} className="rounded border border-gray-200 dark:border-gray-800 p-2 text-sm mb-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.amount}</span>
                <span className="text-xs text-gray-500">{s.status}{s.recurrence && s.recurrence !== "once" ? ` · ${s.recurrence}` : ""}</span>
              </div>
              <div className="text-xs text-gray-500">To {short(s.to)} · {s.runAt}</div>
            </div>
          ))}
        </CardShell>
      )
    case "scheduleCancelled":
      return (
        <CardShell icon={<CalendarClock className="w-4 h-4" />} title="Schedule Cancelled">
          <Field label="ID">{result.id}</Field>
        </CardShell>
      )
    case "paymentLink":
      return (
        <CardShell icon={<Link2 className="w-4 h-4" />} title="Payment Link">
          {result.description && <Field label="For">{result.description}</Field>}
          <Field label="Amount">{result.amount}</Field>
          <div className="mt-2 flex items-center gap-2 rounded border border-gray-200 dark:border-gray-800 p-2">
            <span className="font-mono text-xs flex-1 break-all">{result.url}</span>
            <CopyBtn value={result.url} />
          </div>
          <a href={result.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Open link <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </CardShell>
      )
    case "contact":
      return (
        <CardShell icon={<User className="w-4 h-4" />} title={result.saved ? "Contact Saved" : "Contact"}>
          <Field label="Name">{result.name}</Field>
          <Field label="Address">{short(result.address)}</Field>
        </CardShell>
      )
    case "contactList":
      return (
        <CardShell icon={<User className="w-4 h-4" />} title="Contacts">
          {result.contacts.length === 0 ? <p className="text-sm text-gray-500">No contacts saved.</p> : result.contacts.map((c: any) => (
            <Field key={c.name} label={c.name}>{short(c.address)}</Field>
          ))}
        </CardShell>
      )
    case "asset":
      return (
        <CardShell icon={<FileText className="w-4 h-4" />} title="Asset Stored">
          <Field label="Description">{result.description}</Field>
          <Field label="Link">{result.link}</Field>
        </CardShell>
      )
    case "assetList":
      return (
        <CardShell icon={<FileText className="w-4 h-4" />} title="Your Assets">
          {result.assets.length === 0 ? <p className="text-sm text-gray-500">No assets stored.</p> : result.assets.map((a: any, i: number) => (
            <div key={i} className="rounded border border-gray-200 dark:border-gray-800 p-2 text-sm mb-2">
              <div className="font-medium">{a.description}</div>
              <div className="text-xs text-gray-500 break-all">{a.link}</div>
            </div>
          ))}
        </CardShell>
      )
    case "explain": {
      const riskStyle = (lvl: string) =>
        lvl === "high"
          ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300"
          : lvl === "medium"
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/60 text-amber-700 dark:text-amber-300"
            : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300"
      const RiskIcon = ({ lvl }: { lvl: string }) =>
        lvl === "high" ? <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : lvl === "medium" ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      return (
        <CardShell icon={<ShieldCheck className="w-4 h-4" />} title={result.title}>
          <p className="text-sm mb-3 text-gray-700 dark:text-gray-200">{result.summary}</p>
          {result.fields?.map((f: any, i: number) => (
            <Field key={i} label={f.label}>{f.mono ? <span className="font-mono text-xs">{f.value}</span> : f.value}</Field>
          ))}
          {result.method && (
            <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-800 p-2">
              {result.method.name === "functions" ? (
                <>
                  <div className="text-xs text-gray-500 mb-1.5">Functions ({result.method.params.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {result.method.params.map((p: any, i: number) => (
                      <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{p.name}</span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-gray-500 mb-1">Decoded call: <span className="font-mono text-black dark:text-white">{result.method.name}</span></div>
                  {result.method.params.map((p: any, i: number) => (
                    <div key={i} className="text-xs flex gap-2 py-0.5">
                      <span className="text-gray-500 whitespace-nowrap">{p.name || p.type}</span>
                      <span className="font-mono break-all text-right flex-1">{p.value}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {result.risks?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {result.risks.map((r: any, i: number) => (
                <div key={i} className={cn("flex items-start gap-2 text-xs rounded-md px-2.5 py-2 border", riskStyle(r.level))}>
                  <RiskIcon lvl={r.level} />
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          )}
          <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View on Solana Explorer <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </CardShell>
      )
    }
    case "swap":
      return (
        <CardShell icon={<Coins className="w-4 h-4" />} title="Swap">
          <Field label="From">{result.amount} {result.fromCurrency}</Field>
          <Field label="To">{result.toCurrency}</Field>
          <Field label="Status">{result.status}</Field>
          {result.note && <p className="mt-2 text-xs text-gray-500">{result.note}</p>}
        </CardShell>
      )
    default:
      return null
  }
}

const WELCOME = `Hey, I'm **Astrax** 👋 — your AI agent for **Solana**.

Try things like:
- "What's my **SOL** balance?"
- "Send **1 SOL** to \`<address>\`"
- "Create a token **MoonCoin MOON** supply **1000000**"
- "Show the **latest blocks**" or "**SOL** market data"
- "Create a **payment link** for 0.5 SOL"
- "Schedule **2 SOL** to \`<address>\` **in 10 minutes**"

Pick a signing mode in the sidebar **Signing** panel — connect a **wallet** (approve each txn with a button) or go **autonomous** with a secret key. Tap **How it works** anytime for the tour.`

const SUGGESTIONS = [
  { icon: <Wallet className="w-3.5 h-3.5" />, label: "Check my SOL balance", prompt: "What's my SOL balance?" },
  { icon: <LineChart className="w-3.5 h-3.5" />, label: "SOL price chart", prompt: "Show me the SOL price chart for the last 7 days" },
  { icon: <Rocket className="w-3.5 h-3.5" />, label: "Create a token", prompt: "Create a token called MoonCoin with symbol MOON and supply 1000000" },
  { icon: <Code className="w-3.5 h-3.5" />, label: "Workflow diagram", prompt: "Draw a workflow diagram for minting an SPL token" },
  { icon: <Link2 className="w-3.5 h-3.5" />, label: "Payment link", prompt: "Create a payment link for 0.5 SOL" },
  { icon: <Boxes className="w-3.5 h-3.5" />, label: "Latest blocks", prompt: "Show me the latest blocks on Solana" },
  { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: "Explain an address", prompt: "Explain this address and tell me if it's safe: So11111111111111111111111111111111111111112" },
]

// Outer manager: owns the active chat id and swaps the keyed session on open.
export default function AstraxChatPage() {
  const [chatId, setChatId] = useState<string | null>(null)

  useEffect(() => {
    let id = getCurrentId()
    if (!id) id = newChat()
    setChatId(id)
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.id) setChatId(detail.id)
    }
    window.addEventListener("astrax:chat-open", onOpen)
    return () => window.removeEventListener("astrax:chat-open", onOpen)
  }, [])

  if (!chatId) return null
  return <ChatSession key={chatId} chatId={chatId} />
}

function ChatSession({ chatId }: { chatId: string }) {
  const { privateKey, signingMode } = useCredentials()
  const { publicKey } = useWallet()
  const address = publicKey?.toBase58() ?? null
  const [isRecording, setIsRecording] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  // Keep the latest signing context in a ref so each request sends fresh values.
  const ctxRef = useRef({ privateKey, signingMode, address })
  ctxRef.current = { privateKey, signingMode, address }

  const stored = getMessages(chatId)
  const initialMessages: Message[] =
    stored.length > 0 ? (stored as unknown as Message[]) : [{ id: "welcome", role: "assistant", content: WELCOME }]

  const { messages, input, handleInputChange, handleSubmit, status, setInput, append } = useChat({
    api: "/api/agent",
    id: chatId,
    initialMessages,
    experimental_prepareRequestBody: ({ messages }) => ({
      // Keep the model text-only (strip image attachments used purely for display).
      messages: messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content, toolInvocations: m.toolInvocations })),
      signingMode: ctxRef.current.signingMode,
      credentials: { privateKey: ctxRef.current.privateKey },
      walletAddress: ctxRef.current.address ?? null,
    }),
  })

  const isLoading = status === "submitted" || status === "streaming"

  // Show the tutorial once per browser, and when the header button asks for it.
  useEffect(() => {
    if (!localStorage.getItem("astrax_onboarded")) setShowOnboarding(true)
    const open = () => setShowOnboarding(true)
    window.addEventListener("openOnboarding", open)
    return () => window.removeEventListener("openOnboarding", open)
  }, [])

  const closeOnboarding = () => {
    localStorage.setItem("astrax_onboarded", "1")
    setShowOnboarding(false)
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  // Persist the conversation to the browser once a turn settles.
  useEffect(() => {
    if (status === "ready" || status === "error") saveMessages(chatId, messages as any)
  }, [status, messages, chatId])

  const toggleRecording = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SR) { alert("Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari."); return }
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return }
    const rec = new SR()
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = true
    rec.onresult = (e: any) => {
      let t = ""
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript
      if (t) setInput(input + t)
    }
    rec.onend = () => setIsRecording(false)
    rec.onerror = () => setIsRecording(false)
    recognitionRef.current = rec
    rec.start(); setIsRecording(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading || uploading) return
    if (!input.trim() && files.length === 0) return

    // If files are attached, upload them to IPFS first, then hand the links to the agent.
    if (files.length > 0) {
      setUploading(true)
      try {
        const links: string[] = []
        for (const f of files) {
          const { ipfsUrl } = await uploadFileToIPFS(f)
          links.push(`${f.name}: ${ipfsUrl}`)
        }
        // Image thumbnails to show inside the user's own message bubble.
        const previews = await Promise.all(
          files.filter((f) => f.type.startsWith("image/")).map(async (f) => ({ name: f.name, contentType: f.type, url: await fileToDataURL(f) })),
        )
        const base = input.trim() ? `${input.trim()}\n\n` : ""
        const text = `${base}I attached file(s) uploaded to IPFS: ${links.join(" | ")}. Use the IPFS URL as needed — e.g. as the \`image\` for deployNFT, or save it with storeAsset.`
        setInput("")
        setFiles([])
        append({ role: "user", content: text, experimental_attachments: previews })
      } catch {
        alert("IPFS upload failed. Add NEXT_PUBLIC_PINATA_JWT to enable file uploads.")
      } finally {
        setUploading(false)
      }
      return
    }

    handleSubmit(e)
  }

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="w-full space-y-5">
          {messages.map((m, idx) => {
            const invocations = (m as any).toolInvocations ?? []
            const isLastAssistant = idx === messages.length - 1 && m.role === "assistant"
            const stepsActive = isLoading && isLastAssistant
            return (
              <div key={m.id} className={cn("flex items-start gap-3", m.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  m.role === "assistant" ? "bg-gray-200 dark:bg-gray-800" : "bg-gray-800 dark:bg-white text-white dark:text-black",
                )}>
                  {m.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start", "max-w-[85%]")}>
                  {m.role === "assistant" && <AgentSteps invocations={invocations} active={stepsActive} />}
                  {m.content && (
                    <div className={cn(
                      "rounded-lg p-3.5 border text-sm",
                      m.role === "user"
                        ? "bg-gray-800 dark:bg-white text-white dark:text-black border-transparent"
                        : "bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800",
                    )}>
                      <Markdown text={m.content} />
                    </div>
                  )}
                  {/* Image attachments the user sent (shown in their own bubble) */}
                  {(m as any).experimental_attachments?.length > 0 && (
                    <div className={cn("mt-2 flex flex-wrap gap-2", m.role === "user" ? "justify-end" : "")}>
                      {(m as any).experimental_attachments
                        .filter((a: any) => a.contentType?.startsWith("image/"))
                        .map((a: any, i: number) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={a.url} alt={a.name} className="max-h-40 rounded-lg border border-gray-300 dark:border-gray-700" />
                        ))}
                    </div>
                  )}
                  {invocations.map((inv: any) =>
                    inv.state === "result" ? <ToolCard key={inv.toolCallId} result={inv.result} /> : null,
                  )}
                </div>
              </div>
            )
          })}

          {/* Starter suggestions (only on a fresh conversation) */}
          {messages.length <= 1 && !isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 flex-shrink-0" />
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => append({ role: "user", content: s.prompt })}
                    className="inline-flex items-center gap-1.5 text-sm rounded-full border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:border-gray-500 dark:hover:border-gray-500 hover:text-black dark:hover:text-white transition-colors"
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-lg p-3.5 border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-gray-900/50 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-4">
        {/* Attached file chips */}
        {files.length > 0 && (
          <div className="w-full mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 px-2 py-1">
                <FileText className="w-3.5 h-3.5" /> {f.name}
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-black dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="w-full relative">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder={uploading ? "Uploading to IPFS…" : "Message Astrax…"}
            disabled={isLoading || uploading}
            className="w-full bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 pr-28 py-5 text-base rounded-lg"
          />
          <input ref={fileInputRef} type="file" multiple onChange={onPickFiles} className="hidden" accept="image/*,.pdf,.json,.txt,.doc,.docx" />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || uploading}
              className="p-2 rounded-md text-gray-500 hover:text-black dark:hover:text-white transition-colors"
              title="Attach a file (stored on IPFS)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || uploading}
              className={cn("p-2 rounded-md transition-colors", isRecording ? "text-red-500 bg-red-50 dark:bg-red-950 animate-pulse" : "text-gray-500 hover:text-black dark:hover:text-white")}
              title={isRecording ? "Stop recording" : "Voice input"}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <Button type="submit" size="sm" disabled={isLoading || uploading || (!input.trim() && files.length === 0)} className="bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
