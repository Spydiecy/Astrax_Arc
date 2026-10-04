"use client"

// Proves to the server that this browser controls the active address, so it
// can see and manage its own payment links and scheduled payments.
//   • Autonomous mode: signed silently with the loaded secret key.
//   • Wallet mode: the wallet signs a free sign-in message (no transaction).
// The server keeps the result in an HttpOnly cookie (see lib/auth.ts).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { ed25519 } from "@noble/curves/ed25519.js"
import bs58 from "bs58"
import { useCredentials } from "@/contexts/CredentialsContext"

interface OwnerSessionValue {
  /** True when the active address (wallet or autonomous key) is verified. */
  isVerified: boolean
  verifiedAddresses: string[]
  verifying: boolean
  error: string
  /** Verify the active address. Resolves true on success. */
  verify: () => Promise<boolean>
  signOut: (address: string) => Promise<void>
  /** Wallet can't sign messages (some hardware / older wallets). */
  canVerify: boolean
}

const Ctx = createContext<OwnerSessionValue | undefined>(undefined)

function secretSeed(key: string): Uint8Array | null {
  const k = key.trim()
  if (!k) return null
  try {
    const bytes = k.startsWith("[") ? Uint8Array.from(JSON.parse(k)) : bs58.decode(k)
    return bytes.length === 64 ? bytes.slice(0, 32) : null
  } catch {
    return null
  }
}

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

export function OwnerSessionProvider({ children }: { children: ReactNode }) {
  const { activeAddress, signingMode, privateKey, derivedAddress } = useCredentials()
  const { signMessage, publicKey } = useWallet()
  const [verifiedAddresses, setVerified] = useState<string[]>([])
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState("")
  const autoTried = useRef(new Set<string>())

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setVerified(j.addresses || []))
      .catch(() => {})
  }, [])

  const isAuto = signingMode === "auto"
  const canVerify = isAuto ? Boolean(derivedAddress) : Boolean(signMessage && publicKey)

  const verify = useCallback(async () => {
    const address = activeAddress
    if (!address) return false
    setVerifying(true)
    setError("")
    try {
      const c = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const challenge = await c.json()
      if (!c.ok) throw new Error(challenge.error || "Couldn't start verification.")
      const msg = new TextEncoder().encode(challenge.message)

      let signature: Uint8Array
      if (isAuto) {
        const seed = secretSeed(privateKey)
        if (!seed || derivedAddress !== address) throw new Error("No valid secret key loaded.")
        signature = ed25519.sign(msg, seed)
      } else {
        if (!signMessage || publicKey?.toBase58() !== address) throw new Error("This wallet can't sign messages.")
        signature = await signMessage(msg)
      }

      const v = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, message: challenge.message, token: challenge.token, signature: toBase64(signature) }),
      })
      const j = await v.json()
      if (!v.ok) throw new Error(j.error || "Verification failed.")
      setVerified(j.addresses || [])
      return true
    } catch (e: any) {
      const m = String(e?.message || "Verification failed.")
      setError(/reject|denied|cancel/i.test(m) ? "Signature request was declined." : m.slice(0, 140))
      return false
    } finally {
      setVerifying(false)
    }
  }, [activeAddress, isAuto, privateKey, derivedAddress, signMessage, publicKey])

  const signOut = useCallback(async (address: string) => {
    try {
      const r = await fetch(`/api/auth/session?address=${encodeURIComponent(address)}`, { method: "DELETE" })
      const j = await r.json()
      setVerified(j.addresses || [])
    } catch {
      /* ignore */
    }
  }, [])

  const isVerified = Boolean(activeAddress && verifiedAddresses.includes(activeAddress))

  // Autonomous keys need no popup, so verify them automatically (once per key).
  useEffect(() => {
    if (!isAuto || !derivedAddress || isVerified || verifying) return
    if (autoTried.current.has(derivedAddress)) return
    autoTried.current.add(derivedAddress)
    verify()
  }, [isAuto, derivedAddress, isVerified, verifying, verify])

  return (
    <Ctx.Provider value={{ isVerified, verifiedAddresses, verifying, error, verify, signOut, canVerify }}>
      {children}
    </Ctx.Provider>
  )
}

export function useOwnerSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useOwnerSession must be used within OwnerSessionProvider")
  return v
}
