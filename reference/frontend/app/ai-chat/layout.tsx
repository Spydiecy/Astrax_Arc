"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { Button } from "@/components/ui/button"
import { SessionModal } from "@/components/session-modal"
import { CustomConnectButton } from "@/components/ui/connect-wallet-button"
import { ThemeToggle } from "@/components/ui/theme-provider"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AiChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>("")
  const [appName, setAppName] = useState<string>("")

  useEffect(() => {
    setMounted(true)
    
    // Load session data from localStorage
    const storedSessionId = localStorage.getItem("sessionId")
    const storedUserId = localStorage.getItem("userId")
    const storedAppName = localStorage.getItem("appName")
    
    if (storedSessionId) setSessionId(storedSessionId)
    if (storedUserId) setUserId(storedUserId)
    if (storedAppName) setAppName(storedAppName)
  }, [])

  const handleNewSession = () => {
    setShowSessionModal(true)
  }

  const handleSessionCreated = (newSessionId: string, newUserId: string) => {
    setSessionId(newSessionId)
    setUserId(newUserId)
    setAppName(localStorage.getItem("appName") || "astra-assistant")
    
    // Trigger a custom event to notify the AI chat page to reset
    window.dispatchEvent(new CustomEvent('newSessionCreated', {
      detail: { sessionId: newSessionId, userId: newUserId }
    }))
    
    // Reload the page to reset the chat
    window.location.reload()
  }

  if (!mounted) return null

  return (
    <div className="h-screen bg-white dark:bg-black text-black dark:text-white flex overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col transition-all duration-300",
        sidebarOpen ? "ml-64" : "ml-20"
      )}>
        {/* Top Header */}
        <header className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 bg-white/90 dark:bg-black/90 backdrop-blur-sm transition-colors duration-300">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">ASTRA</h1>
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 transition-colors duration-300">
              Testnet
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <ThemeToggle />
            <Button
              onClick={handleNewSession}
              variant="outline"
              size="sm"
              className="border-gray-300 dark:border-gray-700 bg-transparent text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors duration-300"
            >
              <Plus className="w-4 h-4" />
              New Session
            </Button>
            <CustomConnectButton />
          </div>
        </header>

        {/* Chat Content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
      
      {/* Session Modal */}
      <SessionModal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        onSessionCreated={handleSessionCreated}
        currentSessionId={sessionId}
        currentUserId={userId}
        currentAppName={appName}
      />
    </div>
  )
}
