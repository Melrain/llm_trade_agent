import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import { getKvJson, setKv } from '../../db/kv'
import { KV_KEYS } from '../../db/schema'
import type { PmHttpConfig } from './client'

export type DiscoverKind = 'monthly_price_hit' | 'next_fed_decision' | 'gold_geopolitics'

const DISCOVER_KINDS: DiscoverKind[] = [
  'monthly_price_hit',
  'next_fed_decision',
  'gold_geopolitics'
]

export type WatchDiscover = {
  kind: DiscoverKind
  queries?: string[]
  slugTemplate?: string
  slugIncludes?: string
  maxEvents?: number
}

export type WatchMarket = {
  id: string
  eventSlug?: string
  discover?: WatchDiscover
  role: string
  primary: boolean
  outcome: string
  titleZh?: string
  notes?: string
}

export type WatchInstrument = {
  symbol: string
  displayName: string
  enabled: boolean
  markets: WatchMarket[]
}

export type PolymarketWatchConfig = {
  version: number
  http: PmHttpConfig
  pollIntervalMs: number
  resolveIntervalMs: number
  /** 本机 MT5 现价刷新间隔 */
  spotIntervalMs: number
  instruments: WatchInstrument[]
}

const DEFAULT_HTTP: PmHttpConfig = {
  gammaBase: 'https://gamma-api.polymarket.com',
  clobBase: 'https://clob.polymarket.com',
  timeoutMs: 20_000,
  retries: 2,
  userAgent: 'LLA-Market-Desktop/0.1'
}

function defaultWatchPath(): string {
  if (app.isPackaged) {
    const extra = join(process.resourcesPath, 'config', 'polymarket-watch.json')
    if (existsSync(extra)) return extra
  }
  const fromApp = join(app.getAppPath(), 'resources', 'config', 'polymarket-watch.json')
  if (existsSync(fromApp)) return fromApp
  return join(__dirname, '../../resources/config/polymarket-watch.json')
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

function asNumber(v: unknown, fallback: number, min: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= min ? n : fallback
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function parseDiscover(raw: unknown): WatchDiscover | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'string') {
    if (!DISCOVER_KINDS.includes(raw as DiscoverKind)) {
      throw new Error(`discover kind 无效: ${raw}`)
    }
    return { kind: raw as DiscoverKind }
  }
  if (typeof raw !== 'object') {
    throw new Error('discover 无效')
  }
  const row = raw as Record<string, unknown>
  const kind = asString(row.kind, '') as DiscoverKind
  if (!DISCOVER_KINDS.includes(kind)) {
    throw new Error(`discover.kind 无效: ${kind}`)
  }
  const queries = Array.isArray(row.queries)
    ? row.queries.filter((q): q is string => typeof q === 'string' && Boolean(q.trim()))
    : undefined
  return {
    kind,
    queries: queries?.length ? queries : undefined,
    slugTemplate:
      typeof row.slugTemplate === 'string' && row.slugTemplate.trim()
        ? row.slugTemplate.trim()
        : undefined,
    slugIncludes:
      typeof row.slugIncludes === 'string' && row.slugIncludes.trim()
        ? row.slugIncludes.trim()
        : undefined,
    maxEvents: asNumber(row.maxEvents, 0, 1) || undefined
  }
}

function parseMarket(raw: unknown, index: number): WatchMarket {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`markets[${index}] 无效`)
  }
  const m = raw as Record<string, unknown>
  const eventSlug = asString(m.eventSlug, '') || undefined
  const discover = parseDiscover(m.discover)
  if (!eventSlug && !discover) {
    throw new Error(`markets[${index}] 需要 eventSlug 或 discover`)
  }
  return {
    id: asString(m.id, `market-${index}`),
    eventSlug,
    discover,
    role: asString(m.role, 'other'),
    primary: asBool(m.primary, index === 0),
    outcome: asString(m.outcome, 'Yes'),
    titleZh: typeof m.titleZh === 'string' && m.titleZh.trim() ? m.titleZh.trim() : undefined,
    notes: typeof m.notes === 'string' ? m.notes : undefined
  }
}

function parseInstrument(raw: unknown, index: number): WatchInstrument {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`instruments[${index}] 无效`)
  }
  const row = raw as Record<string, unknown>
  const symbol = asString(row.symbol, '').toUpperCase()
  if (!symbol) {
    throw new Error(`instruments[${index}].symbol 必填`)
  }
  const markets = Array.isArray(row.markets) ? row.markets.map(parseMarket) : []
  if (markets.length === 0) {
    throw new Error(`instruments[${index}] 至少需要一个 market`)
  }
  return {
    symbol,
    displayName: asString(row.displayName, symbol),
    enabled: asBool(row.enabled, true),
    markets
  }
}

export function parseWatchDocument(raw: unknown): PolymarketWatchConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('watch 配置无效')
  }
  const parsed = raw as Record<string, unknown>
  const httpRaw =
    parsed.http && typeof parsed.http === 'object' ? (parsed.http as Record<string, unknown>) : {}

  return {
    version: asNumber(parsed.version, 1, 1),
    http: {
      gammaBase: asString(httpRaw.gammaBase, DEFAULT_HTTP.gammaBase).replace(/\/$/, ''),
      clobBase: asString(httpRaw.clobBase, DEFAULT_HTTP.clobBase).replace(/\/$/, ''),
      timeoutMs: asNumber(httpRaw.timeoutMs, DEFAULT_HTTP.timeoutMs, 1000),
      retries: asNumber(httpRaw.retries, DEFAULT_HTTP.retries, 0),
      userAgent: asString(httpRaw.userAgent, DEFAULT_HTTP.userAgent)
    },
    pollIntervalMs: asNumber(parsed.pollIntervalMs, 60_000, 10_000),
    resolveIntervalMs: asNumber(parsed.resolveIntervalMs, 86_400_000, 60_000),
    spotIntervalMs: asNumber(parsed.spotIntervalMs, 1_000, 250),
    instruments: Array.isArray(parsed.instruments) ? parsed.instruments.map(parseInstrument) : []
  }
}

function readBundledWatch(): unknown | null {
  const path = defaultWatchPath()
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

export function loadWatchConfig(): PolymarketWatchConfig {
  const fromKv = getKvJson<unknown>(KV_KEYS.polymarketWatch)
  if (fromKv != null) return parseWatchDocument(fromKv)
  const bundled = readBundledWatch()
  if (!bundled) {
    throw new Error(`未找到 Polymarket watch 配置: ${defaultWatchPath()}`)
  }
  const config = parseWatchDocument(bundled)
  try {
    setKv(KV_KEYS.polymarketWatch, bundled)
  } catch {
    /* seed 失败不阻断 */
  }
  return config
}

export function listEnabledInstruments(config: PolymarketWatchConfig): WatchInstrument[] {
  return config.instruments.filter((i) => i.enabled)
}
