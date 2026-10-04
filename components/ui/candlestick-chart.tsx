"use client"

import React, { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react"

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
  /** Number of days the series covers (used for labels). Defaults to the candle count. */
  days?: number
  className?: string
}

// SVG layout (viewBox units; the SVG scales to the card width).
const W = 640
const H = 300
const PAD_TOP = 12
const PAD_LEFT = 8
const AXIS_RIGHT = 64 // price labels
const AXIS_BOTTOM = 24 // date labels
const PLOT_W = W - PAD_LEFT - AXIS_RIGHT
const PLOT_H = H - PAD_TOP - AXIS_BOTTOM
const UP = "#10b981"
const DOWN = "#ef4444"

/** Price with precision that fits its magnitude ($121.57, $0.4213, $0.00001234). */
function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return "—"
  const abs = Math.abs(p)
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`
  return v.toFixed(2)
}

// Candles are UTC days; fixed locale + UTC keeps labels on the right day and
// identical between server and client renders.
const formatDay = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

/** "Nice" evenly spaced ticks covering [min, max] (1/2/2.5/5 × 10ⁿ steps). */
function niceTicks(min: number, max: number, target = 5): { ticks: number[]; lo: number; hi: number } {
  const span = max - min || Math.abs(max) * 0.02 || 1
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toPrecision(12)))
  return { ticks, lo, hi }
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, symbol, days, className }) => {
  const [hover, setHover] = useState<number | null>(null)

  const chart = useMemo(() => {
    if (!data?.length) return null
    const candles = [...data].sort((a, b) => a.timestamp - b.timestamp)
    const high = Math.max(...candles.map((d) => d.high))
    const low = Math.min(...candles.map((d) => d.low))
    const { ticks, lo, hi } = niceTicks(low, high)
    const y = (p: number) => PAD_TOP + ((hi - p) / (hi - lo)) * PLOT_H
    const slot = PLOT_W / candles.length
    const bodyW = Math.max(3, Math.min(28, slot * 0.6))
    const x = (i: number) => PAD_LEFT + slot * i + slot / 2
    // At most ~6 date labels so they never overlap.
    const labelEvery = Math.max(1, Math.ceil(candles.length / 6))
    return { candles, high, low, ticks, y, x, slot, bodyW, labelEvery }
  }, [data])

  if (!chart) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    )
  }

  const { candles, high, low, ticks, y, x, slot, bodyW, labelEvery } = chart
  const first = candles[0]
  const last = candles[candles.length - 1]
  const change = last.close - first.open
  const changePct = first.open ? (change / first.open) * 100 : 0
  const up = change >= 0
  const totalVolume = candles.reduce((s, d) => s + (d.volume || 0), 0)
  const period = `${days ?? candles.length}D`
  const active = hover != null ? candles[hover] : null

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4" />
            {symbol.toUpperCase()} / USD
            <span className="text-xs font-normal text-muted-foreground">{period} · daily</span>
          </CardTitle>
          <div className={cn("flex items-center gap-1.5 font-mono text-sm", up ? "text-green-500" : "text-red-500")}>
            {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Period stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Last price" value={formatPrice(last.close)} strong />
          <Stat label={`${period} high`} value={formatPrice(high)} className="text-green-500" />
          <Stat label={`${period} low`} value={formatPrice(low)} className="text-red-500" />
          <Stat label={`${period} volume`} value={totalVolume > 0 ? `${formatVolume(totalVolume)} ${symbol.toUpperCase()}` : "—"} />
        </div>

        {/* Hovered candle details (fixed height so the layout doesn't jump) */}
        <div className="h-5 mb-1 text-xs font-mono text-muted-foreground flex flex-wrap gap-x-3" aria-live="polite">
          {active ? (
            <>
              <span className="text-foreground">{formatDay(active.timestamp)}</span>
              <span>O {formatPrice(active.open)}</span>
              <span>H {formatPrice(active.high)}</span>
              <span>L {formatPrice(active.low)}</span>
              <span className={active.close >= active.open ? "text-green-500" : "text-red-500"}>C {formatPrice(active.close)}</span>
            </>
          ) : (
            <span>Hover a candle for details</span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto rounded-lg border bg-muted/20 text-muted-foreground select-none"
          role="img"
          aria-label={`${symbol.toUpperCase()} daily candlestick chart, ${formatDay(first.timestamp)} to ${formatDay(last.timestamp)}, ${up ? "up" : "down"} ${Math.abs(changePct).toFixed(2)} percent`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Price grid + right-hand axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_LEFT} x2={PAD_LEFT + PLOT_W} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" />
              <text x={PAD_LEFT + PLOT_W + 8} y={y(t)} dominantBaseline="middle" fontSize={11} fill="currentColor">
                {formatPrice(t)}
              </text>
            </g>
          ))}

          {/* Date labels aligned under their candles */}
          {candles.map((c, i) =>
            i % labelEvery === 0 || i === candles.length - 1 ? (
              <text key={`d${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor">
                {formatDay(c.timestamp)}
              </text>
            ) : null,
          )}

          {/* Hover column highlight */}
          {hover != null && (
            <rect x={x(hover) - slot / 2} y={PAD_TOP} width={slot} height={PLOT_H} fill="currentColor" fillOpacity={0.06} />
          )}

          {/* Candles */}
          {candles.map((c, i) => {
            const color = c.close >= c.open ? UP : DOWN
            const top = y(Math.max(c.open, c.close))
            const bottom = y(Math.min(c.open, c.close))
            return (
              <g key={c.timestamp}>
                <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1.5} />
                <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(bottom - top, 1.5)} fill={color} rx={1.5} />
                {/* Full-height hit area for hover */}
                <rect
                  x={x(i) - slot / 2}
                  y={PAD_TOP}
                  width={slot}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            )
          })}

          {/* Last-price marker on the axis */}
          <line x1={PAD_LEFT} x2={PAD_LEFT + PLOT_W} y1={y(last.close)} y2={y(last.close)} stroke={up ? UP : DOWN} strokeOpacity={0.5} strokeWidth={1} />
          <rect x={PAD_LEFT + PLOT_W + 2} y={y(last.close) - 9} width={AXIS_RIGHT - 4} height={18} rx={3} fill={up ? UP : DOWN} />
          <text x={PAD_LEFT + PLOT_W + 8} y={y(last.close)} dominantBaseline="middle" fontSize={11} fontWeight={600} fill="#fff">
            {formatPrice(last.close)}
          </text>
        </svg>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, className, strong }: { label: string; value: string; className?: string; strong?: boolean }) {
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-mono truncate", strong ? "text-base font-semibold" : "text-sm", className)}>{value}</p>
    </div>
  )
}

export default CandlestickChart
