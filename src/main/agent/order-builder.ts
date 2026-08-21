import { AGENT_MAGIC, type AgentDecision } from '../../preload/agent-types'
import type { Mt5TradeRequest } from '../../preload/mt5-types'
import {
  fillingFromMode,
  ORDER_TIME_GTC,
  ORDER_TYPE_BUY,
  ORDER_TYPE_SELL,
  TRADE_ACTION_DEAL,
  TRADE_ACTION_SLTP
} from '../../preload/mt5-types'
import type { DecisionSnapshot, SnapshotPosition } from '../../preload/snapshot-types'

export { AGENT_MAGIC }
export const DEVIATION_POINTS = 30
const COMMENT_MAX = 31

export function withFilling(request: Mt5TradeRequest, typeFilling: number): Mt5TradeRequest {
  return { ...request, type_filling: typeFilling }
}

function roundDigits(value: number, digits: number): number {
  const p = 10 ** Math.max(0, Math.round(digits))
  return Math.round(value * p) / p
}

function commentOf(promptVersion: string): string {
  const raw = `llm:${promptVersion}`
  return raw.length <= COMMENT_MAX ? raw : raw.slice(0, COMMENT_MAX)
}

function findPosition(
  snapshot: DecisionSnapshot,
  ticket: number | undefined
): SnapshotPosition | null {
  const rows = snapshot.account?.positions ?? []
  if (ticket == null) return rows.length === 1 ? rows[0] : null
  return rows.find((row) => row.ticket === ticket) ?? null
}

export function buildTradeRequest(
  decision: AgentDecision,
  snapshot: DecisionSnapshot,
  sizedVolume: number | null,
  promptVersion: string
): Mt5TradeRequest | null {
  if (decision.action === 'hold') return null
  const symbol = snapshot.meta.symbol
  const digits = snapshot.constraints.digits ?? 2
  const filling = fillingFromMode(snapshot.constraints.fillingMode ?? undefined)
  const comment = commentOf(promptVersion)
  const bid = snapshot.technical?.price.bid
  const ask = snapshot.technical?.price.ask

  if (decision.action === 'open_buy' || decision.action === 'open_sell') {
    if (sizedVolume == null || sizedVolume <= 0 || bid == null || ask == null) return null
    const buy = decision.action === 'open_buy'
    return {
      action: TRADE_ACTION_DEAL,
      magic: AGENT_MAGIC,
      symbol,
      volume: sizedVolume,
      price: buy ? ask : bid,
      sl: decision.sl != null ? roundDigits(decision.sl, digits) : undefined,
      tp: decision.tp != null ? roundDigits(decision.tp, digits) : undefined,
      deviation: DEVIATION_POINTS,
      type: buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,
      type_filling: filling,
      type_time: ORDER_TIME_GTC,
      comment
    }
  }

  const pos = findPosition(snapshot, decision.ticket)
  if (!pos || bid == null || ask == null) return null

  if (decision.action === 'close_position') {
    const buy = pos.type === 'buy'
    return {
      action: TRADE_ACTION_DEAL,
      magic: AGENT_MAGIC,
      symbol,
      volume: pos.volume,
      price: buy ? bid : ask,
      deviation: DEVIATION_POINTS,
      type: buy ? ORDER_TYPE_SELL : ORDER_TYPE_BUY,
      type_filling: filling,
      type_time: ORDER_TIME_GTC,
      position: pos.ticket,
      comment
    }
  }

  if (decision.action === 'adjust_sltp') {
    return {
      action: TRADE_ACTION_SLTP,
      magic: AGENT_MAGIC,
      symbol,
      sl: decision.sl != null ? roundDigits(decision.sl, digits) : pos.sl,
      tp: decision.tp != null ? roundDigits(decision.tp, digits) : pos.tp,
      position: pos.ticket,
      comment
    }
  }

  return null
}
