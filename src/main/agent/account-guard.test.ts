import assert from 'node:assert/strict'

import { armAccount, shouldDisarmTrading } from './account-guard'

assert.deepEqual(armAccount(123, 'demo'), { armedLogin: 123, armedMode: 'demo' })
assert.deepEqual(armAccount(456, 'real'), { armedLogin: 456, armedMode: 'real' })
assert.deepEqual(armAccount(123, 'unknown'), { armedLogin: null, armedMode: null })
assert.deepEqual(armAccount(null, 'real'), { armedLogin: null, armedMode: null })

const armedDemo = {
  tradingEnabled: true,
  armedLogin: 123,
  armedMode: 'demo' as const,
  currentLogin: 123,
  currentMode: 'demo' as const
}

assert.equal(shouldDisarmTrading(armedDemo), false)
assert.equal(shouldDisarmTrading({ ...armedDemo, currentMode: 'unknown' }), false)
assert.equal(shouldDisarmTrading({ ...armedDemo, currentMode: 'real' }), true)
assert.equal(shouldDisarmTrading({ ...armedDemo, currentLogin: 999 }), true)
assert.equal(shouldDisarmTrading({ ...armedDemo, tradingEnabled: false, currentMode: 'real' }), false)
assert.equal(
  shouldDisarmTrading({
    tradingEnabled: true,
    armedLogin: null,
    armedMode: null,
    currentLogin: 1,
    currentMode: 'real'
  }),
  true
)

console.log('account-guard.test.ts ok')
