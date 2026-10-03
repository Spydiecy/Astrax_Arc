"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useAccount } from "wagmi"
import { privateKeyToAccount } from "viem/accounts"

export type SigningMode = "auto" | "wallet"

interface CredentialsContextType {
  /** Raw private key the user optionally pastes (autonomous mode). */
  privateKey: string
  setPrivateKey: (key: string) => void
  /** Address derived from the private key (null if key is empty/invalid). */
  derivedAddress: string | null
  hasPrivateKey: boolean
  /** How transactions are signed: server-side with the key, or in the user's wallet. */
  signingMode: SigningMode
  setSigningMode: (m: SigningMode) => void
  /** The address the agent should treat as "the user" for the active mode. */
  activeAddress: string | null
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined)

function deriveAddress(key: string): string | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  try {
    const pk = (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`
    if (pk.length !== 66) return null
    return privateKeyToAccount(pk).address
  } catch {
    return null
  }
}

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [privateKey, setPrivateKeyState] = useState("")
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null)
  const [signingMode, setSigningModeState] = useState<SigningMode>("wallet")

  const { address, isConnected } = useAccount()

  // Load persisted state on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("wallet_private_key") || ""
    const storedMode = (localStorage.getItem("astrax_signing_mode") as SigningMode) || null
    if (storedKey) {
      setPrivateKeyState(storedKey)
      setDerivedAddress(deriveAddress(storedKey))
    }
    if (storedMode === "auto" || storedMode === "wallet") setSigningModeState(storedMode)
    else setSigningModeState(storedKey ? "auto" : "wallet")
  }, [])

  const setPrivateKey = (key: string) => {
    setPrivateKeyState(key)
    setDerivedAddress(deriveAddress(key))
    localStorage.setItem("wallet_private_key", key)
  }

  const setSigningMode = (m: SigningMode) => {
    setSigningModeState(m)
    localStorage.setItem("astrax_signing_mode", m)
  }

  const hasPrivateKey = Boolean(derivedAddress)
  const activeAddress =
    signingMode === "auto" ? derivedAddress : isConnected ? address ?? null : null

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
