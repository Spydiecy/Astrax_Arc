"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Coins, Copy, ExternalLink, Check } from "lucide-react"
import { USDC_ADDRESS, explorerToken, type ArcNetwork, type TokenInfo } from "@/lib/arc"

interface TokenListCardProps {
  tokens: TokenInfo[]
  network: ArcNetwork
  className?: string
}

// Only USDC has a bundled icon; everything else gets a neutral glyph.
const ICONS: Record<string, string> = { USDC: "/usdc.png" }

const formatAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

const TokenListCard: React.FC<TokenListCardProps> = ({ tokens, network, className }) => {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5" />
          Tokens on {network.name}
          <span className="ml-auto text-sm font-normal text-muted-foreground">{tokens.length} tokens</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3">
          {tokens.map((token) => (
            <div
              key={token.address}
              className="flex items-center justify-between p-4 rounded-lg border bg-gradient-to-r from-background to-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                  {ICONS[token.symbol] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ICONS[token.symbol]} alt="" className="w-6 h-6" />
                  ) : (
                    <span aria-hidden>{token.symbol.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{token.name}</h4>
                    <span className="px-2 py-1 text-xs font-mono bg-primary/10 text-primary rounded-full">{token.symbol}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {formatAddress(token.address)} · {token.decimals} decimals
                    {token.address === USDC_ADDRESS && " · native gas token"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyAddress(token.address)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Copy address"
                  aria-label={`Copy ${token.symbol} address`}
                >
                  {copiedAddress === token.address ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  )}
                </button>
                <a
                  href={explorerToken(network, token.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="View on explorer"
                  aria-label={`View ${token.symbol} on the explorer`}
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/chain/arc.png" alt="" className="h-3.5 w-3.5 rounded-full" /> {network.name}
            </span>
            <span>Chain ID {network.id}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default TokenListCard
