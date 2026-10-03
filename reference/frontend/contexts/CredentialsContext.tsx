"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ACCESS_CONTROL_CONFIG, ACCESS_CONTROL_ABI } from '@/lib/accessControl'

interface CredentialsContextType {
  publicKey: string
  privateKey: string
  setPublicKey: (key: string) => void
  setPrivateKey: (key: string) => void
  hasCredentials: boolean
  isConfirmed: boolean
  confirmCredentials: () => void
  hasAccess: boolean
  isCheckingAccess: boolean
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined)

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKeyState] = useState<string>("")
  const [privateKey, setPrivateKeyState] = useState<string>("")
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false)
  
  const { address, isConnected } = useAccount()

  // Check access control subscription
  const { 
    data: contractHasAccess, 
    isLoading: isCheckingAccess, 
    refetch: refetchAccess,
    error: accessError
  } = useReadContract({
    address: ACCESS_CONTROL_CONFIG.contractAddress as `0x${string}`,
    abi: ACCESS_CONTROL_ABI,
    functionName: 'hasPaid',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 15000, // Refetch every 15 seconds for more responsiveness
      retry: 3, // Retry failed requests
      retryDelay: 1000, // Wait 1 second between retries
    }
  })

  // Handle access determination with error handling
  const hasAccess = contractHasAccess === true // Explicit true check

  // Load credentials from localStorage on mount
  useEffect(() => {
    const storedPublicKey = localStorage.getItem("wallet_public_key")
    const storedPrivateKey = localStorage.getItem("wallet_private_key")
    const storedConfirmed = localStorage.getItem("wallet_credentials_confirmed")
    
    if (storedPublicKey) setPublicKeyState(storedPublicKey)
    if (storedPrivateKey) setPrivateKeyState(storedPrivateKey)
    if (storedConfirmed === "true") setIsConfirmed(true)
  }, [])

  // Refetch access when wallet connects/disconnects
  useEffect(() => {
    if (address) {
      refetchAccess()
    }
  }, [address, refetchAccess])

  // Save to localStorage whenever keys change
  const setPublicKey = (key: string) => {
    setPublicKeyState(key)
    localStorage.setItem("wallet_public_key", key)
    // Reset confirmation when credentials change
    setIsConfirmed(false)
    localStorage.removeItem("wallet_credentials_confirmed")
  }

  const setPrivateKey = (key: string) => {
    setPrivateKeyState(key)
    localStorage.setItem("wallet_private_key", key)
    // Reset confirmation when credentials change
    setIsConfirmed(false)
    localStorage.removeItem("wallet_credentials_confirmed")
  }

  const confirmCredentials = () => {
    if (publicKey && privateKey) {
      setIsConfirmed(true)
      localStorage.setItem("wallet_credentials_confirmed", "true")
    }
  }

  const hasCredentials = Boolean(publicKey && privateKey)

  return (
    <CredentialsContext.Provider
      value={{
        publicKey,
        privateKey,
        setPublicKey,
        setPrivateKey,
        hasCredentials,
        isConfirmed,
        confirmCredentials,
        hasAccess,
        isCheckingAccess
      }}
    >
      {children}
    </CredentialsContext.Provider>
  )
}

export function useCredentials() {
  const context = useContext(CredentialsContext)
  if (context === undefined) {
    throw new Error('useCredentials must be used within a CredentialsProvider')
  }
  return context
}
