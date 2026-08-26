import { AGENT_MAGIC, type AgentDecision } from '../../preload/agent-types'
import type { OkxTdMode, OkxTradeIntent } from '../../preload/okx-types'
import type { DecisionSnapshot, SnapshotPosition } from '../../preload/snapshot-types'
import { formatSz, normalizeInstId, sanitizeClOrdId } from './normalize'

function findPosition(
  snapshot: DecisionSnapshot,
  ticket: number | undefined
): SnapshotPosition | null {
  const rows = snapshot.account?.positions ?? []
  if (ticket == null) return rows.length === 1 ? rows[0] : null
  return rows.find((row) => row.ticket === ticket) ?? null
}

export function clOrdIdFor(promptVersion: string, now = Date.now()): string {
  return sanitizeClOrdId(`llm${promptVersion.replace(/[^A-Za-z0-9]/g, '')}${now}`) ?? `llm${now}`
}

export function buildOkxIntent(
  decision: AgentDecision,
  snapshot: DecisionSnapshot,
  sizedVolume: number | null,
  opts: {
    tdMode: OkxTdMode
    leverage: number
    promptVersion: string
  }
): OkxTradeIntent | null {
  if (decision.action === 'hold') return null
  const instId = normalizeInstId(snapshot.meta.symbol)
  const tdMode = opts.tdMode

  if (decision.action === 'open_buy' || decision.action === 'open_sell') {
    if (sizedVolume == null || sizedVolume <= 0) return null
    return {
      kind: 'place',
      instId,
      tdMode,
      side: decision.action === 'open_buy' ? 'buy' : 'sell',
      sz: formatSz(sizedVolume),
      ordType: 'market',
      sl: decision.sl,
      tp: decision.tp,
      clOrdId: clOrdIdFor(opts.promptVersion),
      lever: String(opts.leverage),
      posSide: decision.action === 'open_buy' ? 'long' : 'short'
    }
  }

  const pos = findPosition(snapshot, decision.ticket)
  if (!pos) return null

  if (decision.action === 'close_position') {
    return {
      kind: 'close',
      instId,
      tdMode,
      posSide: pos.type === 'buy' ? 'long' : 'short',
      sz: formatSz(pos.volume)
    }
  }

  if (decision.action === 'adjust_sltp') {
    return {
      kind: 'amend-sltp',
      instId,
      tdMode,
      side: pos.type === 'buy' ? 'sell' : 'buy',
      sz: formatSz(pos.volume),
      sl: decision.sl ?? (pos.sl > 0 ? pos.sl : undefined),
      tp: decision.tp ?? (pos.tp > 0 ? pos.tp : undefined),
      posSide: pos.type === 'buy' ? 'long' : 'short',
      reduceOnly: true
    }
  }

  return null
}

export function okxPositionType(pos: number, posSide: string): 'buy' | 'sell' {
  if (posSide === 'short') return 'sell'
  if (posSide === 'long') return 'buy'
  return pos < 0 ? 'sell' : 'buy'
}

export { AGENT_MAGIC }
