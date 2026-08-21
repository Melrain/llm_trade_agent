import { getDb } from './connection'

export function getKv(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as
    { value: string } | undefined
  return row?.value ?? null
}

export function getKvJson<T>(key: string): T | null {
  const raw = getKv(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    console.warn('[db] kv json', key, error instanceof Error ? error.message : error)
    return null
  }
}

export function setKv(key: string, value: unknown): void {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  getDb()
    .prepare(
      'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    )
    .run(key, text, Date.now())
}

export function hasKv(key: string): boolean {
  const row = getDb().prepare('SELECT 1 AS ok FROM kv WHERE key = ?').get(key) as
    { ok: number } | undefined
  return Boolean(row)
}
