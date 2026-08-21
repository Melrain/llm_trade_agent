import Database from 'better-sqlite3'

export type AppDatabase = InstanceType<typeof Database>

let db: AppDatabase | null = null

export function setDb(instance: AppDatabase | null): void {
  db = instance
}

export function peekDb(): AppDatabase | null {
  return db
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error('database not open; call openDb() after app.whenReady')
  }
  return db
}

export function closeDb(): void {
  if (!db) return
  try {
    db.close()
  } catch (error) {
    console.warn('[db] close failed', error instanceof Error ? error.message : error)
  }
  db = null
}
