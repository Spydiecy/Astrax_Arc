"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'

interface CandlestickData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface CandlestickChartProps {
  data: CandlestickData[]
  symbol: string
  className?: string
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, symbol, className }) => {
  if (!data || data.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    )
  }

  // Calculate price statistics
  const prices = data.map(d => d.close)
  const currentPrice = prices[prices.length - 1]
  const previousPrice = prices[prices.length - 2] || currentPrice
  const priceChange = currentPrice - previousPrice
  const priceChangePercent = ((priceChange / previousPrice) * 100)
  
  const highestPrice = Math.max(...data.map(d => d.high))
  const lowestPrice = Math.min(...data.map(d => d.low))
  const totalVolume = data.reduce((sum, d) => sum + d.volume, 0)

  // Calculate chart dimensions
  const chartHeight = 300
  const chartWidth = data.length * 8 // 8px per candle
  const maxPrice = Math.max(...data.map(d => d.high))
  const minPrice = Math.min(...data.map(d => d.low))
  const priceRange = maxPrice - minPrice

  const formatPrice = (price: number) => {
    return price.toFixed(6)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString()
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(2)}M`
    if (volume >= 1000) return `${(volume / 1000).toFixed(2)}K`
    return volume.toFixed(2)
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {symbol.toUpperCase()} Candlestick Chart
          </CardTitle>
          <div className="flex items-center gap-2">
            {priceChange >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className={cn(
              "font-mono text-sm",
              priceChange >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Price Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current Price</p>
            <p className="font-mono text-lg font-semibold">${formatPrice(currentPrice)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">24h High</p>
            <p className="font-mono text-sm text-green-600">${formatPrice(highestPrice)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">24h Low</p>
            <p className="font-mono text-sm text-red-600">${formatPrice(lowestPrice)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Volume</p>
            <p className="font-mono text-sm">{formatVolume(totalVolume)}</p>
          </div>
        </div>

        {/* Chart Container */}
        <div className="relative">
          <div className="overflow-x-auto">
            <div className="min-w-full" style={{ width: Math.max(chartWidth, 600) }}>
              <svg
                width="100%"
                height={chartHeight}
                viewBox={`0 0 ${Math.max(chartWidth, 600)} ${chartHeight}`}
                className="border rounded-lg bg-gradient-to-b from-background to-muted/20"
              >
                {/* Grid Lines */}
                {Array.from({ length: 6 }, (_, i) => {
                  const y = (i * chartHeight) / 5
                  const price = maxPrice - (i * priceRange) / 5
                  return (
                    <g key={i}>
                      <line
                        x1="0"
                        y1={y}
                        x2="100%"
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity="0.1"
                        strokeDasharray="2,2"
                      />
                      <text
                        x="8"
                        y={y - 4}
                        fontSize="10"
                        fill="currentColor"
                        opacity="0.6"
                      >
                        ${formatPrice(price)}
                      </text>
                    </g>
                  )
                })}

                {/* Candlesticks */}
                {data.map((candle, index) => {
                  const x = index * 8 + 40 // 8px spacing + 40px left margin
                  const openY = chartHeight - ((candle.open - minPrice) / priceRange) * (chartHeight - 40) - 20
                  const closeY = chartHeight - ((candle.close - minPrice) / priceRange) * (chartHeight - 40) - 20
                  const highY = chartHeight - ((candle.high - minPrice) / priceRange) * (chartHeight - 40) - 20
                  const lowY = chartHeight - ((candle.low - minPrice) / priceRange) * (chartHeight - 40) - 20
                  
                  const isGreen = candle.close >= candle.open
                  const bodyHeight = Math.abs(closeY - openY)
                  const bodyY = Math.min(openY, closeY)

                  return (
                    <g key={index}>
                      {/* Wick */}
                      <line
                        x1={x + 3}
                        y1={highY}
                        x2={x + 3}
                        y2={lowY}
                        stroke={isGreen ? "#10b981" : "#ef4444"}
                        strokeWidth="1"
                      />
                      
                      {/* Body */}
                      <rect
                        x={x}
                        y={bodyY}
                        width="6"
                        height={Math.max(bodyHeight, 1)}
                        fill={isGreen ? "#10b981" : "#ef4444"}
                        opacity={isGreen ? "0.8" : "0.8"}
                        rx="1"
                      />
                      
                      {/* Hover tooltip trigger */}
                      <rect
                        x={x - 2}
                        y={highY}
                        width="10"
                        height={lowY - highY}
                        fill="transparent"
                        className="cursor-pointer"
                      >
                        <title>
                          {formatDate(candle.timestamp)}
                          {'\n'}Open: ${formatPrice(candle.open)}
                          {'\n'}High: ${formatPrice(candle.high)}
                          {'\n'}Low: ${formatPrice(candle.low)}
                          {'\n'}Close: ${formatPrice(candle.close)}
                          {'\n'}Volume: {formatVolume(candle.volume)}
                        </title>
                      </rect>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>

          {/* Time axis */}
          <div className="flex justify-between mt-2 px-10 text-xs text-muted-foreground">
            <span>{formatDate(data[0]?.timestamp)}</span>
            <span>{formatDate(data[Math.floor(data.length / 2)]?.timestamp)}</span>
            <span>{formatDate(data[data.length - 1]?.timestamp)}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-sm text-muted-foreground">Bullish (Green)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-sm text-muted-foreground">Bearish (Red)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default CandlestickChart
