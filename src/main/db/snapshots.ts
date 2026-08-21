import type { DecisionSnapshot } from '../../preload/snapshot-types'
import { getDb } from './connection'

export function upsertSnapshot(snapshot: DecisionSnapshot): void {
  const id = snapshot.meta?.snapshotId
  if (!id) return
  getDb()
    .prepare(
      `INSERT INTO snapshots (id, symbol, created_at, payload_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         symbol = excluded.symbol,
         created_at = excluded.created_at,
         payload_json = excluded.payload_json`
    )
    .run(
      id,
      snapshot.meta.symbol ?? '',
      snapshot.meta.generatedAt ?? new Date().toISOString(),
      JSON.stringify(snapshot)
    )
}

export function upsertSnapshots(snapshots: DecisionSnapshot[]): void {
  if (snapshots.length === 0) return
  const run = getDb().transaction((rows: DecisionSnapshot[]) => {
    for (const snapshot of rows) upsertSnapshot(snapshot)
  })
  run(snapshots)
}

export function getSnapshotById(snapshotId: string): DecisionSnapshot | null {
  if (!snapshotId) return null
  const row = getDb().prepare('SELECT payload_json FROM snapshots WHERE id = ?').get(snapshotId) as
    { payload_json: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.payload_json) as DecisionSnapshot
  } catch {
    return null
  }
}
