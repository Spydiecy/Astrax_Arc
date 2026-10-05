"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useAccount } from "wagmi"
import { addressFromSecret } from "@/lib/evm"

export type SigningMode = "auto" | "wallet"

interface CredentialsContextType {
  /** Raw private key the user optionally pastes (autonomous mode). */
  privateKey: string
  setPrivateKey: (key: string) => void
  /** Address derived from the private key (null if key is empty/invalid). */
  derivedAddress: `0x${string}` | null
  hasPrivateKey: boolean
  /** How transactions are signed: server-side with the key, or in the user's wallet. */
  signingMode: SigningMode
  setSigningMode: (m: SigningMode) => void
  /** The address the agent should treat as "the user" for the active mode. */
  activeAddress: `0x${string}` | null
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined)

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [privateKey, setPrivateKeyState] = useState("")
  const [derivedAddress, setDerivedAddress] = useState<`0x${string}` | null>(null)
  const [signingMode, setSigningModeState] = useState<SigningMode>("wallet")
  const { address, isConnected } = useAccount()

  // Load persisted state on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("wallet_private_key") || ""
    const storedMode = (localStorage.getItem("astrax_signing_mode") as SigningMode) || null
    if (storedKey) {
      setPrivateKeyState(storedKey)
      setDerivedAddress(addressFromSecret(storedKey))
    }
    if (storedMode === "auto" || storedMode === "wallet") setSigningModeState(storedMode)
    else setSigningModeState(storedKey ? "auto" : "wallet")
  }, [])

  const setPrivateKey = (key: string) => {
    setPrivateKeyState(key)
    setDerivedAddress(addressFromSecret(key))
    localStorage.setItem("wallet_private_key", key)
  }

  const setSigningMode = (m: SigningMode) => {
    setSigningModeState(m)
    localStorage.setItem("astrax_signing_mode", m)
  }

  const hasPrivateKey = Boolean(derivedAddress)
  const activeAddress = signingMode === "auto" ? derivedAddress : isConnected && address ? address : null

  return (
    <CredentialsContext.Provider
      value={{
        privateKey,
        setPrivateKey,
        derivedAddress,
        hasPrivateKey,
        signingMode,
        setSigningMode,
        activeAddress,
      }}
    >
      {children}
    </CredentialsContext.Provider>
  )
}

export function useCredentials() {
  const context = useContext(CredentialsContext)
  if (context === undefined) {
    throw new Error("useCredentials must be used within a CredentialsProvider")
  }
  return context
}
