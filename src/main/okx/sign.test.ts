import assert from 'node:assert/strict'

import { buildOkxHeaders, okxPrehash, signOkxRequest } from './sign'

const timestamp = '2020-12-08T09:08:57.715Z'
const prehash = okxPrehash(timestamp, 'GET', '/api/v5/account/balance')
assert.equal(prehash, '2020-12-08T09:08:57.715ZGET/api/v5/account/balance')

const sign = signOkxRequest('secret', prehash)
assert.equal(typeof sign, 'string')
assert.equal(sign, signOkxRequest('secret', prehash))
assert.notEqual(sign, signOkxRequest('other', prehash))

const headers = buildOkxHeaders({
  apiKey: 'key',
  secret: 'secret',
  passphrase: 'pass',
  timestamp,
  method: 'POST',
  requestPath: '/api/v5/trade/order',
  body: '{"instId":"BTC-USDT-SWAP"}',
  demo: true
})
assert.equal(headers['OK-ACCESS-KEY'], 'key')
assert.equal(headers['OK-ACCESS-PASSPHRASE'], 'pass')
assert.equal(headers['x-simulated-trading'], '1')
assert.ok(headers['OK-ACCESS-SIGN'])

console.log('okx/sign.test.ts ok')
