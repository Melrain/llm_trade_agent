import type { Mt5Deal } from '../../preload/mt5-types'

/** DEAL_TYPE_BALANCE / CREDIT — 入金出金不计入当日盈亏 */
const SKIP_TYPES = new Set([2, 3])

export function startOfLocalDaySec(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export function sumRealizedPnl(deals: Mt5Deal[]): number {
  let total = 0
  for (const deal of deals) {
    if (SKIP_TYPES.has(deal.type)) continue
    total += (deal.profit ?? 0) + (deal.swap ?? 0) + (deal.commission ?? 0) + (deal.fee ?? 0)
  }
  return total
}
