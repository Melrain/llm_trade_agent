import assert from 'node:assert/strict'

import { clampDigits, formatFunding, formatSpread } from './format'
import {
  PRICE_STALE_MS,
  assetShortName,
  feedStatusHint,
  venueFeedStatus,
  volumeLabel,
  volumeUnit
} from './venue-ui'

assert.equal(venueFeedStatus(true, 'OKX 401', Date.now(), Date.now()), 'error')
assert.equal(venueFeedStatus(false, null, null, Date.now()), 'idle')
assert.equal(venueFeedStatus(true, null, Date.now() - 12_000, Date.now()), 'ok')
assert.equal(venueFeedStatus(true, null, Date.now() - (PRICE_STALE_MS + 1), Date.now()), 'degraded')
assert.equal(venueFeedStatus(true, null, null, Date.now()), 'ok')

assert.equal(assetShortName('BTC-USDT-SWAP'), 'BTC')
assert.equal(assetShortName('ETHUSD'), 'ETH')
assert.equal(assetShortName('btc'), 'BTC')
assert.equal(assetShortName(''), '—')

assert.equal(volumeUnit('okx'), '张')
assert.equal(volumeUnit('mt5'), '手')
assert.equal(volumeLabel('okx'), '张数')
assert.equal(feedStatusHint('degraded', null), '行情超过 5 分钟未更新')

assert.equal(clampDigits(1.8), 2)
assert.equal(formatFunding(0.0001), '0.0001')
assert.equal(formatFunding(0), '0')
assert.equal(formatSpread(0.1, 1), '0.1')
assert.equal(formatSpread(0.0008, 2), '0.0008')

console.log('venue-ui.test.ts ok')
