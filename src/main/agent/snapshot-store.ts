import type { DecisionSnapshot } from '../../preload/snapshot-types'
import { getSnapshotById, upsertSnapshot } from '../db/snapshots'

const logged = new Set<string>()

/** 每次真实决策把输入快照落库，复盘时按 snapshotId 找回模型当时看到的输入 */
export function appendSnapshotLog(snapshot: DecisionSnapshot): void {
  const id = snapshot.meta.snapshotId
  if (!id || logged.has(id)) return
  logged.add(id)
  try {
    upsertSnapshot(snapshot)
  } catch (error) {
    console.warn('[agent] 快照落盘失败', error instanceof Error ? error.message : error)
  }
}

export function readSnapshotById(snapshotId: string): DecisionSnapshot | null {
  if (!snapshotId) return null
  try {
    return getSnapshotById(snapshotId)
  } catch (error) {
    console.warn('[agent] 读取快照失败', error instanceof Error ? error.message : error)
    return null
  }
}
