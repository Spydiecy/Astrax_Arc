"use client"

import { CredentialsProvider } from "@/contexts/CredentialsContext"
import { OwnerSessionProvider } from "@/contexts/OwnerSessionContext"
import { ThemeProvider } from "@/components/ui/theme-provider"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { RPC_URL } from "@/lib/solana"
import "@solana/wallet-adapter-react-ui/styles.css"

// Wallets implementing the Wallet Standard (Phantom, Solflare, Backpack, …) are
// detected automatically, so no per-wallet adapters are needed.
const WALLETS: never[] = []

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConnectionProvider endpoint={RPC_URL}>
        <WalletProvider wallets={WALLETS} autoConnect>
          <WalletModalProvider>
            <CredentialsProvider>
              <OwnerSessionProvider>{children}</OwnerSessionProvider>
            </CredentialsProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  )
}
