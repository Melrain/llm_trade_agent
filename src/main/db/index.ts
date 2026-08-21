import { mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

import { peekDb, setDb, closeDb as closeConnection, type AppDatabase } from './connection'
import { unwatchAllJsonFiles } from './file-watch'
import { migrateLegacyFiles } from './migrate-files'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'
import { seedKvDefaults } from './seed'

export { getDb } from './connection'
export type { AppDatabase }

export function dbPath(): string {
  return join(app.getPath('userData'), 'llm_trade_agent.db')
}

export function openDb(): AppDatabase {
  const existing = peekDb()
  if (existing) return existing
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const instance = new Database(dbPath())
  instance.pragma('journal_mode = WAL')
  instance.pragma('busy_timeout = 5000')
  instance.pragma('foreign_keys = ON')
  applySchema(instance)
  setDb(instance)
  migrateLegacyFiles()
  seedKvDefaults()
  return instance
}

function applySchema(instance: AppDatabase): void {
  const current = Number(instance.pragma('user_version', { simple: true }))
  instance.exec(SCHEMA_SQL)
  if (current < SCHEMA_VERSION) {
    instance.pragma(`user_version = ${SCHEMA_VERSION}`)
  }
}

export function closeDb(): void {
  unwatchAllJsonFiles()
  closeConnection()
}
