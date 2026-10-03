"use client"

import React from "react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface SessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSessionCreated: (sessionId: string, userId: string) => void
  currentSessionId?: string | null
  currentUserId?: string
  currentAppName?: string
}

export function SessionModal({ 
  isOpen, 
  onClose, 
  onSessionCreated, 
  currentSessionId, 
  currentUserId, 
  currentAppName 
}: SessionModalProps) {
  const [userId, setUserId] = useState(currentUserId || "")
  const [appName, setAppName] = useState(currentAppName || "blockchain-assistant")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)
  const { theme } = useTheme()

  // Ensure component is mounted before rendering to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setUserId(currentUserId || "")
      setAppName(currentAppName || "blockchain-assistant")
      setError("")
    }
  }, [isOpen, currentUserId, currentAppName])

  if (!mounted) return null

  const isDark = theme === 'dark'

  const createSession = async () => {
    if (!userId.trim() || !appName.trim()) {
      setError("Please fill in all fields")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appName,
          userId,
          state: {},
          events: [],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const sessionData = await response.json()

      // Store in localStorage
      localStorage.setItem("sessionId", sessionData.id)
      localStorage.setItem("userId", userId)
      localStorage.setItem("appName", appName)

      onSessionCreated(sessionData.id, userId)
      onClose()
    } catch (error) {
      console.error("Failed to create session:", error)
      setError(error instanceof Error ? error.message : "Failed to create session. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      createSession()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        "border transition-colors",
        isDark 
          ? "bg-black border-gray-800 text-white" 
          : "bg-white border-gray-300 text-black"
      )}>
        <DialogHeader>
          <DialogTitle className={cn(
            isDark ? "text-white" : "text-black"
          )}>
            {currentSessionId ? "Create New Chat Session" : "Create New Session"}
          </DialogTitle>
          <DialogDescription className={cn(
            isDark ? "text-gray-300" : "text-gray-600"
          )}>
            {currentSessionId 
              ? "Start a new chat session. This will create a fresh conversation." 
              : "Enter your details to start a new AI chat session"
            }
          </DialogDescription>
        </DialogHeader>

        {currentSessionId && (
          <div className={cn(
            "rounded-lg p-3 border",
            isDark 
              ? "bg-gray-900 border-gray-800" 
              : "bg-gray-50 border-gray-200"
          )}>
            <div className={cn(
              "text-sm mb-1",
              isDark ? "text-gray-300" : "text-gray-600"
            )}>Current Session</div>
            <div className="text-sm">
              <div>Session ID: <span className={cn(
                isDark ? "text-white" : "text-gray-700"
              )}>{currentSessionId}</span></div>
              <div>User ID: <span className={cn(
                isDark ? "text-white" : "text-gray-700"
              )}>{currentUserId}</span></div>
              <div>App: <span className={cn(
                isDark ? "text-white" : "text-gray-700"
              )}>{currentAppName}</span></div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="appName" className={cn(
              isDark ? "text-white" : "text-black"
            )}>App Name</Label>
            <Input
              id="appName"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="blockchain-assistant"
              className={cn(
                "border transition-colors",
                isDark 
                  ? "bg-black border-gray-800 text-white placeholder:text-gray-400" 
                  : "bg-white border-gray-300 text-black placeholder:text-gray-500"
              )}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="userId" className={cn(
              isDark ? "text-white" : "text-black"
            )}>User ID</Label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your user ID"
              className={cn(
                "border transition-colors",
                isDark 
                  ? "bg-black border-gray-800 text-white placeholder:text-gray-400" 
                  : "bg-white border-gray-300 text-black placeholder:text-gray-500"
              )}
              disabled={isLoading}
            />
          </div>

          {error && <div className={cn(
            "text-sm",
            isDark ? "text-red-400" : "text-red-600"
          )}>{error}</div>}

          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className={cn(
                "border transition-colors",
                isDark 
                  ? "border-gray-800 text-white hover:bg-gray-900 bg-transparent" 
                  : "border-gray-300 text-black hover:bg-gray-50 bg-white"
              )}
            >
              Cancel
            </Button>
            <Button
              onClick={createSession}
              disabled={isLoading || !userId.trim() || !appName.trim()}
              className={cn(
                "transition-colors",
                isDark 
                  ? "bg-white text-black hover:bg-gray-200" 
                  : "bg-black text-white hover:bg-gray-800"
              )}
            >
              {isLoading ? "Creating..." : currentSessionId ? "Create New Session" : "Create Session"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
