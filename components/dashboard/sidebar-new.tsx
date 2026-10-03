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
          <div className={cn("flex items-center gap-2", !open && "hidden")}>
            <img 
              src="/s.svg" 
              alt="Sonic" 
              className="w-8 h-8"
            />
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
        
        {/* Docs Button - Updated for Sonic */}
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
        
        {/* Network Information */}
        <div className={cn("p-4 border-t", isDark ? "border-gray-800" : "border-gray-300", !open && "px-2")}>
          {open && (
            <div className="space-y-2">
              <div className={cn(
                "text-xs font-medium",
                isDark ? "text-gray-300" : "text-gray-700"
              )}>
                Network Information
              </div>
              <div className={cn(
                "text-xs space-y-1",
                isDark ? "text-gray-400" : "text-gray-600"
              )}>
                <div>Network: Sonic Testnet</div>
                <div>Chain ID: 14601</div>
                <div>Currency: S</div>
                <div className="break-all">RPC: rpc.testnet.soniclabs.com</div>
                <div className="break-all">Explorer: explorer.testnet.soniclabs.com</div>
              </div>
            </div>
          )}
          
          {!open && (
            <div className="flex justify-center">
              <div className={cn(
                "w-3 h-3 rounded-full",
                isDark ? "bg-green-500" : "bg-green-600"
              )} title="Connected to Sonic Testnet" />
            </div>
          )}
        </div>
        
        {/* Wallet Credentials Section */}
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
                <div className="flex items-center">
                  <Key className="h-5 w-5" />
                  <span className="ml-3">Wallet Credentials</span>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  showCredentials && "rotate-180"
                )} />
              </button>

              {/* Credentials Form - Collapsible */}
              {showCredentials && (
                <div className="space-y-3 pl-3">
                  {/* Public Key Input */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-xs font-medium",
                      isDark ? "text-gray-300" : "text-gray-700"
                    )}>
                      Public Key
                    </label>
                    <input
                      type="text"
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                      placeholder="0x..."
                      className={cn(
                        "w-full px-2 py-1 text-xs rounded border transition-colors",
                        isDark 
                          ? "bg-gray-800 border-gray-600 text-white placeholder:text-gray-500" 
                          : "bg-white border-gray-300 text-black placeholder:text-gray-400"
                      )}
                    />
                  </div>

                  {/* Private Key Input */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-xs font-medium",
                      isDark ? "text-gray-300" : "text-gray-700"
                    )}>
                      Private Key
                    </label>
                    <div className="relative">
                      <input
                        type={showPrivateKey ? "text" : "password"}
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        placeholder="Private key..."
                        className={cn(
                          "w-full px-2 py-1 pr-8 text-xs rounded border transition-colors",
                          isDark 
                            ? "bg-gray-800 border-gray-600 text-white placeholder:text-gray-500" 
                            : "bg-white border-gray-300 text-black placeholder:text-gray-400"
                        )}
                      />
                      <button
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        className={cn(
                          "absolute right-2 top-1/2 transform -translate-y-1/2 transition-colors",
                          isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-black"
                        )}
                      >
                        {showPrivateKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Button */}
                  {hasCredentials && !isConfirmed && (
                    <button
                      onClick={confirmCredentials}
                      className={cn(
                        "w-full px-3 py-2 text-xs rounded transition-colors font-medium",
                        isDark 
                          ? "bg-blue-600 text-white hover:bg-blue-700" 
                          : "bg-blue-500 text-white hover:bg-blue-600"
                      )}
                    >
                      Confirm Credentials
                    </button>
                  )}

                  {/* Status Indicator */}
                  <div className={cn(
                    "text-xs",
                    isConfirmed 
                      ? (isDark ? "text-green-400" : "text-green-600")
                      : hasCredentials 
                        ? (isDark ? "text-yellow-400" : "text-yellow-600")
                        : (isDark ? "text-red-400" : "text-red-600")
                  )}>
                    {isConfirmed 
                      ? "✓ Credentials confirmed" 
                      : hasCredentials 
                        ? "⚠ Please confirm credentials"
                        : "⚠ No credentials provided"
                    }
                  </div>
                </div>
              )}
            </div>
          )}
          
          {!open && (
            <div className="flex justify-center">
              <Key className={cn(
                "h-6 w-6",
                isConfirmed 
                  ? (isDark ? "text-green-400" : "text-green-600")
                  : hasCredentials 
                    ? (isDark ? "text-yellow-400" : "text-yellow-600")
                    : (isDark ? "text-red-400" : "text-red-600")
              )} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
