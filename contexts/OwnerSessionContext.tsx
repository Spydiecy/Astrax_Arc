"use client"

// Proves to the server that this browser controls the active address, so it
// can see and manage its own payment links, scheduled payments and contacts.
//   • Autonomous mode: signed silently with the loaded private key.
//   • Wallet mode: the wallet signs a free sign-in message (no transaction).
// Signatures are standard EIP-191 personal messages. The server keeps the result
// in an HttpOnly cookie (see lib/auth.ts).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useAccount, useSignMessage } from "wagmi"
import { accountFromSecret } from "@/lib/evm"
import { addrKey } from "@/lib/arc"
import { useCredentials } from "@/contexts/CredentialsContext"

interface OwnerSessionValue {
  /** True when the active address (wallet or autonomous key) is verified. */
  isVerified: boolean
  /** Lower-cased addresses this browser has verified. */
  verifiedAddresses: string[]
  verifying: boolean
  error: string
  /** Verify the active address. Resolves true on success. */
  verify: () => Promise<boolean>
  signOut: (address: string) => Promise<void>
  /** False when there is nothing that can sign (no wallet connected / no valid key). */
  canVerify: boolean
}

const Ctx = createContext<OwnerSessionValue | undefined>(undefined)

export function OwnerSessionProvider({ children }: { children: ReactNode }) {
  const { activeAddress, signingMode, privateKey, derivedAddress } = useCredentials()
  const { address: walletAddress, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
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
  const canVerify = isAuto ? Boolean(derivedAddress) : Boolean(isConnected && walletAddress)

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

      let signature: `0x${string}`
      if (isAuto) {
        if (!derivedAddress || derivedAddress !== address) throw new Error("No valid private key loaded.")
        // Signed locally: the key isn't sent anywhere for this step.
        signature = await accountFromSecret(privateKey).signMessage({ message: challenge.message })
      } else {
        if (!walletAddress || addrKey(walletAddress) !== addrKey(address)) throw new Error("Connect the wallet you want to verify.")
        signature = await signMessageAsync({ account: walletAddress, message: challenge.message })
      }

      const v = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, message: challenge.message, token: challenge.token, signature }),
      })
      const j = await v.json()
      if (!v.ok) throw new Error(j.error || "Verification failed.")
      setVerified(j.addresses || [])
      return true
    } catch (e: any) {
      const m = String(e?.shortMessage || e?.message || "Verification failed.")
      setError(/reject|denied|cancel/i.test(m) ? "Signature request was declined." : m.slice(0, 140))
      return false
    } finally {
      setVerifying(false)
    }
  }, [activeAddress, isAuto, privateKey, derivedAddress, signMessageAsync, walletAddress])

  const signOut = useCallback(async (address: string) => {
    try {
      const r = await fetch(`/api/auth/session?address=${encodeURIComponent(address)}`, { method: "DELETE" })
      const j = await r.json()
      setVerified(j.addresses || [])
    } catch {
      /* ignore */
    }
  }, [])

  const isVerified = Boolean(activeAddress && verifiedAddresses.includes(addrKey(activeAddress)))

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
