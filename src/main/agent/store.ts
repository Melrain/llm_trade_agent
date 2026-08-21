import type { AgentRecord } from '../../preload/agent-types'
import {
  DECISION_KEEP,
  loadAllRecords as loadAllFromDb,
  loadRecentRecords,
  upsertDecision
} from '../db/decisions'

export function loadAllRecords(): AgentRecord[] {
  try {
    return loadAllFromDb()
  } catch (error) {
    console.warn('[agent] 读取决策失败', error instanceof Error ? error.message : error)
    return []
  }
}

export function loadRecords(): AgentRecord[] {
  try {
    return loadRecentRecords(DECISION_KEEP)
  } catch (error) {
    console.warn('[agent] 读取决策失败', error instanceof Error ? error.message : error)
    return []
  }
}

export function appendRecord(record: AgentRecord, current: AgentRecord[]): AgentRecord[] {
  try {
    upsertDecision(record)
  } catch (error) {
    console.warn('[agent] 决策落盘失败', error instanceof Error ? error.message : error)
  }
  return [...current, record].slice(-DECISION_KEEP)
}

export function updateStoredRecords(updates: Map<string, AgentRecord>): void {
  if (updates.size === 0) return
  try {
    for (const record of updates.values()) upsertDecision(record)
  } catch (error) {
    console.warn('[agent] 对账回写失败', error instanceof Error ? error.message : error)
  }
}
