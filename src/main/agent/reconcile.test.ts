import assert from 'node:assert/strict'

import type { AgentRecord } from '../../preload/agent-types'
import type { Mt5Deal } from '../../preload/mt5-types'
import { reconcileOutcomes } from './reconcile'

function deal(over: Partial<Mt5Deal>): Mt5Deal {
  return {
    ticket: 0,
    order: 0,
    time: 1_760_000_000,
    type: 1,
    entry: 0,
    magic: 260820,
    position_id: 500,
    volume: 0.1,
    price: 4490,
    commission: 0,
    swap: 0,
    profit: 0,
    fee: 0,
    symbol: 'XAUUSD.s',
    comment: '',
    ...over
  }
}

function sentOpen(over: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'r1',
    snapshotId: 's1',
    symbol: 'XAUUSD.s',
    createdAt: '2026-08-20T10:00:00.000Z',
    promptVersion: 'trader-v1.3',
    model: 'test',
    decision: {
      action: 'open_sell',
      symbol: 'XAUUSD.s',
      confidence: 0.7,
      sl: 4500,
      reasoning: 't',
      keyFactors: []
    },
    parseError: null,
    riskVerdict: 'pass',
    riskReason: null,
    tokens: null,
    skipped: null,
    send: { retcode: 10009, deal: 100, order: 200, volume: 0.1, price: 4490, comment: '' },
    execution: { status: 'sent', reason: '已成交' },
    ...over
  }
}

// 已平仓：entry + out，盈亏为全部 deal 的 profit+swap+commission+fee 之和
const closedDeals = [
  deal({ ticket: 100, order: 200, entry: 0, price: 4490 }),
  deal({
    ticket: 101,
    order: 201,
    entry: 1,
    price: 4480,
    time: 1_760_003_600,
    profit: -5.2,
    swap: -0.1,
    commission: -0.4
  })
]
const closed = reconcileOutcomes([sentOpen()], closedDeals)
assert.equal(closed.length, 1)
assert.equal(closed[0].outcome?.status, 'closed')
assert.equal(closed[0].outcome?.pnl, -5.7)
assert.equal(closed[0].outcome?.closePrice, 4480)
assert.equal(closed[0].outcome?.positionId, 500)

// 仅有开仓 deal → 持仓中
const openOnly = reconcileOutcomes([sentOpen()], [deal({ ticket: 100, order: 200, entry: 0 })])
assert.equal(openOnly.length, 1)
assert.equal(openOnly[0].outcome?.status, 'open')
assert.equal(openOnly[0].outcome?.pnl, null)

// 已回写且时间合理的 closed 记录不再更新
const already = sentOpen({
  outcome: {
    status: 'closed',
    positionId: 500,
    closedAt: new Date(1_760_003_600 * 1000).toISOString(),
    closePrice: 4480,
    pnl: -5.7
  }
})
assert.equal(reconcileOutcomes([already], closedDeals).length, 0)

// bridge 输出毫秒成交时间
const closedDealsMs = closedDeals.map((d) => ({ ...d, time: d.time * 1000 }))
const fromMs = reconcileOutcomes([sentOpen()], closedDealsMs)
assert.equal(fromMs[0].outcome?.closedAt, new Date(1_760_003_600 * 1000).toISOString())

// 误把毫秒再 *1000 的旧 closedAt 会重写
const bogus = sentOpen({
  outcome: {
    status: 'closed',
    positionId: 500,
    closedAt: new Date(1_760_003_600 * 1_000_000).toISOString(),
    closePrice: 4480,
    pnl: -5.7
  }
})
const repaired = reconcileOutcomes([bogus], closedDealsMs)
assert.equal(repaired.length, 1)
assert.equal(repaired[0].outcome?.closedAt, new Date(1_760_003_600 * 1000).toISOString())

// send.deal 缺失时按 order 匹配
const byOrder = reconcileOutcomes(
  [
    sentOpen({
      send: { retcode: 10009, deal: null, order: 200, volume: 0.1, price: 4490, comment: '' }
    })
  ],
  closedDeals
)
assert.equal(byOrder.length, 1)
assert.equal(byOrder[0].outcome?.status, 'closed')

// 未发单的记录不参与对账
const preview = sentOpen({ execution: { status: 'preview', reason: '总闸关闭' }, send: null })
assert.equal(reconcileOutcomes([preview], closedDeals).length, 0)

console.log('reconcile.test.ts ok')
