"use client"

// Simple, untracked payment page: /payment-link/<address>/<amount>?network=mainnet|testnet
// (tracked links created by the agent live at /pay/<id>).
import { useParams, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Copy, ExternalLink } from "lucide-react"
import QRCode from "qrcode"
import { useAccount } from "wagmi"
import { getWalletClient, switchChain } from "wagmi/actions"
import { CustomConnectButton } from "@/components/ui/connect-wallet-button"
import { useNetwork } from "@/contexts/NetworkContext"
import { wagmiConfig } from "@/lib/wagmi"
import { NATIVE_SYMBOL, estimateArcFees, explorerTx, getPublicClient, isNetworkKey, isSendableAddress, resolveNetwork } from "@/lib/arc"
import { buildNativeTransfer, friendlyError } from "@/lib/evm"

export default function PaymentPortalPage() {
  const params = useParams()
  const search = useSearchParams()
  const { network: appNetwork } = useNetwork()
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending")
  const [hash, setHash] = useState<string>("")
  const [error, setError] = useState("")

  const receiverAddress = decodeURIComponent(params.address as string)
  const amount = decodeURIComponent(params.amount as string)
  const networkParam = search.get("network")
  const network = isNetworkKey(networkParam) ? resolveNetwork(networkParam) : appNetwork
  const isValidLink =
    isSendableAddress(receiverAddress) && /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0

  const { address, isConnected, chainId: walletChainId } = useAccount()

  useEffect(() => {
    if (!isValidLink) return
    QRCode.toDataURL(window.location.href, { width: 200, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(""))
  }, [isValidLink])

  const sendPayment = async () => {
    if (!isConnected || !address) return
    setPaymentStatus("processing")
    setError("")
    try {
      const chainId = network.id
      if (walletChainId !== chainId) await switchChain(wagmiConfig, { chainId })
      const wallet = await getWalletClient(wagmiConfig, { chainId, account: address })
      const client = getPublicClient(network)
      const tx = buildNativeTransfer(receiverAddress, amount)
      const txHash = await wallet.sendTransaction({
        account: address,
        chain: network.chain,
        to: tx.to,
        value: BigInt(tx.value!),
        ...(await estimateArcFees(client)),
      })
      setHash(txHash)
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 })
      if (receipt.status !== "success") throw new Error("Transaction failed on-chain")
      setPaymentStatus("completed")
    } catch (e) {
      setError(friendlyError(e, network))
      setPaymentStatus("failed")
    }
  }

  const getStatusColor = () => {
    switch (paymentStatus) {
      case "processing":
        return "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-md px-3 py-1"
      case "completed":
        return "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 rounded-md px-3 py-1"
      case "failed":
        return "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-md px-3 py-1"
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md px-3 py-1"
    }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text).catch(() => {})

  if (!isValidLink) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white p-4 flex items-center justify-center">
        <Card className="max-w-md w-full p-6 text-center border-gray-300 dark:border-gray-800">
          <h1 className="text-2xl font-bold mb-2">Invalid payment link</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">This link has a malformed address or amount. Ask the sender for a new link.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white p-4 transition-colors duration-300">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">Payment Portal</h1>
          <p className="text-gray-600 dark:text-gray-400">USDC payment request on {network.name}</p>
        </div>

        <Card className="bg-white dark:bg-black border-gray-300 dark:border-gray-800 p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start gap-3">
              <span className="text-gray-600 dark:text-gray-400">Receiver Address:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono break-all max-w-xs text-black dark:text-white">{receiverAddress}</span>
                <Button variant="ghost" size="sm" aria-label="Copy address" onClick={() => copyToClipboard(receiverAddress)} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Amount:</span>
              <span className="font-semibold text-black dark:text-white">{amount} {NATIVE_SYMBOL}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Status:</span>
              <span className={getStatusColor()}>{paymentStatus}</span>
            </div>

            {hash && (
              <div className="flex justify-between items-start gap-3">
                <span className="text-gray-600 dark:text-gray-400">Transaction:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono break-all max-w-xs text-black dark:text-white">{hash.slice(0, 10)}…{hash.slice(-8)}</span>
                  <Button variant="ghost" size="sm" aria-label="Copy transaction hash" onClick={() => copyToClipboard(hash)} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="View on explorer" onClick={() => window.open(explorerTx(network, hash), "_blank")} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          </div>
        </Card>

        {qrCodeUrl && (
          <Card className="bg-white dark:bg-black border-gray-300 dark:border-gray-800 p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1 text-black dark:text-white">Open on your phone</h3>
              <p className="text-xs text-gray-500 mb-4">Scan to open this page in your mobile wallet&apos;s browser.</p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="QR code that opens this payment page" className="rounded-lg" />
              </div>
            </div>
          </Card>
        )}

        {!isConnected ? (
          <Card className="bg-white dark:bg-black border-gray-300 dark:border-gray-800 p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4 text-black dark:text-white">Connect Wallet to Pay</h3>
              <div className="flex justify-center">
                <CustomConnectButton />
              </div>
            </div>
          </Card>
        ) : (
          <Button
            onClick={sendPayment}
            disabled={paymentStatus === "processing" || paymentStatus === "completed"}
            className="w-full bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 font-semibold py-4 text-lg border-0"
          >
            {paymentStatus === "processing" ? "Processing Payment..." : paymentStatus === "completed" ? "Payment Completed" : `Pay ${amount} ${NATIVE_SYMBOL}`}
          </Button>
        )}

        <Card className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-800 p-4">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>This payment is sent directly on Arc, with USDC as the gas token.</p>
            <p>Network: {network.name} (chain {network.id})</p>
            <p>All transactions are recorded on-chain for transparency</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
