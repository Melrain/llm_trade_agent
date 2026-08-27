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

const mixedNews: NewsSnapshot = {
  asOf: new Date().toISOString(),
  lastError: null,
  headlines: [
    {
      id: 'gold-1',
      source: 'kitco',
      sourceZh: 'Kitco',
      title: 'Gold holds near record as dollar slips',
      summary: 'XAUUSD bullion',
      url: 'https://example.com/gold',
      publishedAt: new Date().toISOString(),
      tags: ['gold']
    },
    {
      id: 'btc-1',
      source: 'coindesk',
      sourceZh: 'CoinDesk',
      title: 'Bitcoin jumps after ETF inflows',
      summary: 'BTC rally',
      url: 'https://example.com/btc',
      publishedAt: new Date().toISOString(),
      tags: ['btc', 'crypto']
    }
  ],
  calendar: []
}

const goldSnap = buildDecisionSnapshot({
  market: market({ venue: 'mt5', symbol: 'XAUUSD.s' }),
  pm,
  news: mixedNews,
  dailyPnlRealized: null,
  venue: 'mt5'
})
assert.equal(goldSnap.meta.symbol, 'XAUUSD.s')
assert.equal(goldSnap.news.length, 1)
assert.equal(goldSnap.news[0]?.title.includes('Gold'), true)

const cryptoSnap = buildDecisionSnapshot({
  market: market(),
  pm,
  news: mixedNews,
  dailyPnlRealized: null,
  venue: 'okx'
})
assert.equal(cryptoSnap.news.length, 1)
assert.equal(cryptoSnap.news[0]?.title.includes('Bitcoin'), true)

console.log('snapshot/builder.test.ts ok')
