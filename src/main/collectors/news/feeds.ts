import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app, shell } from 'electron'

import { markWriting, unwatchJsonFile, watchJsonFile } from '../../db/file-watch'
import { getKv, getKvJson, setKv } from '../../db/kv'
import { KV_KEYS } from '../../db/schema'
import type { RssFeed } from './rss'

export type NewsFeedInfo = RssFeed & {
  enabled: boolean
}

type FeedsFile = {
  version?: number
  feeds?: unknown[]
}

const DEFAULT_FEEDS: NewsFeedInfo[] = [
  {
    source: 'forexlive',
    sourceZh: '外汇直播',
    url: 'https://www.forexlive.com/feed',
    enabled: true
  },
  {
    source: 'fxstreet',
    sourceZh: '外汇街',
    url: 'https://www.fxstreet.com/rss/news',
    enabled: true
  }
]

const listeners = new Set<() => void>()

function defaultFeedsPath(): string {
  if (app.isPackaged) {
    const extra = join(process.resourcesPath, 'config', 'news-feeds.json')
    if (existsSync(extra)) return extra
  }
  const fromApp = join(app.getAppPath(), 'resources', 'config', 'news-feeds.json')
  if (existsSync(fromApp)) return fromApp
  return join(__dirname, '../../resources/config/news-feeds.json')
}

function userFeedsPath(): string {
  return join(app.getPath('userData'), 'news-feeds.json')
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function parseFeed(raw: unknown, index: number): NewsFeedInfo {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`feeds[${index}] 无效`)
  }
  const row = raw as Record<string, unknown>
  const url = asString(row.url, '')
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`feeds[${index}].url 必须是 http(s)`)
  }
  return {
    source: asString(row.source, `feed-${index}`),
    sourceZh: asString(row.sourceZh, asString(row.source, `源 ${index + 1}`)),
    url,
    enabled: row.enabled !== false
  }
}

export function parseFeedsDocument(raw: unknown): NewsFeedInfo[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('feeds 配置无效')
  }
  const parsed = raw as FeedsFile
  const rows = Array.isArray(parsed.feeds) ? parsed.feeds.map(parseFeed) : []
  if (rows.length === 0) throw new Error('feeds 为空')
  return rows
}

function notifyFeedsChanged(): void {
  for (const listener of listeners) listener()
}

export function onNewsFeedsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readBundledFeeds(): unknown | null {
  const path = defaultFeedsPath()
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

export function loadNewsFeeds(): NewsFeedInfo[] {
  try {
    const fromKv = getKvJson<unknown>(KV_KEYS.newsFeeds)
    if (fromKv != null) return parseFeedsDocument(fromKv)
  } catch (error) {
    console.warn('[news] feeds kv', error instanceof Error ? error.message : error)
    return DEFAULT_FEEDS
  }
  const bundled = readBundledFeeds()
  if (bundled) {
    try {
      const rows = parseFeedsDocument(bundled)
      try {
        setKv(KV_KEYS.newsFeeds, bundled)
      } catch {
        /* seed 失败不阻断 */
      }
      return rows
    } catch (error) {
      console.warn('[news] feeds bundled', error instanceof Error ? error.message : error)
    }
  }
  return DEFAULT_FEEDS
}

export function listEnabledFeeds(): RssFeed[] {
  return loadNewsFeeds()
    .filter((feed) => feed.enabled)
    .map(({ source, sourceZh, url }) => ({ source, sourceZh, url }))
}

function exportFeedsFile(): string {
  const path = userFeedsPath()
  const raw = getKvJson<unknown>(KV_KEYS.newsFeeds) ?? {
    version: 1,
    feeds: loadNewsFeeds()
  }
  mkdirSync(dirname(path), { recursive: true })
  markWriting(path, true)
  try {
    writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`)
  } finally {
    markWriting(path, false)
  }
  return path
}

function importFeedsFile(path: string): void {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    parseFeedsDocument(parsed)
    if (JSON.stringify(parsed) === getKv(KV_KEYS.newsFeeds)) return
    setKv(KV_KEYS.newsFeeds, parsed)
    notifyFeedsChanged()
  } catch (error) {
    console.warn('[news] feeds reimport', error instanceof Error ? error.message : error)
  }
}

export async function openNewsFeedsConfig(): Promise<string> {
  const path = exportFeedsFile()
  watchJsonFile(path, importFeedsFile)
  const err = await shell.openPath(path)
  if (err) throw new Error(err)
  return path
}

export function stopNewsFeedsWatch(): void {
  unwatchJsonFile(userFeedsPath())
}
