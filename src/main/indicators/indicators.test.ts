import assert from 'node:assert/strict'
import { atr, ema, pctChange, rsiWilder, trendFromEmas } from './index'

const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
assert.equal(ema(series, 20), null)
assert.ok(Math.abs((ema([1, 2, 3], 3) ?? 0) - 2) < 1e-9)

const up = Array.from({ length: 30 }, (_, i) => 100 + i)
const rsi = rsiWilder(up, 14)
assert.ok(rsi != null && rsi > 70)

const bars = Array.from({ length: 20 }, (_, i) => ({
  high: 10 + i * 0.1,
  low: 9 + i * 0.1,
  close: 9.5 + i * 0.1
}))
assert.ok((atr(bars, 14) ?? 0) > 0)
assert.equal(trendFromEmas(3, 2, 1, 0.1), 'up')
assert.equal(trendFromEmas(1, 2, 3, 0.1), 'down')
assert.ok(pctChange([100, 110], 1) != null)
console.log('indicators ok')
