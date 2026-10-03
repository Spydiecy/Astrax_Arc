"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { 
  MessageSquare, 
  Plus,
  FileText,
  ArrowLeft,
  ChevronLeft,
  ChevronDown,
  Key,
  Wallet,
  Eye,
  EyeOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCredentials } from "@/contexts/CredentialsContext"

interface DashboardSidebarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export function DashboardSidebar({ open, setOpen }: DashboardSidebarProps) {
  const pathname = usePathname()
  const { theme } = useTheme()
  const { publicKey, privateKey, setPublicKey, setPrivateKey, hasCredentials, isConfirmed, confirmCredentials } = useCredentials()
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted before rendering to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  
  const routes = [
    {
      label: "AI Chat",
      icon: MessageSquare,
      href: "/ai-chat"
    }
  ]

  const handleNewChat = () => {
    // Clear chat history and redirect to standalone ai-chat
    if (typeof window !== 'undefined') {
      window.location.href = '/ai-chat'
    }
  }

  const isDark = theme === 'dark'

  return (
    <div className={cn(
      "fixed left-0 top-0 h-full border-r flex flex-col transition-all duration-300",
      isDark ? "bg-black border-gray-800 text-white" : "bg-white border-gray-300 text-black",
      open ? "w-64" : "w-20"
    )}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-4 h-16 border-b",
          isDark ? "border-gray-800" : "border-gray-300"
        )}>
          <div className={cn("flex items-center", !open && "hidden")}>
            <span className={cn("text-xl font-bold", isDark ? "text-white" : "text-black")}>Astrax</span>
            <span className={cn(
              "text-xs ml-2 px-2 py-1 rounded",
              isDark ? "bg-gray-800 text-gray-300" : "bg-gray-200 text-gray-700"
            )}>v0.1</span>
          </div>
          <button 
            onClick={() => setOpen(!open)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isDark ? "hover:bg-gray-800" : "hover:bg-gray-200"
            )}
          >
            <ChevronLeft className={cn(
              "h-6 w-6 transition-transform",
              isDark ? "text-gray-400" : "text-gray-600",
              !open && "rotate-180"
            )} />
          </button>
        </div>
        
        {/* New Chat Button */}
        <div className={cn("p-4", !open && "px-2")}>
          <button 
            onClick={handleNewChat}
            className={cn(
              "flex items-center px-3 py-3 text-sm rounded-lg transition-colors cursor-pointer group relative w-full",
              isDark 
                ? "text-gray-400 hover:bg-gray-800 hover:text-white" 
                : "text-gray-600 hover:bg-gray-200 hover:text-black",
              !open && "justify-center px-2"
            )}
          >
            <Plus className={cn("h-5 w-5", !open && "h-6 w-6")} />
            {open && <span className="ml-3">New Chat</span>}
            
            {!open && (
              <div className={cn(
                "absolute left-full ml-2 rounded-md px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border",
                isDark 
                  ? "bg-gray-800 text-white border-gray-700" 
                  : "bg-gray-200 text-black border-gray-300"
              )}>
                New Chat
              </div>
            )}
          </button>
        </div>
        
        {/* Docs Button - Moved here, right below New Chat */}
        <div className={cn("px-4 pb-4", !open && "px-2")}>
          <a 
            href="https://github.com/Spydiecy/Astrax/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center px-3 py-3 text-sm rounded-lg transition-colors cursor-pointer group relative",
              isDark 
                ? "text-gray-400 hover:bg-gray-800 hover:text-white" 
                : "text-gray-600 hover:bg-gray-200 hover:text-black",
              !open && "justify-center px-2"
            )}
          >
            <FileText className={cn("h-5 w-5", !open && "h-6 w-6")} />
            {open && <span className="ml-3">Docs</span>}
            
            {!open && (
              <div className={cn(
                "absolute left-full ml-2 rounded-md px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border",
                isDark 
                  ? "bg-gray-800 text-white border-gray-700" 
                  : "bg-gray-200 text-black border-gray-300"
              )}>
                Docs
              </div>
            )}
          </a>
        </div>
        
        {/* Spacer */}
        <div className="flex-1"></div>
        
        {/* Wallet Credentials Section - Moved to bottom */}
        <div className={cn("p-4 border-t", isDark ? "border-gray-800" : "border-gray-300", !open && "px-2")}>
          {open && (
            <div className="space-y-3">
              {/* Credentials Header with Toggle */}
              <button
                onClick={() => setShowCredentials(!showCredentials)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-3 text-sm rounded-lg transition-colors group",
                  isDark 
                    ? "text-gray-400 hover:bg-gray-800 hover:text-white" 
                    : "text-gray-600 hover:bg-gray-200 hover:text-black"
                )}
              >
                <div className="flex items-center space-x-3">
                  <Wallet className="h-5 w-5" />
                  <span className="font-medium">Wallet Credentials</span>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  showCredentials && "rotate-180"
                )} />
              </button>
              
              {/* Credentials Status - Always visible when expanded */}
              <div className="flex items-center space-x-2 px-3">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isConfirmed ? "bg-green-500" : hasCredentials ? "bg-yellow-500" : "bg-red-500"
                )} />
                <span className={cn("text-xs", isDark ? "text-gray-400" : "text-gray-600")}>
                  {isConfirmed ? "Credentials Confirmed" : hasCredentials ? "Credentials Set (Unconfirmed)" : "Missing Credentials"}
                </span>
              </div>
              
              {/* Collapsible Credentials Form */}
              {showCredentials && (
                <div className="space-y-3 px-3">
                  {/* Public Key Input */}
                  <div className="space-y-1">
                    <label className={cn("text-xs flex items-center space-x-1", isDark ? "text-gray-400" : "text-gray-600")}>
                      <Key className="h-3 w-3" />
                      <span>Public Key</span>
                    </label>
                    <input
                      type="text"
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                      placeholder="Enter your wallet public key..."
                      className={cn(
                        "w-full px-3 py-2 border rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent",
                        isDark 
                          ? "bg-gray-900 border-gray-700 text-white focus:ring-white" 
                          : "bg-gray-100 border-gray-300 text-black focus:ring-gray-500"
                      )}
                    />
                  </div>
                  
                  {/* Private Key Input */}
                  <div className="space-y-1">
                    <label className={cn("text-xs flex items-center space-x-1", isDark ? "text-gray-400" : "text-gray-600")}>
                      <Key className="h-3 w-3" />
                      <span>Private Key</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPrivateKey ? "text" : "password"}
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        placeholder="Enter your wallet private key..."
                        className={cn(
                          "w-full px-3 py-2 pr-10 border rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent",
                          isDark 
                            ? "bg-gray-900 border-gray-700 text-white focus:ring-white" 
                            : "bg-gray-100 border-gray-300 text-black focus:ring-gray-500"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        className={cn(
                          "absolute right-3 top-1/2 transform -translate-y-1/2",
                          isDark 
                            ? "text-gray-400 hover:text-white" 
                            : "text-gray-600 hover:text-black"
                        )}
                      >
                        {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  
                  {/* Confirm Button - only show when both credentials are entered and not confirmed */}
                  {publicKey && privateKey && !isConfirmed && (
                    <div className="pt-2">
                      <button
                        onClick={() => {
                          confirmCredentials()
                          
                          // Trigger a custom event to notify that credentials are confirmed
                          window.dispatchEvent(new CustomEvent('credentialsConfirmed', {
                            detail: { publicKey, privateKey }
                          }))
                          
                          // Show a brief confirmation message
                          const confirmMessage = document.createElement('div')
                          confirmMessage.textContent = '✓ Credentials confirmed!'
                          confirmMessage.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg z-50 text-sm'
                          document.body.appendChild(confirmMessage)
                          
                          setTimeout(() => {
                            document.body.removeChild(confirmMessage)
                          }, 2000)
                          
                          // Auto-collapse the credentials section after confirmation
                          setTimeout(() => {
                            setShowCredentials(false)
                          }, 2500)
                        }}
                        className={cn(
                          "w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                          isDark ? "focus:ring-offset-gray-900" : "focus:ring-offset-gray-100"
                        )}
                      >
                        Confirm Credentials
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {!open && (
            <div className="flex justify-center py-3">
              <div className={cn(
                "w-4 h-4 rounded-full",
                isConfirmed ? "bg-green-500" : hasCredentials ? "bg-yellow-500" : "bg-red-500"
              )} />
            </div>
          )}
        </div>
        
        {/* Back to Home */}
        <div className={cn("p-4 border-t", isDark ? "border-gray-800" : "border-gray-300", !open && "px-2")}>
          <Link 
            href="/" 
            className={cn(
              "flex items-center px-3 py-3 text-sm rounded-lg transition-colors cursor-pointer group relative",
              isDark 
                ? "text-gray-400 hover:bg-gray-800 hover:text-white" 
                : "text-gray-600 hover:bg-gray-200 hover:text-black",
              !open && "justify-center px-2"
            )}
          >
            <ArrowLeft className={cn("h-5 w-5", !open && "h-6 w-6")} />
            {open && <span className="ml-3">Back to Home</span>}
            
            {!open && (
              <div className={cn(
                "absolute left-full ml-2 rounded-md px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border",
                isDark 
                  ? "bg-gray-800 text-white border-gray-700" 
                  : "bg-gray-200 text-black border-gray-300"
              )}>
                Back to Home
              </div>
            )}
          </Link>
        </div>
      </div>
    </div>
  )
}
