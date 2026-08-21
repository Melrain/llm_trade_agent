import type { AccountMode } from '../../preload/mt5-types'

export type ArmedAccount = {
  armedLogin: number | null
  armedMode: 'demo' | 'real' | null
}

/** 只有账户类型和登录号都明确时才能锁定总闸 */
export function armAccount(login: number | null | undefined, mode: AccountMode): ArmedAccount {
  if (mode !== 'demo' && mode !== 'real') {
    return { armedLogin: null, armedMode: null }
  }
  if (login == null || !Number.isFinite(login)) {
    return { armedLogin: null, armedMode: null }
  }
  return { armedLogin: login, armedMode: mode }
}

/** 账户从 Demo 切到实盘、换登录号、或开闸时身份不明，都应关掉总闸 */
export function shouldDisarmTrading(input: {
  tradingEnabled: boolean
  armedLogin: number | null
  armedMode: 'demo' | 'real' | null
  currentLogin: number | null
  currentMode: AccountMode
}): boolean {
  if (!input.tradingEnabled) return false
  if (input.currentMode === 'unknown') return false
  if (input.armedMode == null || input.armedLogin == null) return true
  if (input.currentMode !== input.armedMode) return true
  if (input.currentLogin != null && input.currentLogin !== input.armedLogin) return true
  return false
}
