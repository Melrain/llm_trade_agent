import assert from 'node:assert/strict'

import type { AgentDecision, AgentRecord } from '../../preload/agent-types'
import type { DecisionSnapshot } from '../../preload/snapshot-types'
import {
  consecutiveLossesToday,
  evaluateRisk,
  lastPassedOpenAt,
  MAX_CONSECUTIVE_LOSSES,
  MAX_OPENS_PER_DAY,
  sentOpensToday,
  sizeOpenVolume
} from './risk'

function snapshot(over: Partial<DecisionSnapshot> = {}): DecisionSnapshot {
  const base: DecisionSnapshot = {
    meta: {
      snapshotId: 's1',
      symbol: 'XAUUSD.s',
      generatedAt: '2026-08-20T12:00:00.000Z',
      barTime: 'mt5-server'
    },
    sources: { market: 'ok', polymarket: 'ok', news: 'ok', calendar: 'ok' },
    account: {
      balance: 10_000,
      equity: 10_000,
      marginFree: 10_000,
      profit: 0,
      dailyPnl: 0,
      dailyPnlRealized: 0,
      currency: 'USD',
      tradeMode: 0,
      tradeAllowed: true,
      login: 1,
      server: 'Demo',
      positions: []
    },
    technical: {
      price: { bid: 4490, ask: 4490.3, mid: 4490.15, spread: 0.3 },
      timeframes: {
        M15: null,
        H1: {
          ema20: 1,
          ema50: 1,
          ema200: 1,
          rsi14: 50,
          atr14: 10,
          trend: 'range',
          pctChange24h: 0,
          recentBars: []
        },
        H4: null,
        D1: null
      },
      levels: []
    },
    polymarket: [],
    news: [],
    calendar: [],
    constraints: {
      maxVolume: 0.1,
      riskPct: 0.01,
      fixedVolume: null,
      volumeMin: 0.01,
      volumeStep: 0.01,
      contractSize: 100,
      fillingMode: 2,
      digits: 2,
      swapLong: 0,
      swapShort: 0,
      allowedDirections: ['buy', 'sell'],
      tradingHalted: false,
      haltReason: null
    }
  }
  return {
    ...base,
    ...over,
    account: over.account === undefined ? base.account : over.account,
    technical: over.technical === undefined ? base.technical : over.technical,
    constraints: over.constraints ? { ...base.constraints, ...over.constraints } : base.constraints
  }
}

function openSell(over: Partial<AgentDecision> = {}): AgentDecision {
  return {
    action: 'open_sell',
    symbol: 'XAUUSD.s',
    confidence: 0.7,
    volume: 0.05,
    sl: 4500,
    reasoning: 'test',
    keyFactors: [],
    ...over
  }
}

function record(over: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'r1',
    snapshotId: 's1',
    symbol: 'XAUUSD.s',
    createdAt: '2026-08-20T11:00:00.000Z',
    promptVersion: 'trader-v1.3',
    model: 'test',
    decision: openSell(),
    parseError: null,
    riskVerdict: 'pass',
    riskReason: null,
    tokens: null,
    skipped: null,
    ...over
  }
}

const sized = sizeOpenVolume({
  equity: 10_000,
  slDistance: 10,
  contractSize: 100,
  volumeMin: 0.01,
  volumeStep: 0.01,
  maxVolume: 0.1
})
assert.ok('volume' in sized)
// 1% of 10000 = 100; 100 / (100 * 10) = 0.1
assert.equal(sized.volume, 0.1)

const capped = sizeOpenVolume({
  equity: 100_000,
  slDistance: 10,
  contractSize: 100,
  volumeMin: 0.01,
  volumeStep: 0.01,
  maxVolume: 0.1
})
assert.ok('volume' in capped)
assert.equal(capped.volume, 0.1)

const tooSmall = sizeOpenVolume({
  equity: 50,
  slDistance: 20,
  contractSize: 100,
  volumeMin: 0.01,
  volumeStep: 0.01,
  maxVolume: 0.1
})
assert.ok('error' in tooSmall)
assert.match(tooSmall.error, /最小手数风险/)

const daily = evaluateRisk(
  openSell(),
  snapshot({
    account: {
      balance: 10_000,
      equity: 10_000,
      marginFree: 9_000,
      profit: -200,
      dailyPnl: -400,
      dailyPnlRealized: -200,
      currency: 'USD',
      tradeMode: 0,
      tradeAllowed: true,
      login: 1,
      server: 'Demo',
      positions: []
    }
  }),
  { records: [], intervalMs: 15 * 60 * 1000 }
)
assert.equal(daily.verdict, 'reject')
assert.match(daily.reason ?? '', /当日亏损/)

const interval = evaluateRisk(openSell(), snapshot(), {
  records: [
    record({
      createdAt: '2026-08-20T11:50:00.000Z',
      execution: { status: 'sent', reason: '已发单' }
    })
  ],
  intervalMs: 15 * 60 * 1000,
  now: Date.parse('2026-08-20T12:00:00.000Z')
})
assert.equal(interval.verdict, 'reject')
assert.match(interval.reason ?? '', /决策周期/)

const previewDoesNotBlock = evaluateRisk(openSell(), snapshot(), {
  records: [
    record({
      createdAt: '2026-08-20T11:50:00.000Z',
      execution: { status: 'preview', reason: '总闸关闭' }
    })
  ],
  intervalMs: 15 * 60 * 1000,
  now: Date.parse('2026-08-20T12:00:00.000Z')
})
assert.equal(previewDoesNotBlock.verdict, 'pass')

assert.equal(lastPassedOpenAt([record({ riskVerdict: 'reject' })], 'XAUUSD.s'), null)
assert.equal(
  lastPassedOpenAt(
    [record({ riskVerdict: 'pass', execution: { status: 'preview', reason: '总闸关闭' } })],
    'XAUUSD.s'
  ),
  null
)

const ok = evaluateRisk(openSell(), snapshot(), {
  records: [],
  intervalMs: 15 * 60 * 1000
})
assert.equal(ok.verdict, 'pass')
assert.equal(ok.sizedVolume, 0.1)

const fixedSmall = sizeOpenVolume({
  equity: 10_000,
  slDistance: 10,
  contractSize: 100,
  volumeMin: 0.01,
  volumeStep: 0.01,
  maxVolume: 0.1,
  preferredVolume: 0.03
})
assert.ok('volume' in fixedSmall)
assert.equal(fixedSmall.volume, 0.03)

const fixedCapped = sizeOpenVolume({
  equity: 10_000,
  slDistance: 10,
  contractSize: 100,
  volumeMin: 0.01,
  volumeStep: 0.01,
  maxVolume: 0.1,
  preferredVolume: 0.5
})
assert.ok('volume' in fixedCapped)
assert.equal(fixedCapped.volume, 0.1)

// 今日开仓达上限后拒绝（记录时间离 now 足够远，避免先被间隔规则拦下）
const NOW = Date.parse('2026-08-20T12:00:00.000Z')
const manySends = Array.from({ length: MAX_OPENS_PER_DAY }, (_, i) =>
  record({
    id: `open-${i}`,
    createdAt: `2026-08-20T0${i}:00:00.000Z`,
    execution: { status: 'sent', reason: '已发单' }
  })
)
assert.equal(sentOpensToday(manySends, 'XAUUSD.s', NOW), MAX_OPENS_PER_DAY)
const capped2 = evaluateRisk(openSell(), snapshot(), {
  records: manySends,
  intervalMs: 15 * 60 * 1000,
  now: NOW
})
assert.equal(capped2.verdict, 'reject')
assert.match(capped2.reason ?? '', /上限/)

// 今日连续亏损达上限后拒绝
const losers = Array.from({ length: MAX_CONSECUTIVE_LOSSES }, (_, i) =>
  record({
    id: `loss-${i}`,
    createdAt: `2026-08-20T0${i}:30:00.000Z`,
    execution: { status: 'sent', reason: '已发单' },
    outcome: {
      status: 'closed',
      positionId: 100 + i,
      closedAt: `2026-08-20T0${i + 1}:00:00.000Z`,
      closePrice: 4480,
      pnl: -10
    }
  })
)
assert.equal(consecutiveLossesToday(losers, NOW), MAX_CONSECUTIVE_LOSSES)
const streak = evaluateRisk(openSell(), snapshot(), {
  records: losers,
  intervalMs: 15 * 60 * 1000,
  now: NOW
})
assert.equal(streak.verdict, 'reject')
assert.match(streak.reason ?? '', /连续亏损/)

// 有盈利单垫底则连亏中断
const mixed = [
  ...losers.slice(0, 2),
  record({
    id: 'win',
    createdAt: '2026-08-20T05:00:00.000Z',
    execution: { status: 'sent', reason: '已发单' },
    outcome: {
      status: 'closed',
      positionId: 999,
      closedAt: '2026-08-20T06:00:00.000Z',
      closePrice: 4500,
      pnl: 8
    }
  })
]
assert.equal(consecutiveLossesToday(mixed, NOW), 0)

// SL 落在点差内（bid 4490 / ask 4490.3 之间）应被拒，否则多单一进场就触发
const slInsideSpread = evaluateRisk(openSell({ action: 'open_buy', sl: 4490.1 }), snapshot(), {
  records: [],
  intervalMs: 15 * 60 * 1000
})
assert.equal(slInsideSpread.verdict, 'reject')
assert.match(slInsideSpread.reason ?? '', /低于买价/)

const hold = evaluateRisk(
  { action: 'hold', symbol: 'XAUUSD.s', confidence: 0.2, reasoning: 'wait', keyFactors: [] },
  snapshot(),
  { records: [], intervalMs: 15 * 60 * 1000 }
)
assert.equal(hold.verdict, 'pass')
assert.equal(hold.sizedVolume, null)

function withPosition(magic: number): DecisionSnapshot {
  return snapshot({
    account: {
      balance: 10_000,
      equity: 10_000,
      marginFree: 10_000,
      profit: 0,
      dailyPnl: 0,
      dailyPnlRealized: 0,
      currency: 'USD',
      tradeMode: 0,
      tradeAllowed: true,
      login: 1,
      server: 'Demo',
      positions: [
        {
          ticket: 88,
          type: 'buy',
          volume: 8,
          priceOpen: 4500,
          profit: 10,
          sl: 4480,
          tp: 0,
          magic
        }
      ]
    }
  })
}

const closeManual = evaluateRisk(
  {
    action: 'close_position',
    symbol: 'XAUUSD.s',
    ticket: 88,
    confidence: 0.8,
    reasoning: 'close',
    keyFactors: []
  },
  withPosition(0),
  { records: [], intervalMs: 15 * 60 * 1000 }
)
assert.equal(closeManual.verdict, 'pass')
assert.equal(closeManual.sizedVolume, 8)

console.log('risk.test.ts ok')
