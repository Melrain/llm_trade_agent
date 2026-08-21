import { getDb } from './connection'

const RETAIN_MS = 48 * 60 * 60 * 1000
const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000

export type PricePoint = {
  tokenId: string
  midpoint: number
  ts: number
}

export function insertPmPrice(tokenId: string, midpoint: number, ts = Date.now()): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO pm_prices (token_id, ts, midpoint) VALUES (?, ?, ?)').run(
    tokenId,
    ts,
    midpoint
  )
  db.prepare('DELETE FROM pm_prices WHERE ts < ?').run(ts - RETAIN_MS)
}

export function insertPmPrices(points: PricePoint[]): void {
  if (points.length === 0) return
  const run = getDb().transaction((rows: PricePoint[]) => {
    const stmt = getDb().prepare(
      'INSERT OR REPLACE INTO pm_prices (token_id, ts, midpoint) VALUES (?, ?, ?)'
    )
    for (const point of rows) {
      stmt.run(point.tokenId, point.ts, point.midpoint)
    }
    getDb()
      .prepare('DELETE FROM pm_prices WHERE ts < ?')
      .run(Date.now() - RETAIN_MS)
  })
  run(points)
}

export function pmChange24h(tokenId: string, current: number, now = Date.now()): number | null {
  const target = now - 24 * 60 * 60 * 1000
  const row = getDb()
    .prepare(
      `SELECT midpoint, ts FROM pm_prices
       WHERE token_id = ?
       ORDER BY ABS(ts - ?) ASC
       LIMIT 1`
    )
    .get(tokenId, target) as { midpoint: number; ts: number } | undefined
  if (!row || Math.abs(row.ts - target) > MATCH_WINDOW_MS) return null
  return current - row.midpoint
}
