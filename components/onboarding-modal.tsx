"use client"

import { useState } from "react"
import {
  Sparkles, Wallet, Zap, ArrowRight, ArrowLeft, Check,
  Send, Rocket, Link2, CalendarClock, Boxes, X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0)
  if (!isOpen) return null

  const steps = [
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Meet Astrax",
      body: (
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Astrax is your AI agent for the <strong className="text-black dark:text-white">Sonic Testnet</strong>.
            Just chat in plain English and it turns your words into real on-chain actions.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              { icon: <Send className="w-4 h-4" />, label: "Send tokens" },
              { icon: <Rocket className="w-4 h-4" />, label: "Deploy tokens" },
              { icon: <Link2 className="w-4 h-4" />, label: "Payment links" },
              { icon: <CalendarClock className="w-4 h-4" />, label: "Schedule payments" },
              { icon: <Boxes className="w-4 h-4" />, label: "Explore the chain" },
              { icon: <Zap className="w-4 h-4" />, label: "Market data" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2">
                <span className="text-gray-500 dark:text-gray-400">{f.icon}</span>
                <span className="text-xs font-medium text-black dark:text-white">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      icon: <Wallet className="w-6 h-6" />,
      title: "Choose how you sign",
      body: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600 dark:text-gray-300">Astrax works two ways — pick whichever you like in the sidebar <strong className="text-black dark:text-white">Signing</strong> panel. You can switch anytime.</p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
            <div className="flex items-center gap-2 font-medium text-black dark:text-white">
              <Wallet className="w-4 h-4" /> Wallet mode
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Connect your wallet. Astrax prepares each transaction and you approve it with a one-click
              button right in the chat. Nothing is ever signed without you.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
            <div className="flex items-center gap-2 font-medium text-black dark:text-white">
              <Zap className="w-4 h-4" /> Autonomous mode
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Paste a private key (your address is derived automatically). Astrax signs for you — no
              popups — which unlocks hands-free features like <strong>scheduled payments</strong>.
              Testnet only; the key is never stored or put in the prompt.
            </p>
          </div>
        </div>
      ),
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Try saying…",
      body: (
        <div className="space-y-2">
          {[
            "What's my S balance?",
            "Send 1 S to 0x1234…abcd",
            "Create a token MoonCoin MOON supply 1000000",
            "Make a payment link for 0.5 S",
            "Show the latest blocks",
            "Schedule 2 S to 0x… in 10 minutes",
          ].map((ex) => (
            <div key={ex} className="rounded-lg bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 font-mono">
              “{ex}”
            </div>
          ))}
        </div>
      ),
    },
  ]

  const isLast = step === steps.length - 1
  const current = steps[step]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black shadow-2xl overflow-hidden">
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-gray-900 via-gray-500 to-gray-900 dark:from-white dark:via-gray-500 dark:to-white" />

        <button
          onClick={onClose}
          className="absolute right-3 top-4 p-1 rounded-md text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-gray-900 dark:bg-white text-white dark:text-black flex items-center justify-center">
              {current.icon}
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Step {step + 1} of {steps.length}</div>
              <h2 className="text-lg font-semibold text-black dark:text-white">{current.title}</h2>
            </div>
          </div>

          <div className="min-h-[220px]">{current.body}</div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 my-5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-black dark:bg-white" : "w-1.5 bg-gray-300 dark:bg-gray-700")}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black dark:hover:text-white disabled:opacity-0 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {isLast ? (
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black px-5 py-2.5 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                <Check className="w-4 h-4" /> Start chatting
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black px-5 py-2.5 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
