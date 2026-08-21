import type { AgentRecord } from '../../preload/agent-types'
import { getDb } from './connection'

/** 内存/UI 只保留最近这些条；库里保留全部历史，供复盘 */
export const DECISION_KEEP = 50

type DecisionRow = {
  payload_json: string
}

function columns(
  record: AgentRecord
): [
  string,
  string,
  string,
  string,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string
] {
  return [
    record.id,
    record.snapshotId,
    record.symbol,
    record.createdAt,
    record.decision?.action ?? null,
    record.promptVersion ?? null,
    record.model ?? null,
    record.riskVerdict ?? null,
    record.skipped ?? null,
    JSON.stringify(record)
  ]
}

export function upsertDecision(record: AgentRecord): void {
  getDb()
    .prepare(
      `INSERT INTO decisions (
        id, snapshot_id, symbol, created_at, action, prompt_version, model, risk_verdict, skipped, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        snapshot_id = excluded.snapshot_id,
        symbol = excluded.symbol,
        created_at = excluded.created_at,
        action = excluded.action,
        prompt_version = excluded.prompt_version,
        model = excluded.model,
        risk_verdict = excluded.risk_verdict,
        skipped = excluded.skipped,
        payload_json = excluded.payload_json`
    )
    .run(...columns(record))
}

export function upsertDecisions(records: AgentRecord[]): void {
  if (records.length === 0) return
  const run = getDb().transaction((rows: AgentRecord[]) => {
    for (const record of rows) upsertDecision(record)
  })
  run(records)
}

function parseRecord(json: string): AgentRecord | null {
  try {
    const row = JSON.parse(json) as AgentRecord
    return row?.id ? row : null
  } catch {
    return null
  }
}

export function loadAllRecords(): AgentRecord[] {
  const rows = getDb()
    .prepare('SELECT payload_json FROM decisions ORDER BY created_at ASC, rowid ASC')
    .all() as DecisionRow[]
  const out: AgentRecord[] = []
  for (const row of rows) {
    const record = parseRecord(row.payload_json)
    if (record) out.push(record)
  }
  return out
}

export function loadRecentRecords(limit = DECISION_KEEP): AgentRecord[] {
  const rows = getDb()
    .prepare('SELECT payload_json FROM decisions ORDER BY created_at DESC, rowid DESC LIMIT ?')
    .all(limit) as DecisionRow[]
  const out: AgentRecord[] = []
  for (const row of rows) {
    const record = parseRecord(row.payload_json)
    if (record) out.push(record)
  }
  return out.reverse()
}
