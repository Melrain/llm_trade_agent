import assert from 'node:assert/strict'

import {
  alignPrice,
  alignToStep,
  digitsFromTick,
  formatSz,
  isContractInst,
  normalizeInstId,
  notionalToSize,
  posIdToTicket,
  sanitizeClOrdId
} from './normalize'

assert.equal(normalizeInstId('btc'), 'BTC-USDT-SWAP')
assert.equal(normalizeInstId('BTC-USDT'), 'BTC-USDT-SWAP')
assert.equal(normalizeInstId('eth-usdt-swap'), 'ETH-USDT-SWAP')
assert.equal(normalizeInstId(''), 'BTC-USDT-SWAP')
assert.equal(isContractInst('BTC-USDT-SWAP'), true)
assert.equal(isContractInst('BTC-USDT'), false)
assert.equal(sanitizeClOrdId('llm:trader-okx-v1.0'), 'llmtraderokxv10')
assert.equal(digitsFromTick(0.1), 1)
assert.equal(digitsFromTick(0.01), 2)
assert.equal(alignToStep(1.29, 0.1), 1.2)
assert.equal(alignPrice(95000.14, 0.1), 95000.1)
assert.equal(formatSz(0.0100000000001), '0.01')
assert.equal(posIdToTicket('123456'), 123456)
assert.ok(posIdToTicket('abc') > 0)

const sz = notionalToSize(1000, 100_000, { ctVal: 0.01, lotSz: 0.01, minSz: 0.01 })
assert.equal(sz, 1)

console.log('okx/normalize.test.ts ok')
