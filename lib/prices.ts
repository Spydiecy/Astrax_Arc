// Price helpers for Astrax. Current prices come from the Coinbase spot API:
//   GET https://api.coinbase.com/v2/prices/<SYMBOL>-USD/spot
//   -> { "data": { "amount": "0.999795", "base": "USDT", "currency": "USD" } }
// Historical candles use Coinbase's Exchange product candles when a market exists;
// otherwise we build a short indicative series from the current spot price (useful
// for tokens that have no live Coinbase market).

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Current USD spot price for a symbol via Coinbase, e.g. spotPriceUSD("USDT"). */
export async function spotPriceUSD(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${symbol.toUpperCase()}-USD/spot`, {
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

/** Historical spot price on a given date (Coinbase supports ?date=YYYY-MM-DD). */
async function spotPriceOnDate(symbol: string, date: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${symbol.toUpperCase()}-USD/spot?date=${date}`, {
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
      `https://api.exchange.coinbase.com/products/${symbol.toUpperCase()}-USD/candles?granularity=86400`,
      { headers: { accept: "application/json", "User-Agent": "astrax" } },
    )
    if (!res.ok) return null
    const arr = (await res.json()) as number[][]
    if (!Array.isArray(arr) || arr.length === 0) return null
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
 * Build an indicative candle series when no real market exists.
 * Tries Coinbase historical daily spot (open=close per day); if that fails,
 * derives a gentle series from the current spot. Returns null if no price at all.
 */
export async function indicativeCandles(symbol: string, days: number): Promise<Candle[] | null> {
  const today = new Date()
  const dayMs = 86_400_000

  // Attempt real historical daily spot prices.
  const dates: string[] = []
  for (let i = days; i >= 0; i--) {
    dates.push(new Date(today.getTime() - i * dayMs).toISOString().slice(0, 10))
  }
  const prices = await Promise.all(dates.map((d) => spotPriceOnDate(symbol, d)))
  const haveHistory = prices.filter((p) => p != null).length >= 2

  if (haveHistory) {
    const candles: Candle[] = []
    for (let i = 1; i < prices.length; i++) {
      const open = prices[i - 1]
      const close = prices[i]
      if (open == null || close == null) continue
      candles.push({
        timestamp: today.getTime() - (days - i) * dayMs,
        open,
        close,
        high: Math.max(open, close),
        low: Math.min(open, close),
        volume: 0,
      })
    }
    if (candles.length >= 2) return candles
  }

  // Last resort: synthesize a small series around the current spot.
  const spot = await spotPriceUSD(symbol)
  if (spot == null) return null
  const out: Candle[] = []
  let price = spot
  for (let i = days - 1; i >= 0; i--) {
    const open = price
    const drift = (Math.random() - 0.5) * 0.03 * spot
    const close = Math.max(spot * 0.5, open + drift)
    out.push({
      timestamp: today.getTime() - i * dayMs,
      open,
      close,
      high: Math.max(open, close) * (1 + Math.random() * 0.01),
      low: Math.min(open, close) * (1 - Math.random() * 0.01),
      volume: 0,
    })
    price = close
  }
  return out
}
