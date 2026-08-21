import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import { hasKv, setKv } from './kv'
import { KV_KEYS } from './schema'

function bundledConfig(name: string): string | null {
  if (app.isPackaged) {
    const extra = join(process.resourcesPath, 'config', name)
    if (existsSync(extra)) return extra
  }
  const fromApp = join(app.getAppPath(), 'resources', 'config', name)
  if (existsSync(fromApp)) return fromApp
  const fromDir = join(__dirname, '../../resources/config', name)
  return existsSync(fromDir) ? fromDir : null
}

function seedFile(name: string, key: string): void {
  if (hasKv(key)) return
  const path = bundledConfig(name)
  if (!path) return
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    setKv(key, parsed)
  } catch (error) {
    console.warn('[db] seed', name, error instanceof Error ? error.message : error)
  }
}

export function seedKvDefaults(): void {
  seedFile('news-feeds.json', KV_KEYS.newsFeeds)
  seedFile('polymarket-watch.json', KV_KEYS.polymarketWatch)
}
