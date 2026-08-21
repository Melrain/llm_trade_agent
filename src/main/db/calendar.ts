import { getDb } from './connection'

export type CalendarCacheRow = {
  title?: string
  country?: string
  date?: string
  impact?: string
  forecast?: string
  previous?: string
  actual?: string
}

export type CalendarCache = {
  fetchedAt: number
  rows: CalendarCacheRow[]
}

export function readCalendarCache(): CalendarCache | null {
  const rows = getDb()
    .prepare('SELECT when_at, fetched_at, payload_json FROM calendar_events')
    .all() as { when_at: string | null; fetched_at: number | null; payload_json: string }[]
  if (rows.length === 0) return null
  const fetchedAt = rows[0]?.fetched_at
  if (typeof fetchedAt !== 'number') return null
  const parsed: CalendarCacheRow[] = []
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row.payload_json) as CalendarCacheRow)
    } catch {
      /* skip */
    }
  }
  return { fetchedAt, rows: parsed }
}

export function writeCalendarCache(rows: CalendarCacheRow[], fetchedAt = Date.now()): void {
  const db = getDb()
  const run = db.transaction(() => {
    db.prepare('DELETE FROM calendar_events').run()
    const stmt = db.prepare(
      'INSERT INTO calendar_events (id, when_at, fetched_at, payload_json) VALUES (?, ?, ?, ?)'
    )
    rows.forEach((row, index) => {
      const id = `${row.date ?? ''}|${row.title ?? ''}|${row.country ?? ''}|${index}`
      stmt.run(id, row.date ?? null, fetchedAt, JSON.stringify(row))
    })
  })
  run()
}
