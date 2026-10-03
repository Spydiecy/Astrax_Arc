"use client"

import { CredentialsProvider } from "@/contexts/CredentialsContext"
import { ThemeProvider } from "@/components/ui/theme-provider"
import { RainbowKitProvider, getDefaultWallets, connectorsForWallets } from '@rainbow-me/rainbowkit'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { 
  metaMaskWallet,
  injectedWallet,
  coinbaseWallet,
  walletConnectWallet,
  trustWallet,
  ledgerWallet,
  braveWallet,
  phantomWallet
} from '@rainbow-me/rainbowkit/wallets'
import '@rainbow-me/rainbowkit/styles.css'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'astrax-default-project-id'

// Sonic Testnet configuration
const sonicTestnet = {
  id: 14601,
  name: 'Sonic Testnet',
  network: 'sonic-testnet',
  nativeCurrency: {
    name: 'Sonic',
    symbol: 'S',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.soniclabs.com'] },
    public: { http: ['https://rpc.testnet.soniclabs.com'] },
  },
  blockExplorers: {
    default: { name: 'Sonic Explorer', url: 'https://explorer.testnet.soniclabs.com' },
  },
  testnet: true,
}

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        walletConnectWallet,
        injectedWallet,
      ],
    },
    {
      groupName: 'Other',
      wallets: [
        trustWallet,
        ledgerWallet,
        braveWallet,
        phantomWallet,
      ],
    },
  ],
  {
    appName: 'Astrax AI Assistant',
    projectId,
  }
)

const config = createConfig({
  chains: [sonicTestnet],
  connectors,
  transports: {
  [sonicTestnet.id]: http(),
  },
}) as any // Type assertion to resolve compatibility issue

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            modalSize="compact"
            theme={{
              blurs: {
                modalOverlay: 'blur(4px)',
              },
              colors: {
                accentColor: '#ffffff',
                accentColorForeground: '#000000',
                actionButtonBorder: '#4b5563',
                actionButtonBorderMobile: '#4b5563',
                actionButtonSecondaryBackground: '#374151',
                closeButton: '#9ca3af',
                closeButtonBackground: '#374151',
                connectButtonBackground: '#000000',
                connectButtonBackgroundError: '#ef4444',
                connectButtonInnerBackground: '#1f2937',
                connectButtonText: '#ffffff',
                connectButtonTextError: '#ffffff',
                connectionIndicator: '#10b981',
                downloadBottomCardBackground: '#111827',
                downloadTopCardBackground: '#000000',
                error: '#ef4444',
                generalBorder: '#4b5563',
                generalBorderDim: '#374151',
                menuItemBackground: '#111827',
                modalBackdrop: 'rgba(0, 0, 0, 0.8)',
                modalBackground: '#000000',
                modalBorder: '#4b5563',
                modalText: '#ffffff',
                modalTextDim: '#9ca3af',
                modalTextSecondary: '#d1d5db',
                profileAction: '#374151',
                profileActionHover: '#4b5563',
                profileForeground: '#111827',
                selectedOptionBorder: '#ffffff',
                standby: '#fbbf24',
              },
              fonts: {
                body: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              },
              radii: {
                actionButton: '8px',
                connectButton: '8px',
                menuButton: '8px',
                modal: '12px',
                modalMobile: '12px',
              },
              shadows: {
                connectButton: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                dialog: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                profileDetailsAction: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                selectedOption: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                selectedWallet: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                walletLogo: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              },
            }}
            showRecentTransactions={true}
            coolMode
          >
            <CredentialsProvider>
              {children}
            </CredentialsProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
