// Browser wallet configuration (wagmi + RainbowKit). Both Arc networks are
// registered; every read/write passes the active network's chainId explicitly
// (see contexts/NetworkContext.tsx), so chain order only sets the default.
import { createConfig } from "wagmi"
import { connectorsForWallets } from "@rainbow-me/rainbowkit"
import {
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet as coinbaseWalletRK,
  walletConnectWallet,
  trustWallet,
  rabbyWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets"
import { ARC_NETWORKS, arcMainnet, arcTestnet, arcTransport, DEFAULT_NETWORK_KEY } from "./arc"

const APP_NAME = "Astrax"

// WalletConnect (mobile wallets via QR) needs a free project id from
// https://cloud.reown.com. Without one, the modal still lists the browser wallets
// (with an install link for any that aren't installed), just not the QR-based ones.
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || ""

const connectors = connectorsForWallets(
  WC_PROJECT_ID
    ? [
        { groupName: "Popular", wallets: [metaMaskWallet, rabbyWallet, coinbaseWalletRK, rainbowWallet, trustWallet, walletConnectWallet] },
        { groupName: "More", wallets: [injectedWallet] },
      ]
    : [{ groupName: "Popular", wallets: [metaMaskWallet, rabbyWallet, coinbaseWalletRK, injectedWallet] }],
  { appName: APP_NAME, projectId: WC_PROJECT_ID || "walletconnect-not-configured" },
)

const defaultFirst = DEFAULT_NETWORK_KEY === "mainnet" ? ([arcMainnet, arcTestnet] as const) : ([arcTestnet, arcMainnet] as const)

export const wagmiConfig = createConfig({
  chains: defaultFirst,
  connectors,
  transports: {
    [arcMainnet.id]: arcTransport(ARC_NETWORKS.mainnet),
    [arcTestnet.id]: arcTransport(ARC_NETWORKS.testnet),
  },
  ssr: true,
})

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig
  }
}
