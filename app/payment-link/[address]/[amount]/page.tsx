"use client"

import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Copy, ExternalLink } from "lucide-react"
import QRCode from "qrcode"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { PublicKey } from "@solana/web3.js"
import { buildSolTransfer } from "@/lib/spl"
import { CustomConnectButton } from "@/components/ui/connect-wallet-button"
import { NATIVE_SYMBOL, CLUSTER_LABEL, explorerTx, isValidAddress } from "@/lib/solana"

export default function PaymentPortalPage() {
  const params = useParams()
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending")
  const [signature, setSignature] = useState<string>("")

  const receiverAddress = decodeURIComponent(params.address as string)
  const amount = decodeURIComponent(params.amount as string)
  const isValidLink = isValidAddress(receiverAddress) && /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0

  const { connection } = useConnection()
  const { publicKey, connected, sendTransaction } = useWallet()

  useEffect(() => {
    const generateQR = async () => {
      try {
        // Solana Pay transfer request URI.
        const paymentUrl = `solana:${receiverAddress}?amount=${amount}&label=Astrax`
        const qrUrl = await QRCode.toDataURL(paymentUrl, {
          width: 200,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
        })
        setQrCodeUrl(qrUrl)
      } catch (error) {
        console.error("Error generating QR code:", error)
      }
    }
    if (isValidLink) generateQR()
  }, [receiverAddress, amount, isValidLink])

  const sendPayment = async () => {
    if (!connected || !publicKey) {
      alert("Please connect your wallet first")
      return
    }
    setPaymentStatus("processing")
    try {
      const tx = await buildSolTransfer(connection, publicKey, new PublicKey(receiverAddress), amount)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
      tx.recentBlockhash = blockhash
      const sig = await sendTransaction(tx, connection)
      setSignature(sig)
      const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
      if (res.value.err) throw new Error("Transaction failed on-chain")
      setPaymentStatus("completed")
    } catch (error: any) {
      console.error("Payment error:", error)
      alert(`Payment failed: ${error.message || "Unknown error"}`)
      setPaymentStatus("failed")
    }
  }

  const getStatusColor = () => {
    switch (paymentStatus) {
      case "processing":
      case "completed":
        return "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-md px-3 py-1"
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md px-3 py-1"
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert("Copied to clipboard!")
  }

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
          <p className="text-gray-600 dark:text-gray-400">Solana Payment Request</p>
        </div>

        <Card className="bg-white dark:bg-black border-gray-300 dark:border-gray-800 p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="text-gray-600 dark:text-gray-400">Receiver Address:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono break-all max-w-xs text-black dark:text-white">{receiverAddress}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(receiverAddress)} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
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

            {signature && (
              <div className="flex justify-between items-start">
                <span className="text-gray-600 dark:text-gray-400">Signature:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono break-all max-w-xs text-black dark:text-white">{signature.slice(0, 8)}…{signature.slice(-8)}</span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(signature)} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => window.open(explorerTx(signature), '_blank')} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {qrCodeUrl && (
          <Card className="bg-white dark:bg-black border-gray-300 dark:border-gray-800 p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4 text-black dark:text-white">Scan to Pay</h3>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="Payment QR Code" className="rounded-lg" />
              </div>
            </div>
          </Card>
        )}

        {/* Connect Wallet Section */}
        {!connected ? (
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
            <p>This payment is sent directly on Solana</p>
            <p>Network: Solana {CLUSTER_LABEL}</p>
            <p>All transactions are recorded on-chain for transparency</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
