import { isTradeSuccess } from '../../../preload/mt5-types'
import type { AgentRecord } from '../../../preload/agent-types'

export type RecordKind = 'sent' | 'reject' | 'hold' | 'skipped' | 'parseError' | 'preview'

export function recordKind(row: AgentRecord): RecordKind {
  if (row.parseError) return 'parseError'
  if (row.skipped) return 'skipped'
  if (row.riskVerdict === 'reject') return 'reject'
  if (row.execution?.status === 'rejected') return 'reject'
  if (row.send && isTradeSuccess(row.send.retcode)) return 'sent'
  if (row.execution?.status === 'sent') return 'sent'
  if (row.decision?.action === 'hold') return 'hold'
  if (row.execution?.status === 'skipped') return 'skipped'
  return 'preview'
}

export function kindIcon(kind: RecordKind): string {
  if (kind === 'sent') return '✅'
  if (kind === 'reject') return '⛔'
  if (kind === 'hold') return '⏸'
  if (kind === 'skipped') return '⏭'
  if (kind === 'parseError') return '⚠️'
  return '·'
}

export function kindLabel(kind: RecordKind): string {
  if (kind === 'sent') return '已成交'
  if (kind === 'reject') return '风控拒绝'
  if (kind === 'hold') return '观望'
  if (kind === 'skipped') return '跳过'
  if (kind === 'parseError') return '解析失败'
  return '预览'
}

export type TimelineFilter = 'all' | 'open' | 'hold' | 'reject'

export function matchesFilter(row: AgentRecord, filter: TimelineFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'open') {
    return row.decision?.action === 'open_buy' || row.decision?.action === 'open_sell'
  }
  if (filter === 'hold') return row.decision.action === 'hold'
  return recordKind(row) === 'reject'
}

export function isToday(iso: string, now = new Date()): boolean {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}
