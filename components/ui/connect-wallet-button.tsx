"use client"

import dynamic from "next/dynamic"

// Load the wallet button client-side only (it reads window/wallet state).
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
)

export function CustomConnectButton() {
  return <WalletMultiButton className="!bg-gray-900 dark:!bg-white !text-white dark:!text-black !rounded-md !h-10 !text-sm !font-medium hover:!bg-gray-800 dark:hover:!bg-gray-200" />
}
