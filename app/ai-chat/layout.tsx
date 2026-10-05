"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { CustomConnectButton } from "@/components/ui/connect-wallet-button"
import { ThemeToggle } from "@/components/ui/theme-provider"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AiChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="h-screen bg-white dark:bg-black text-black dark:text-white flex overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      {/* Main Content */}
      <div className={cn("flex-1 flex flex-col transition-all duration-300", sidebarOpen ? "ml-64" : "ml-20")}>
        {/* Top Header */}
        <header className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white/90 dark:bg-black/90 backdrop-blur-sm transition-colors duration-300">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("openOnboarding"))}
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              How it works
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <ThemeToggle />
            <CustomConnectButton />
          </div>
        </header>

        {/* Chat Content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
