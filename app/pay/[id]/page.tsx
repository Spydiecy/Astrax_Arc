"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Copy, Check, ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { useAccount } from "wagmi"
import { getWalletClient, switchChain } from "wagmi/actions"
import { Card } from "@/components/ui/card"
import { CustomConnectButton } from "@/components/ui/connect-wallet-button"
import { wagmiConfig } from "@/lib/wagmi"
import { estimateArcFees, explorerTx, getPublicClient, resolveNetwork, addrKey, type NetworkKey } from "@/lib/arc"
import { buildNativeTransfer, friendlyError } from "@/lib/evm"
import { waitForTx } from "@/lib/wait-tx"

interface Link {
  id: string
  url: string
  network: NetworkKey
  chainId: number
  recipient: string
  amount: string
  token: string
  description: string
  reference: `0x${string}`
  status: "open" | "paid" | "cancelled"
  paidSignature: string | null
  paidExplorerUrl: string | null
  payer: string | null
  paidAt: number | null
  createdAt: number
}

const POLL_MS = 5000

function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy"}
      onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
    </button>
  )
}

export default function PayPage() {
  const { id } = useParams<{ id: string }>()
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const [link, setLink] = useState<Link | null>(null)
  const [loadError, setLoadError] = useState("")
  const [qr, setQr] = useState("")
  const [phase, setPhase] = useState<"idle" | "wallet" | "confirming" | "error">("idle")
  const [txError, setTxError] = useState("")
  const [sentHash, setSentHash] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment-links/${encodeURIComponent(id)}?check=1`, { cache: "no-store" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Couldn't load this payment link.")
      setLink(j.link)
    } catch (e: any) {
      setLoadError(e?.message || "Couldn't load this payment link.")
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Poll while open so a payment made on another device shows up here too.
  useEffect(() => {
    if (link?.status !== "open") return
    const t = setInterval(() => { if (document.visibilityState === "visible") load() }, POLL_MS)
    return () => clearInterval(t)
  }, [link?.status, load])

  // The QR opens this same page, e.g. in a mobile wallet's built-in browser.
  useEffect(() => {
    if (!link || link.status !== "open") return
    QRCode.toDataURL(window.location.href.split("#")[0], { width: 200, margin: 2 }).then(setQr).catch(() => setQr(""))
  }, [link])

  const network = resolveNetwork(link?.network)
  const sentKey = `astrax_pay_sent:${id}`

  /** Confirm a sent payment (server + browser race), then have the server verify it and mark the link paid. */
  const confirmSent = useCallback(
    async (hash: `0x${string}`, net = network) => {
      setPhase("confirming")
      setTxError("")
      const outcome = await waitForTx(net, hash)
      if (outcome?.status === "reverted") {
        localStorage.removeItem(sentKey)
        setSentHash("")
        setTxError("The payment transaction reverted on-chain, so nothing was paid. You can try again.")
        setPhase("error")
        return
      }
      // Whether or not we saw the receipt, ask the server to check it against the link.
      for (let i = 0; i < 6; i++) {
        const r = await fetch(`/api/payment-links/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash }),
        }).catch(() => null)
        const j = await r?.json().catch(() => ({}))
        if (j?.link) setLink(j.link)
        if (j?.matched || j?.link?.status === "paid") {
          localStorage.removeItem(sentKey)
          setPhase("idle")
          return
        }
        await new Promise((res) => setTimeout(res, 2500))
      }
      // Sent but not matched yet: keep it, the page keeps polling and updates by itself.
      setTxError(outcome ? "Payment sent. Waiting for it to be matched to this link." : "Payment sent, but it hasn't shown as confirmed yet. This page updates by itself once it does.")
      setPhase("idle")
    },
    [id, network, sentKey],
  )

  // After a refresh, pick up a payment that was already sent instead of offering to pay again.
  useEffect(() => {
    if (!link || link.status !== "open") return
    const saved = localStorage.getItem(sentKey)
    if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved) && !sentHash) {
      setSentHash(saved)
      confirmSent(saved as `0x${string}`, resolveNetwork(link.network))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.id, link?.status])

  useEffect(() => {
    if (link?.status === "paid") localStorage.removeItem(sentKey)
  }, [link?.status, sentKey])

  const pay = async () => {
    if (!link || !address || addrKey(address) === addrKey(link.recipient)) return
    setPhase("wallet")
    setTxError("")
    let sent = ""
    try {
      const chainId = network.id
      if (walletChainId !== chainId) await switchChain(wagmiConfig, { chainId })
      const wallet = await getWalletClient(wagmiConfig, { chainId, account: address })
      const client = getPublicClient(network)
      // A plain USDC transfer whose calldata is this link's reference, so the
      // server can tie the payment to the link on-chain.
      const tx = buildNativeTransfer(link.recipient, link.amount, link.reference)
      const hash = await wallet.sendTransaction({
        account: address,
        chain: network.chain,
        to: tx.to,
        value: BigInt(tx.value!),
        data: tx.data,
        ...(await estimateArcFees(client)),
      })
      sent = hash
      // Remember it right away: a refresh must never forget a payment that was sent.
      localStorage.setItem(sentKey, hash)
      setSentHash(hash)
      await confirmSent(hash)
    } catch (e) {
      setTxError(sent ? "Your payment was sent. This page will update by itself once it is seen on-chain." : friendlyError(e, network))
      setPhase(sent ? "idle" : "error")
    }
  }

  if (loadError) {
    return (
      <Shell>
        <Card className="p-6 text-center border-gray-300 dark:border-gray-800">
          <h1 className="text-2xl font-bold mb-2">Payment link unavailable</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
        </Card>
      </Shell>
    )
  }
  if (!link) {
    return (
      <Shell>
        <div className="flex justify-center py-24 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      </Shell>
    )
  }

  // The creator can't pay their own link (the server also ignores such payments).
  const isOwnLink = Boolean(address && addrKey(address) === addrKey(link.recipient))
  const busy = phase === "wallet" || phase === "confirming"
  const wrongChain = isConnected && walletChainId !== network.id

  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-1">Payment request</h1>
        <p className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chain/arc.png" alt="" className="h-4 w-4 rounded-full" /> {network.name}
          {!network.isTestnet && <span className="text-xs">(real USDC)</span>}
        </p>
      </div>

      <Card className="p-6 border-gray-300 dark:border-gray-800 space-y-4">
        <div className="text-center">
          <div className="text-4xl font-bold inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/usdc.png" alt="" className="h-8 w-8" />
            {link.amount} <span className="text-2xl text-gray-500">{link.token}</span>
          </div>
          {link.description && <p className="mt-2 text-gray-600 dark:text-gray-300">{link.description}</p>}
        </div>
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">To</span>
          <span className="flex items-center gap-1 min-w-0">
            <span className="font-mono text-xs break-all text-right">{link.recipient}</span>
            <CopyText value={link.recipient} />
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Status</span>
          <StatusBadge status={link.status} />
        </div>
      </Card>

      {link.status === "paid" && (
        <Card className="p-5 border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30" role="status">
          <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-300"><CheckCircle2 className="h-5 w-5" /> Paid</div>
          {link.paidAt && <p className="mt-1 text-sm text-green-700/80 dark:text-green-300/80">{new Date(link.paidAt).toLocaleString()}</p>}
          {link.paidExplorerUrl && (
            <a href={link.paidExplorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-300 hover:underline">
              View transaction <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </Card>
      )}

      {link.status === "cancelled" && (
        <Card className="p-5 border-gray-300 dark:border-gray-800 text-center" role="status">
          <p className="font-semibold">This payment link was cancelled</p>
          <p className="text-sm text-gray-500 mt-1">Ask the sender for a new one.</p>
        </Card>
      )}

      {link.status === "open" && (
        <>
          {!isConnected ? (
            <Card className="p-6 border-gray-300 dark:border-gray-800 text-center">
              <h2 className="font-semibold mb-3">Connect a wallet to pay</h2>
              <div className="flex justify-center"><CustomConnectButton /></div>
            </Card>
          ) : isOwnLink ? (
            <p className="text-center text-sm text-gray-500" role="status">This is your own payment link, so you can&apos;t pay it. Share it with the person who should pay.</p>
          ) : (
            <button
              type="button"
              onClick={pay}
              disabled={busy || Boolean(sentHash)}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black py-4 text-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-70"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              {phase === "wallet" ? "Confirm in your wallet…" : phase === "confirming" ? "Confirming payment…" : wrongChain ? `Switch to ${network.name} & pay` : `Pay ${link.amount} ${link.token}`}
            </button>
          )}

          {txError && (
            <p className={`text-sm text-center ${phase === "error" ? "text-red-600 dark:text-red-400" : "text-gray-500"}`} role={phase === "error" ? "alert" : "status"}>{txError}</p>
          )}
          {sentHash && link.status === "open" && phase !== "error" && (
            <p className="text-xs text-center text-gray-500">
              Sent. <a className="underline" href={explorerTx(network, sentHash)} target="_blank" rel="noreferrer">View transaction</a>. Waiting for confirmation…
            </p>
          )}

          {qr && (
            <Card className="p-6 border-gray-300 dark:border-gray-800 text-center">
              <h2 className="font-semibold mb-1">Paying from your phone?</h2>
              <p className="text-xs text-gray-500 mb-3">Scan to open this page in your mobile wallet&apos;s browser. It updates automatically once the payment lands.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code that opens this payment page" className="mx-auto rounded-lg bg-white" width={200} height={200} />
            </Card>
          )}
          <p className="text-center text-xs text-gray-500">
            Network fees on Arc are paid in USDC and cost a fraction of a cent.
            {network.faucetUrl && (
              <> Need test USDC? <a className="underline" href={network.faucetUrl} target="_blank" rel="noreferrer">Circle faucet</a>.</>
            )}
          </p>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white dark:bg-black text-black dark:text-white p-4">
      <div className="max-w-md mx-auto space-y-5 py-8">{children}</div>
    </main>
  )
}

function StatusBadge({ status }: { status: Link["status"] }) {
  if (status === "paid") return <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium"><CheckCircle2 className="h-4 w-4" /> Paid</span>
  if (status === "cancelled") return <span className="inline-flex items-center gap-1 text-gray-500 font-medium"><XCircle className="h-4 w-4" /> Cancelled</span>
  return <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium"><Loader2 className="h-4 w-4 animate-spin" /> Awaiting payment</span>
}
