"use client"

import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Wallet, Shield, CheckCircle, Clock, CreditCard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  ACCESS_CONTROL_CONFIG,
  ACCESS_CONTROL_ABI,
  type SubscriptionStatus 
} from '@/lib/accessControl'

interface AccessControlModalProps {
  isOpen: boolean
  onAccessGranted: () => void
}

export function AccessControlModal({ isOpen, onAccessGranted }: AccessControlModalProps) {
  const { theme } = useTheme()
  const { address, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [isSubscribing, setIsSubscribing] = useState(false)

  const isDark = theme === 'dark'

  // Contract read hook
  const { 
    data: hasAccess, 
    refetch: refetchAccess, 
    isLoading: isLoadingAccess,
    error: contractError 
  } = useReadContract({
    address: ACCESS_CONTROL_CONFIG.contractAddress as `0x${string}`,
    abi: ACCESS_CONTROL_ABI,
    functionName: 'hasPaid',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      retry: 3,
      retryDelay: 1000,
    }
  })

  // Contract write hook
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract()

  // Transaction receipt hook
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Update subscription status when contract data changes
  useEffect(() => {
    if (address && hasAccess !== undefined) {
      const status: SubscriptionStatus = {
        hasAccess: Boolean(hasAccess),
        isLoading: isLoadingAccess
      }
      
      setSubscriptionStatus(status)
      
      // Grant access if user has valid subscription
      if (status.hasAccess) {
        // Small delay to ensure UI updates properly
        setTimeout(() => {
          onAccessGranted()
        }, 500)
      }
    } else if (address && hasAccess === undefined && !isLoadingAccess) {
      // Handle case where contract call fails - show as no access
      setSubscriptionStatus({
        hasAccess: false,
        isLoading: false
      })
    }
  }, [hasAccess, isLoadingAccess, address, onAccessGranted])

  // Handle successful subscription
  useEffect(() => {
    if (isSuccess) {
      setIsSubscribing(false)
      // Refetch access status after successful transaction
      // Wait longer for blockchain confirmation
      setTimeout(() => {
        refetchAccess()
      }, 3000) // Wait 3 seconds for blockchain confirmation
      
      // Also refetch multiple times to catch the update
      setTimeout(() => {
        refetchAccess()
      }, 5000)
      
      setTimeout(() => {
        refetchAccess()
      }, 10000)
    }
  }, [isSuccess, refetchAccess])

  const handleSubscribe = async () => {
    if (!address) return
    
    setIsSubscribing(true)
    try {
      await writeContract({
        address: ACCESS_CONTROL_CONFIG.contractAddress as `0x${string}`,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'pay',
        value: BigInt(ACCESS_CONTROL_CONFIG.subscriptionFee),
        gas: ACCESS_CONTROL_CONFIG.gasLimit,
      })
    } catch (error) {
      console.error('Subscription failed:', error)
      setIsSubscribing(false)
    }
  }

  // Ensure component is mounted before rendering to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render until mounted to prevent hydration issues
  if (!mounted) {
    return null
  }

  const isProcessing = isSubscribing || isWritePending || isConfirming

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className={cn(
        "max-w-md mx-auto border transition-colors duration-300",
        isDark 
          ? "bg-black border-gray-800 text-white" 
          : "bg-white border-gray-300 text-black"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl font-semibold">
            <Shield className={cn("w-6 h-6", isDark ? "text-gray-400" : "text-gray-600")} />
            <span>Platform Access</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 pt-4">
          {/* Access Info */}
          <div className={cn(
            "rounded-lg p-4 border",
            isDark 
              ? "bg-gray-900/50 border-gray-700" 
              : "bg-gray-100/50 border-gray-300"
          )}>
            <h3 className="text-lg font-medium mb-2">Subscription Required</h3>
            <p className={cn("text-sm mb-4", isDark ? "text-gray-400" : "text-gray-600")}>
                            Subscribe to access Astrax AI Assistant on Sonic Testnet.
            </p>
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className={cn(isDark ? "text-gray-300" : "text-gray-700")}>0.1 S subscription</span>
            </div>
            <div className="flex items-center space-x-2 text-sm mt-1">
              <div className={cn("w-2 h-2 rounded-full", isDark ? "bg-gray-400" : "bg-gray-600")}></div>
              <span className={cn(isDark ? "text-gray-300" : "text-gray-700")}>Sonic Testnet</span>
            </div>
          </div>

          {/* Wallet Connection */}
          {!isConnected ? (
            <div className="space-y-4">
              <div className={cn("flex items-center space-x-2", isDark ? "text-gray-300" : "text-gray-700")}>
                <Wallet className="w-5 h-5" />
                <span>Connect your wallet to continue</span>
              </div>
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Connected Wallet */}
              <div className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                isDark 
                  ? "bg-gray-900/50 border-gray-700" 
                  : "bg-gray-100/50 border-gray-300"
              )}>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm">Wallet Connected</span>
                </div>
                <span className={cn("text-xs font-mono", isDark ? "text-gray-400" : "text-gray-600")}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </div>

              {/* Subscription Status */}
              {isConnected && isLoadingAccess && (
                <div className={cn(
                  "flex items-center justify-center p-4 rounded-lg border",
                  isDark 
                    ? "bg-gray-900/50 border-gray-700" 
                    : "bg-gray-100/50 border-gray-300"
                )}>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Checking subscription status...</span>
                </div>
              )}

              {/* Contract Error Display */}
              {contractError && (
                <div className={cn(
                  "p-4 rounded-lg border",
                  isDark 
                    ? "bg-red-900/20 border-red-700 text-red-300" 
                    : "bg-red-100/50 border-red-300 text-red-700"
                )}>
                  <div className="text-sm">
                    <p className="font-medium mb-1">Unable to check subscription status</p>
                    <p className="text-xs opacity-75">Please ensure you're connected to Sonic Testnet and try refreshing.</p>
                  </div>
                </div>
              )}
              
              {/* Show subscription status or subscribe button when not loading */}
              {isConnected && !isLoadingAccess && !contractError && (
                <div className={cn(
                  "p-4 rounded-lg border",
                  isDark 
                    ? "bg-gray-900/50 border-gray-700" 
                    : "bg-gray-100/50 border-gray-300"
                )}>
                  {subscriptionStatus?.hasAccess ? (
                    // Active Subscription
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="font-medium text-green-400">Active Subscription</span>
                      </div>
                      <p className={cn("text-sm", isDark ? "text-gray-400" : "text-gray-600")}>
                        You have access to Astrax AI Assistant
                      </p>
                    </div>
                  ) : (
                    // No Active Subscription - Always show subscribe option
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-5 h-5 text-orange-400" />
                        <span className="font-medium">No Active Subscription</span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className={cn(isDark ? "text-gray-400" : "text-gray-600")}>Monthly Fee:</span>
                          <span className="font-mono">0.1 S</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className={cn(isDark ? "text-gray-400" : "text-gray-600")}>Duration:</span>
                          <span>30 days</span>
                        </div>
                      </div>

                      <Button
                        onClick={handleSubscribe}
                        disabled={isProcessing}
                        className={cn(
                          "w-full flex items-center justify-center space-x-2",
                          "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                        )}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>
                              {isWritePending || isSubscribing ? 'Subscribing...' : 
                               isConfirming ? 'Confirming...' : 'Processing...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            <span>Subscribe for 0.1 S</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Fallback subscribe button when there's a contract error */}
              {contractError && (
                <div className={cn(
                  "p-4 rounded-lg border",
                  isDark 
                    ? "bg-gray-900/50 border-gray-700" 
                    : "bg-gray-100/50 border-gray-300"
                )}>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-orange-400" />
                      <span className="font-medium">Subscribe to Continue</span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className={cn(isDark ? "text-gray-400" : "text-gray-600")}>Monthly Fee:</span>
                        <span className="font-mono">0.1 S</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={cn(isDark ? "text-gray-400" : "text-gray-600")}>Duration:</span>
                        <span>30 days</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleSubscribe}
                      disabled={isProcessing}
                      className={cn(
                        "w-full flex items-center justify-center space-x-2",
                        "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                      )}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {isWritePending || isSubscribing ? 'Subscribing...' : 
                             isConfirming ? 'Confirming...' : 'Processing...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          <span>Subscribe for 0.1 S</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Transaction Status */}
              {txHash && (
                <div className={cn(
                  "p-3 rounded-lg border text-sm",
                  isDark 
                    ? "bg-blue-900/20 border-blue-700 text-blue-300" 
                    : "bg-blue-100/50 border-blue-300 text-blue-700"
                )}>
                  <div className="flex items-center space-x-2">
                    {isConfirming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isSuccess ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                    <span>
                      {isConfirming ? 'Confirming transaction...' : 
                       isSuccess ? 'Subscription activated!' : 'Transaction submitted'}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs opacity-75">
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Network Info */}
          <div className={cn(
            "text-xs text-center p-3 rounded border",
            isDark 
              ? "text-gray-500 bg-gray-900/30 border-gray-800" 
              : "text-gray-600 bg-gray-100/30 border-gray-300"
          )}>
            <p>Make sure you're connected to Sonic Testnet</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
