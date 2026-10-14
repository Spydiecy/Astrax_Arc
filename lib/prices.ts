// Price helpers for Astrax. Current prices come from the Coinbase spot API:
//   GET https://api.coinbase.com/v2/prices/<SYMBOL>-USD/spot
//   -> { "data": { "amount": "0.999795", "base": "USDT", "currency": "USD" } }
// Historical candles come from Coinbase's Exchange product candles when a market
// exists, otherwise from CoinGecko's OHLC (this is what covers USDC and EURC, which
// have no Coinbase USD market). Nothing is ever made up: no data means no chart.

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Arc wrapped assets trade under their underlying ticker.
const PRICE_ALIAS: Record<string, string> = { WETH: "ETH", CIRBTC: "BTC" }
const priceSymbol = (symbol: string) => {
  const s = symbol.trim().toUpperCase()
  return PRICE_ALIAS[s] ?? s
}

/** CoinGecko ids for the assets Astrax knows about on Arc. */
export const COINGECKO_IDS: Record<string, string> = {
  USDC: "usd-coin",
  EURC: "euro-coin",
  WETH: "ethereum",
  ETH: "ethereum",
  CIRBTC: "bitcoin",
  BTC: "bitcoin",
}

/** Current USD spot price for a symbol via Coinbase, e.g. spotPriceUSD("USDC"). */
export async function spotPriceUSD(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${priceSymbol(symbol)}-USD/spot`, {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return null
    const j = await res.json()
    const amount = parseFloat(j?.data?.amount)
    return Number.isFinite(amount) ? amount : null
  } catch {
    return null
  }
}

/** Real daily OHLC candles from Coinbase Exchange, if the <SYMBOL>-USD product exists. */
export async function dailyCandles(symbol: string, days: number): Promise<Candle[] | null> {
  try {
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${priceSymbol(symbol)}-USD/candles?granularity=86400`,
      { headers: { accept: "application/json", "User-Agent": "astrax" } },
    )
    if (!res.ok) return null
    const arr = (await res.json()) as number[][]
    if (!Array.isArray(arr) || arr.length === 0) return null
    // Delisted products keep returning their last (old) candles; treat those as no market.
    if (Date.now() - arr[0][0] * 1000 > 3 * 86_400_000) return null
    // Coinbase returns [ time, low, high, open, close, volume ], newest first.
    return arr
      .slice(0, days)
      .reverse()
      .map((c) => ({ timestamp: c[0] * 1000, low: c[1], high: c[2], open: c[3], close: c[4], volume: c[5] }))
  } catch {
    return null
  }
}

/**
 * Daily candles from CoinGecko's OHLC endpoint. It returns 4-hour candles for short
 * ranges (and has no volume), so they are folded into UTC days. Used for assets
 * Coinbase doesn't list, notably the USDC / EURC stablecoins.
 */
export async function coingeckoCandles(symbol: string, days: number): Promise<Candle[] | null> {
  const id = COINGECKO_IDS[symbol.trim().toUpperCase()]
  if (!id) return null
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${Math.min(30, Math.max(2, days))}`, {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as number[][]
    if (!Array.isArray(rows) || rows.length === 0) return null
    const byDay = new Map<number, Candle>()
    for (const [t, o, h, l, c] of rows) {
      const day = Math.floor(t / 86_400_000) * 86_400_000
      const cur = byDay.get(day)
      if (!cur) byDay.set(day, { timestamp: day, open: o, high: h, low: l, close: c, volume: 0 })
      else {
        cur.high = Math.max(cur.high, h)
        cur.low = Math.min(cur.low, l)
        cur.close = c // rows are in time order, so the last one closes the day
      }
    }
    const out = [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-days)
    return out.length >= 2 ? out : null
  } catch {
    return null
  }
}

/** Daily candles for a symbol: Coinbase first, then CoinGecko. null when neither has a market. */
export async function priceCandles(symbol: string, days: number): Promise<Candle[] | null> {
  return (await dailyCandles(symbol, days)) ?? (await coingeckoCandles(symbol, days))
}
