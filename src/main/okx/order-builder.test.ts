import assert from 'node:assert/strict'

import type { AgentDecision } from '../../preload/agent-types'
import type { DecisionSnapshot } from '../../preload/snapshot-types'
import { buildOkxIntent, okxPositionType } from './order-builder'

function snapshot(over: Partial<DecisionSnapshot> = {}): DecisionSnapshot {
  return {
    meta: {
      snapshotId: 's1',
      symbol: 'BTC-USDT-SWAP',
      generatedAt: '2026-08-26T00:00:00.000Z',
      barTime: 'utc',
      venue: 'okx'
    },
    sources: { market: 'ok', polymarket: 'ok', news: 'ok', calendar: 'ok' },
    account: {
      balance: 1000,
      equity: 1000,
      marginFree: 1000,
      profit: 0,
      dailyPnl: 0,
      dailyPnlRealized: 0,
      currency: 'USDT',
      tradeMode: 0,
      tradeAllowed: true,
      login: 1,
      server: 'OKX-DEMO',
      positions: []
    },
    technical: {
      price: { bid: 95000, ask: 95010, mid: 95005, spread: 10 },
      timeframes: { M15: null, H1: null, H4: null, D1: null },
      levels: []
    },
    polymarket: [],
    news: [],
    calendar: [],
    constraints: {
      maxVolume: 1,
      riskPct: 0.01,
      fixedVolume: null,
      volumeMin: 0.01,
      volumeStep: 0.01,
      contractSize: 0.01,
      fillingMode: null,
      digits: 1,
      swapLong: 0,
      swapShort: 0,
      allowedDirections: ['buy', 'sell'],
      tradingHalted: false,
      haltReason: null
    },
    ...over
  }
}

const openBuy: AgentDecision = {
  action: 'open_buy',
  symbol: 'BTC-USDT-SWAP',
  confidence: 0.8,
  reasoning: 'test',
  keyFactors: [],
  sl: 94000
}

const intent = buildOkxIntent(openBuy, snapshot(), 0.1, {
  tdMode: 'cross',
  leverage: 5,
  promptVersion: 'trader-okx-v1.0'
})
assert.ok(intent)
assert.equal(intent?.kind, 'place')
assert.equal(intent?.side, 'buy')
assert.equal(intent?.sz, '0.1')
assert.equal(intent?.sl, 94000)
assert.equal(intent?.lever, '5')

assert.equal(
  buildOkxIntent({ ...openBuy, action: 'hold' }, snapshot(), 0.1, {
    tdMode: 'cross',
    leverage: 5,
    promptVersion: 'v1'
  }),
  null
)

assert.equal(okxPositionType(-2, 'net'), 'sell')
assert.equal(okxPositionType(2, 'net'), 'buy')
assert.equal(okxPositionType(1, 'short'), 'sell')

console.log('okx/order-builder.test.ts ok')
