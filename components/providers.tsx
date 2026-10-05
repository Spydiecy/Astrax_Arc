"use client"

import { useEffect, useState } from "react"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit"
import { useTheme } from "next-themes"
import { CredentialsProvider } from "@/contexts/CredentialsContext"
import { OwnerSessionProvider } from "@/contexts/OwnerSessionContext"
import { NetworkProvider, useNetwork } from "@/contexts/NetworkContext"
import { SchedulePoller } from "@/components/schedule-poller"
import { ThemeProvider } from "@/components/ui/theme-provider"
import { wagmiConfig } from "@/lib/wagmi"
import "@rainbow-me/rainbowkit/styles.css"

const queryClient = new QueryClient({
  defaultOptions: {
    // Public RPCs can briefly rate-limit; retry with backoff instead of failing.
    queries: { retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000), staleTime: 10_000 },
  },
})

const rkTheme = { accentColorForeground: "#000", borderRadius: "large", fontStack: "system", overlayBlur: "small" } as const
const rkDark = darkTheme({ ...rkTheme, accentColor: "#ffffff" })
const rkLight = lightTheme({ ...rkTheme, accentColor: "#111111", accentColorForeground: "#fff" })

// RainbowKit's theme is applied after hydration so server and client markup match.
function WalletUi({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const { network } = useNetwork()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <RainbowKitProvider
      theme={mounted && resolvedTheme === "light" ? rkLight : rkDark}
      initialChain={network.chain}
      appInfo={{ appName: "Astrax" }}
      modalSize="compact"
    >
      {children}
    </RainbowKitProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Dark by default for everyone (no OS-based "system" theme).
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="astrax-theme" disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <NetworkProvider>
            <WalletUi>
              <CredentialsProvider>
                <OwnerSessionProvider>
                  <SchedulePoller />
                  {children}
                </OwnerSessionProvider>
              </CredentialsProvider>
            </WalletUi>
          </NetworkProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
