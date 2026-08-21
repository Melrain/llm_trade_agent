import type { NewsHeadline } from '../../preload/news-types'
import { getDb } from './connection'

const RETAIN_MS = 7 * 24 * 60 * 60 * 1000

export function upsertNews(items: NewsHeadline[]): void {
  if (items.length === 0) return
  const db = getDb()
  const run = db.transaction((rows: NewsHeadline[]) => {
    const stmt = db.prepare(
      `INSERT INTO news (id, source, url, published_at, payload_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source = excluded.source,
         url = excluded.url,
         published_at = excluded.published_at,
         payload_json = excluded.payload_json`
    )
    for (const item of rows) {
      if (!item.id) continue
      stmt.run(
        item.id,
        item.source ?? null,
        item.url ?? null,
        item.publishedAt ?? null,
        JSON.stringify(item)
      )
    }
    const cutoff = new Date(Date.now() - RETAIN_MS).toISOString()
    db.prepare('DELETE FROM news WHERE published_at IS NOT NULL AND published_at < ?').run(cutoff)
  })
  run(items)
}

export function loadRecentNews(limit = 80): NewsHeadline[] {
  const rows = getDb()
    .prepare('SELECT payload_json FROM news ORDER BY published_at DESC, rowid DESC LIMIT ?')
    .all(limit) as { payload_json: string }[]
  const out: NewsHeadline[] = []
  for (const row of rows) {
    try {
      const item = JSON.parse(row.payload_json) as NewsHeadline
      if (item?.id) out.push(item)
    } catch {
      /* skip */
    }
  }
  return out
}
