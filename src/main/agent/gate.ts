import type { AgentExecution } from '../../preload/agent-types'
import { isTradeSuccess, type AccountMode } from '../../preload/mt5-types'

export function isCheckOk(retcode: number | null): boolean {
  if (retcode == null) return false
  return retcode === 0 || isTradeSuccess(retcode)
}

export type SendGate = {
  send: boolean
  status: AgentExecution['status']
  reason: string
}

export function decideSendGate(input: {
  tradingEnabled: boolean
  accountMode: AccountMode
  checkRetcode: number | null
}): SendGate {
  if (!input.tradingEnabled) {
    return { send: false, status: 'preview', reason: '总闸关闭' }
  }
  if (input.accountMode === 'unknown') {
    return { send: false, status: 'skipped', reason: '账户类型未知，禁止发单' }
  }
  if (!isCheckOk(input.checkRetcode)) {
    return { send: false, status: 'rejected', reason: '经纪商检查未通过' }
  }
  return { send: true, status: 'sent', reason: '准备发单' }
}
