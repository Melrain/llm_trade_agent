import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import { getKvJson, setKv } from '../../db/kv'
import { KV_KEYS } from '../../db/schema'
import type { RssFeed } from './rss'

export type NewsFeedInfo = RssFeed & {
  enabled: boolean
}

type FeedsFile = {
  version?: number
  feeds?: unknown[]
}

const CRYPTO_FEEDS: NewsFeedInfo[] = [
  {
    source: 'coindesk',
    sourceZh: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    enabled: true
  },
  {
    source: 'cointelegraph',
    sourceZh: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    enabled: true
  }
]

const DEFAULT_FEEDS: NewsFeedInfo[] = [
  ...CRYPTO_FEEDS,
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

function defaultFeedsPath(): string {
  if (app.isPackaged) {
    const extra = join(process.resourcesPath, 'config', 'news-feeds.json')
    if (existsSync(extra)) return extra
  }
  const fromApp = join(app.getAppPath(), 'resources', 'config', 'news-feeds.json')
  if (existsSync(fromApp)) return fromApp
  return join(__dirname, '../../resources/config/news-feeds.json')
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

function readBundledFeeds(): unknown | null {
  const path = defaultFeedsPath()
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

function mergeCryptoFeeds(rows: NewsFeedInfo[]): { rows: NewsFeedInfo[]; changed: boolean } {
  const have = new Set(rows.map((row) => row.source))
  const extra = CRYPTO_FEEDS.filter((row) => !have.has(row.source))
  return extra.length ? { rows: [...extra, ...rows], changed: true } : { rows, changed: false }
}

export function loadNewsFeeds(): NewsFeedInfo[] {
  try {
    const fromKv = getKvJson<unknown>(KV_KEYS.newsFeeds)
    if (fromKv != null) {
      const merged = mergeCryptoFeeds(parseFeedsDocument(fromKv))
      if (merged.changed) {
        try {
          setKv(KV_KEYS.newsFeeds, { version: 2, feeds: merged.rows })
        } catch {
          /* ignore */
        }
      }
      return merged.rows
    }
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
