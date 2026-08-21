export type OhlcBar = {
  high: number
  low: number
  close: number
}

export type Trend = 'up' | 'down' | 'range'

export function ema(values: number[], period: number): number | null {
  if (period < 1 || values.length < period) return null
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
  }
  return prev
}

export function rsiWilder(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1]
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    const g = delta > 0 ? delta : 0
    const l = delta < 0 ? -delta : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export function atr(bars: OhlcBar[], period = 14): number | null {
  if (bars.length < period + 1) return null
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close
    const range = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev),
      Math.abs(bars[i].low - prev)
    )
    trs.push(range)
  }
  if (trs.length < period) return null
  let prev = 0
  for (let i = 0; i < period; i++) prev += trs[i]
  prev /= period
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period
  }
  return prev
}

export function trendFromEmas(
  ema20: number | null,
  ema50: number | null,
  ema200: number | null,
  atr14: number | null
): Trend | null {
  if (ema20 == null || ema50 == null || ema200 == null) return null
  const stackedUp = ema20 > ema50 && ema50 > ema200
  const stackedDown = ema20 < ema50 && ema50 < ema200
  const slope = ema20 - ema50
  const dead = atr14 != null && atr14 > 0 ? Math.abs(slope) < atr14 * 0.05 : Math.abs(slope) < 0.2
  if (dead) return 'range'
  if (stackedUp) return 'up'
  if (stackedDown) return 'down'
  return 'range'
}

export function highLow(bars: Array<{ high: number; low: number }>): {
  high: number
  low: number
} | null {
  if (bars.length === 0) return null
  let high = -Infinity
  let low = Infinity
  for (const bar of bars) {
    if (bar.high > high) high = bar.high
    if (bar.low < low) low = bar.low
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return { high, low }
}

export function posInRange(price: number, high: number, low: number): number | null {
  const span = high - low
  if (!(span > 0) || !Number.isFinite(price)) return null
  return Math.min(1, Math.max(0, (price - low) / span))
}

export function pctChange(closes: number[], lookback: number): number | null {
  if (lookback < 1 || closes.length <= lookback) return null
  const now = closes[closes.length - 1]
  const prev = closes[closes.length - 1 - lookback]
  if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) return null
  return (now - prev) / prev
}
