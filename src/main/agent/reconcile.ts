import type { AgentOutcome, AgentRecord } from '../../preload/agent-types'
import {
  DEAL_ENTRY_IN,
  DEAL_ENTRY_OUT,
  DEAL_ENTRY_OUT_BY,
  type Mt5Deal
} from '../../preload/mt5-types'

/** 找出已发单开仓记录里可以回写结果的，返回更新后的记录副本 */
export function reconcileOutcomes(records: AgentRecord[], deals: Mt5Deal[]): AgentRecord[] {
  if (deals.length === 0) return []

  const byTicket = new Map<number, Mt5Deal>()
  const byOrder = new Map<number, Mt5Deal>()
  const byPosition = new Map<number, Mt5Deal[]>()
  for (const deal of deals) {
    byTicket.set(deal.ticket, deal)
    if (deal.order) byOrder.set(deal.order, deal)
    const rows = byPosition.get(deal.position_id)
    if (rows) rows.push(deal)
    else byPosition.set(deal.position_id, [deal])
  }

  const updated: AgentRecord[] = []
  for (const record of records) {
    if (record.execution?.status !== 'sent') continue
    const { action } = record.decision
    if (action !== 'open_buy' && action !== 'open_sell') continue
    if (record.outcome?.status === 'closed') continue

    const entryDeal =
      (record.send?.deal != null ? byTicket.get(record.send.deal) : undefined) ??
      (record.send?.order != null ? byOrder.get(record.send.order) : undefined)
    if (!entryDeal) continue

    const posDeals = (byPosition.get(entryDeal.position_id) ?? [])
      .slice()
      .sort((a, b) => a.time - b.time)
    const volIn = posDeals
      .filter((d) => d.entry === DEAL_ENTRY_IN)
      .reduce((sum, d) => sum + d.volume, 0)
    const outs = posDeals.filter((d) => d.entry === DEAL_ENTRY_OUT || d.entry === DEAL_ENTRY_OUT_BY)
    const volOut = outs.reduce((sum, d) => sum + d.volume, 0)
    const closed = volIn > 0 && volOut >= volIn - 1e-9
    const lastOut = outs.length > 0 ? outs[outs.length - 1] : null
    const pnl = posDeals.reduce(
      (sum, d) => sum + (d.profit ?? 0) + (d.swap ?? 0) + (d.commission ?? 0) + (d.fee ?? 0),
      0
    )

    const outcome: AgentOutcome = {
      status: closed ? 'closed' : 'open',
      positionId: entryDeal.position_id,
      closedAt: closed && lastOut ? new Date(lastOut.time * 1000).toISOString() : null,
      closePrice: closed && lastOut ? lastOut.price : null,
      pnl: closed ? Math.round(pnl * 100) / 100 : null
    }

    const prev = record.outcome
    if (
      !prev ||
      prev.status !== outcome.status ||
      prev.pnl !== outcome.pnl ||
      prev.positionId !== outcome.positionId
    ) {
      updated.push({ ...record, outcome })
    }
  }
  return updated
}
