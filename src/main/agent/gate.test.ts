import assert from 'node:assert/strict'

import { decideSendGate } from './gate'

assert.deepEqual(decideSendGate({ tradingEnabled: false, accountMode: 'demo', checkRetcode: 0 }), {
  send: false,
  status: 'preview',
  reason: '总闸关闭'
})

assert.deepEqual(decideSendGate({ tradingEnabled: true, accountMode: 'real', checkRetcode: 0 }), {
  send: false,
  status: 'skipped',
  reason: '实盘禁止发单'
})

assert.deepEqual(
  decideSendGate({ tradingEnabled: true, accountMode: 'unknown', checkRetcode: 0 }),
  {
    send: false,
    status: 'skipped',
    reason: '账户类型未知，禁止发单'
  }
)

assert.deepEqual(
  decideSendGate({ tradingEnabled: true, accountMode: 'demo', checkRetcode: 10016 }),
  {
    send: false,
    status: 'rejected',
    reason: '经纪商检查未通过'
  }
)

assert.deepEqual(decideSendGate({ tradingEnabled: true, accountMode: 'demo', checkRetcode: 0 }), {
  send: true,
  status: 'sent',
  reason: '准备发单'
})

assert.deepEqual(
  decideSendGate({ tradingEnabled: true, accountMode: 'demo', checkRetcode: 10009 }),
  {
    send: true,
    status: 'sent',
    reason: '准备发单'
  }
)

console.log('gate.test.ts ok')
