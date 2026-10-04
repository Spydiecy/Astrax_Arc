"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"

export type SigningMode = "auto" | "wallet"

interface CredentialsContextType {
  /** Raw secret key the user optionally pastes (autonomous mode). */
  privateKey: string
  setPrivateKey: (key: string) => void
  /** Address derived from the secret key (null if key is empty/invalid). */
  derivedAddress: string | null
  hasPrivateKey: boolean
  /** How transactions are signed: server-side with the key, or in the user's wallet. */
  signingMode: SigningMode
  setSigningMode: (m: SigningMode) => void
  /** The address the agent should treat as "the user" for the active mode. */
  activeAddress: string | null
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined)

/** Derive a Solana public key from a base58 secret key or a JSON byte array. */
function deriveAddress(key: string): string | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  try {
    const secret = trimmed.startsWith("[") ? Uint8Array.from(JSON.parse(trimmed)) : bs58.decode(trimmed)
    return Keypair.fromSecretKey(secret).publicKey.toBase58()
  } catch {
    return null
  }
}

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [privateKey, setPrivateKeyState] = useState("")
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null)
  const [signingMode, setSigningModeState] = useState<SigningMode>("wallet")

  const { publicKey, connected } = useWallet()
  const address = publicKey?.toBase58() ?? null

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
    signingMode === "auto" ? derivedAddress : connected ? address : null

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
