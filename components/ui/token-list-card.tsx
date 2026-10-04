"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Coins, Copy, ExternalLink, Check } from 'lucide-react'
import { useState } from 'react'
import { CLUSTER_LABEL, NATIVE_SENTINEL, explorerAddress, explorerPath } from '@/lib/solana'

interface Token {
  symbol: string
  name: string
  address: string
  icon?: string
}

interface TokenListCardProps {
  tokens: Token[]
  className?: string
}

const TokenListCard: React.FC<TokenListCardProps> = ({ tokens, className }) => {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (error) {
      console.error('Failed to copy address:', error)
    }
  }

  const getTokenIcon = (symbol: string): string => {
    const tokenIcons: Record<string, string> = {
      'USDT': '/usdt.png',
      'USDC': '/usdc.png',
      'SOL': '/sol.svg',
      'crvUSD': '/crv.png',
      'DAI': '/dai.png',
      'DMCX': '/dmcx.png',
      'FB': '/fb.png',
      'QUICK': '/quick.png',
      'sUSDe': '/susde.png',
      'STONE': '/stone.png',
      'USDe': '/usde.png',
      'WETH': '/eth.svg',
      'WBTC': '/wbtc.png',
    }
    return tokenIcons[symbol] || '🪙'
  }

  const formatAddress = (address: string): string => {
    if (address === NATIVE_SENTINEL) {
      return 'Native Token'
    }
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5" />
          Supported Tokens on Solana
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {tokens.length} tokens
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {tokens.map((token, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 rounded-lg border bg-gradient-to-r from-background to-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Token Icon */}
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  {getTokenIcon(token.symbol).startsWith('/') ? (
                    <img
                      src={getTokenIcon(token.symbol)}
                      alt={token.symbol}
                      className="w-6 h-6"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) {
                          parent.textContent = '🪙'
                        }
                      }}
                    />
                  ) : (
                    <span className="text-lg">{getTokenIcon(token.symbol)}</span>
                  )}
                </div>

                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{token.name}</h4>
                    <span className="px-2 py-1 text-xs font-mono bg-primary/10 text-primary rounded-full">
                      {token.symbol}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {formatAddress(token.address)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Copy Address Button */}
                <button
                  onClick={() => handleCopyAddress(token.address)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Copy address"
                >
                  {copiedAddress === token.address ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  )}
                </button>

                {/* Explorer Link */}
                <a
                  href={token.address === NATIVE_SENTINEL ? explorerPath("/supply") : explorerAddress(token.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Network: Solana</span>
            <span>Cluster: {CLUSTER_LABEL}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default TokenListCard
