import { existsSync, readFileSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import type { AgentRecord } from '../../preload/agent-types'
import type { DecisionSnapshot } from '../../preload/snapshot-types'
import { writeCalendarCache, type CalendarCacheRow } from './calendar'
import { upsertDecisions } from './decisions'
import { hasKv, setKv } from './kv'
import { insertPmPrices } from './pm-prices'
import { KV_KEYS } from './schema'
import { upsertSnapshots } from './snapshots'

function userFile(name: string): string {
  return join(app.getPath('userData'), name)
}

function renameMigrated(path: string): void {
  try {
    const dest = `${path}.migrated`
    if (existsSync(dest)) {
      unlinkSync(path)
      return
    }
    renameSync(path, dest)
  } catch (error) {
    console.warn('[db] rename migrated', path, error instanceof Error ? error.message : error)
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (error) {
    console.warn('[db] migrate json', path, error instanceof Error ? error.message : error)
    return null
  }
}

function readJsonl<T>(path: string, pick: (row: unknown) => T | null): T[] {
  const out: T[] = []
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    console.warn('[db] migrate jsonl', path, error instanceof Error ? error.message : error)
    return out
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const picked = pick(JSON.parse(line) as unknown)
      if (picked) out.push(picked)
    } catch {
      console.warn('[db] skip bad jsonl line', path)
    }
  }
  return out
}

function migrateDecisions(path: string): void {
  const rows = readJsonl(path, (row) => {
    const rec = row as AgentRecord
    return rec?.id ? rec : null
  })
  upsertDecisions(rows)
  renameMigrated(path)
  console.log(`[db] migrated ${rows.length} decisions`)
}

function migrateSnapshots(path: string): void {
  const rows = readJsonl(path, (row) => {
    const snapshot = row as DecisionSnapshot
    return snapshot?.meta?.snapshotId ? snapshot : null
  })
  upsertSnapshots(rows)
  renameMigrated(path)
  console.log(`[db] migrated ${rows.length} snapshots`)
}

function migratePmPrices(path: string): void {
  const parsed = readJson<{ points?: Array<{ tokenId?: string; midpoint?: number; ts?: number }> }>(
    path
  )
  const points = (parsed?.points ?? [])
    .filter(
      (p): p is { tokenId: string; midpoint: number; ts: number } =>
        typeof p.tokenId === 'string' && typeof p.midpoint === 'number' && typeof p.ts === 'number'
    )
    .map((p) => ({ tokenId: p.tokenId, midpoint: p.midpoint, ts: p.ts }))
  insertPmPrices(points)
  renameMigrated(path)
  console.log(`[db] migrated ${points.length} pm prices`)
}

function migrateCalendar(path: string): void {
  const parsed = readJson<{ fetchedAt?: number; rows?: CalendarCacheRow[] }>(path)
  if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.fetchedAt !== 'number') {
    console.warn('[db] calendar cache unreadable, skip')
    renameMigrated(path)
    return
  }
  writeCalendarCache(parsed.rows, parsed.fetchedAt)
  renameMigrated(path)
  console.log(`[db] migrated ${parsed.rows.length} calendar events`)
}

function migrateKvFile(path: string, key: string, keepFile = false): void {
  if (hasKv(key)) {
    if (!keepFile) renameMigrated(path)
    return
  }
  const parsed = readJson<unknown>(path)
  if (parsed == null) {
    if (!keepFile) renameMigrated(path)
    return
  }
  setKv(key, parsed)
  if (!keepFile) renameMigrated(path)
  console.log(`[db] migrated kv ${key}`)
}

export function migrateLegacyFiles(): void {
  const jobs: Array<[string, (path: string) => void]> = [
    ['decisions.jsonl', migrateDecisions],
    ['snapshots.jsonl', migrateSnapshots],
    ['pm-prices.json', migratePmPrices],
    ['ff-calendar.json', migrateCalendar],
    ['agent-config.json', (path) => migrateKvFile(path, KV_KEYS.agentConfig)],
    ['news-feeds.json', (path) => migrateKvFile(path, KV_KEYS.newsFeeds, true)],
    ['polymarket-watch.json', (path) => migrateKvFile(path, KV_KEYS.polymarketWatch, true)]
  ]
  for (const [name, job] of jobs) {
    const path = userFile(name)
    if (!existsSync(path)) continue
    try {
      job(path)
    } catch (error) {
      console.warn('[db] migrate failed', name, error instanceof Error ? error.message : error)
    }
  }
}
