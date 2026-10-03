"use client"

import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Copy, ExternalLink } from "lucide-react"
import QRCode from "qrcode"
import { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { parseEther } from 'viem'

const CONTRACT_ADDRESS = "0xB7a8307A474A2227050c34212Ef84783ece5876f"
const CONTRACT_ABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "sender",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "receiver",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			}
		],
		"name": "PaymentSent",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_receiver",
				"type": "address"
			}
		],
		"name": "send_payment",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "sender_address",
				"type": "address"
			}
		],
		"name": "get_payments",
		"outputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "sender",
						"type": "address"
					},
					{
						"internalType": "address",
						"name": "receiver",
						"type": "address"
					},
					{
						"internalType": "uint256",
						"name": "amount",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct PaymentTracker.Payment[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]

const NETWORK = {
  chainId: 14601,
  chainName: "Sonic Testnet",
  rpcUrls: ["https://rpc.testnet.soniclabs.com"],
  blockExplorerUrls: ["https://explorer.testnet.soniclabs.com"],
}

export default function PaymentPortalPage() {
  const params = useParams()
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "processing" | "completed" | "failed">("pending")

  const receiverAddress = params.address as string
  const amount = params.amount as string

  // Wagmi hooks
  const { address, isConnected } = useAccount()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // Update payment status based on transaction state
  useEffect(() => {
    if (isPending || isConfirming) {
      setPaymentStatus("processing")
    } else if (isConfirmed) {
      setPaymentStatus("completed")
    } else if (hash && !isConfirming && !isConfirmed) {
      setPaymentStatus("failed")
    }
  }, [isPending, isConfirming, isConfirmed, hash])

  useEffect(() => {
    const generateQR = async () => {
      try {
        const paymentUrl = `ethereum:${receiverAddress}@${NETWORK.chainId}?value=${Number.parseFloat(amount) * 1e18}`
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
    if (receiverAddress && amount) generateQR()
  }, [receiverAddress, amount])

  const sendPaymentViaContract = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first")
      return
    }

    try {
      const amountInWei = parseEther(amount)
      
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'send_payment',
        args: [receiverAddress as `0x${string}`],
        value: amountInWei,
      })
    } catch (error: any) {
      console.error("Payment error:", error)
      alert(`Payment failed: ${error.message || "Unknown error"}`)
      setPaymentStatus("failed")
    }
  }

  const getStatusColor = () => {
    switch (paymentStatus) {
      case "pending": return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md px-3 py-1"
      case "processing": return "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-md px-3 py-1"
      case "completed": return "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-md px-3 py-1"
      case "failed": return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md px-3 py-1"
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md px-3 py-1"
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert("Copied to clipboard!")
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white p-4 transition-colors duration-300">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">Payment Portal</h1>
          <p className="text-gray-600 dark:text-gray-400">Smart Contract Payment System</p>
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
              <span className="font-semibold text-black dark:text-white">{amount} S</span>
            </div>

            <div className="flex justify-between items-start">
              <span className="text-gray-600 dark:text-gray-400">Contract Address:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono break-all max-w-xs text-black dark:text-white">{CONTRACT_ADDRESS}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(CONTRACT_ADDRESS)} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Status:</span>
              <span className={getStatusColor()}>{paymentStatus}</span>
            </div>

            {hash && (
              <div className="flex justify-between items-start">
                <span className="text-gray-600 dark:text-gray-400">Transaction Hash:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono break-all max-w-xs text-black dark:text-white">{hash}</span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(hash)} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => window.open(`${NETWORK.blockExplorerUrls[0]}/tx/${hash}`, '_blank')} className="p-1 h-6 w-6 hover:bg-gray-100 dark:hover:bg-gray-800">
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
                <img src={qrCodeUrl} alt="Payment QR Code" className="rounded-lg" />
              </div>
            </div>
          </Card>
        )}

        {/* Connect Wallet Section */}
        {!isConnected ? (
          <Card className="bg-white dark:bg-black border-gray-300 dark:border-gray-800 p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4 text-black dark:text-white">Connect Wallet to Pay</h3>
              <ConnectButton />
            </div>
          </Card>
        ) : (
          <Button
            onClick={sendPaymentViaContract}
            disabled={isPending || isConfirming || paymentStatus === "completed"}
            className="w-full bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-200 font-semibold py-4 text-lg border-0"
          >
            {isPending ? "Confirming Transaction..." : isConfirming ? "Processing Payment..." : paymentStatus === "completed" ? "Payment Completed" : "Pay via Smart Contract"}
          </Button>
        )}

        <Card className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-800 p-4">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>This payment will be processed through our smart contract</p>
            <p>Network: {NETWORK.chainName}</p>
            <p>All transactions are recorded on the blockchain for transparency</p>
          </div>
        </Card>
      </div>
    </div>
  )
}