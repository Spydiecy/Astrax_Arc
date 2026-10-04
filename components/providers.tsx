"use client"

import { useMemo } from "react"
import { CredentialsProvider } from "@/contexts/CredentialsContext"
import { ThemeProvider } from "@/components/ui/theme-provider"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets"
import { RPC_URL } from "@/lib/solana"
import "@solana/wallet-adapter-react-ui/styles.css"

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => RPC_URL, [])
  // Phantom & Solflare are added explicitly; other installed wallets are picked up
  // automatically through the Wallet Standard.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <CredentialsProvider>{children}</CredentialsProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  )
}
