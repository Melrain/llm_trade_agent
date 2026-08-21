export type OhlcPoint = {
  high: number
  low: number
  close: number
}

export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null)
  if (period < 1 || values.length < period) return out
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: closes.length }, () => null)
  if (closes.length < period + 1) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1]
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  const valueAt = (): number => {
    if (avgLoss === 0) return 100
    return 100 - 100 / (1 + avgGain / avgLoss)
  }
  out[period] = valueAt()
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    const g = delta > 0 ? delta : 0
    const l = delta < 0 ? -delta : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = valueAt()
  }
  return out
}
