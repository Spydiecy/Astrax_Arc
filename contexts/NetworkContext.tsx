"use client"

// The Arc network the whole app is pointed at (Mainnet or Testnet). Picking a
// network re-points the agent, balances, payment links, schedules and explorer
// links at once, and asks the connected wallet to switch chains too. If the user
// switches chains from inside their wallet, Astrax follows.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import { ARC_NETWORKS, DEFAULT_NETWORK_KEY, isNetworkKey, networkByChainId, type ArcNetwork, type NetworkKey } from "@/lib/arc"

const STORAGE_KEY = "astrax_network"

interface NetworkValue {
  network: ArcNetwork
  networkKey: NetworkKey
  setNetwork: (key: NetworkKey) => void
  /** Connected wallet is on a chain other than the selected Arc network. */
  walletMismatch: boolean
  /** Ask the wallet to switch to the selected network. */
  switchWallet: () => Promise<void>
  switching: boolean
}

const Ctx = createContext<NetworkValue | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkKey, setKey] = useState<NetworkKey>(DEFAULT_NETWORK_KEY)
  const { chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending } = useSwitchChain()
  const lastWalletChain = useRef<number | undefined>(undefined)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isNetworkKey(stored)) setKey(stored)
  }, [])

  const persist = (key: NetworkKey) => {
    setKey(key)
    localStorage.setItem(STORAGE_KEY, key)
  }

  // Follow chain changes made inside the wallet (only real changes, not the
  // initial connect, so a stored choice isn't overridden on page load).
  useEffect(() => {
    if (!isConnected || chainId === undefined) {
      lastWalletChain.current = undefined
      return
    }
    const prev = lastWalletChain.current
    lastWalletChain.current = chainId
    if (prev === undefined || prev === chainId) return
    const n = networkByChainId(chainId)
    if (n) persist(n.key)
  }, [chainId, isConnected])

  const network = ARC_NETWORKS[networkKey]

  const switchWallet = useCallback(async () => {
    if (!isConnected) return
    try {
      await switchChainAsync({ chainId: network.id })
    } catch {
      /* declined in the wallet */
    }
  }, [isConnected, switchChainAsync, network.id])

  const setNetwork = useCallback(
    (key: NetworkKey) => {
      persist(key)
      if (isConnected && chainId !== ARC_NETWORKS[key].id) {
        lastWalletChain.current = ARC_NETWORKS[key].id
        switchChainAsync({ chainId: ARC_NETWORKS[key].id }).catch(() => {})
      }
    },
    [isConnected, chainId, switchChainAsync],
  )

  const walletMismatch = isConnected && chainId !== undefined && chainId !== network.id

  return (
    <Ctx.Provider value={{ network, networkKey, setNetwork, walletMismatch, switchWallet, switching: isPending }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNetwork() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useNetwork must be used within NetworkProvider")
  return v
}
