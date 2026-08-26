import assert from 'node:assert/strict'

import { buildDecisionSnapshot } from './builder'
import type { MarketSnapshot } from '../../preload/market-types'
import type { NewsSnapshot } from '../../preload/news-types'
import type { PmSnapshot } from '../../preload/pm-types'

const news: NewsSnapshot = { asOf: null, lastError: null, headlines: [], calendar: [] }
const pm: PmSnapshot = {
  symbol: 'BTCUSD',
  displayName: 'BTC',
  quotes: [],
  health: {
    status: 'idle',
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    pollIntervalMs: 60_000
  }
}

function market(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    venue: 'okx',
    symbol: 'BTC-USDT-SWAP',
    asOf: new Date().toISOString(),
    ready: true,
    lastError: null,
    priceChangedAt: Date.now(),
    price: { bid: 95000, ask: 95010, mid: 95005, spread: 10 },
    swap: { long: 0, short: 0 },
    specs: { volumeMin: 0.01, volumeStep: 0.01, contractSize: 0.01, fillingMode: null, digits: 1 },
    timeframes: { M15: null, H1: null, H4: null, D1: null },
    levels: [],
    account: null,
    positions: [],
    ...over
  }
}

const ok = buildDecisionSnapshot({ market: market(), pm, news, dailyPnlRealized: null, venue: 'okx' })
assert.equal(ok.meta.symbol, 'BTC-USDT-SWAP')
assert.equal(ok.sources.market, 'ok')

const keyed = buildDecisionSnapshot({
  market: market({ lastError: 'OKX 401', ready: true }),
  pm,
  news,
  dailyPnlRealized: null,
  venue: 'okx'
})
assert.equal(keyed.sources.market, 'error')
assert.notEqual(keyed.sources.market, 'ok')

console.log('snapshot/builder.test.ts ok')
