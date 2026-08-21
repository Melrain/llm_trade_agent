import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import type { Mt5Deal } from '../../preload/mt5-types'
import type { DecisionSnapshot } from '../../preload/snapshot-types'
import type { MarketCollector } from '../collectors/market'
import type { NewsCollector } from '../collectors/news'
import type { PolymarketCollector } from '../collectors/polymarket'
import type { Mt5Client } from '../mt5/client'
import { getPublicConfig } from '../agent/config'
import { buildDecisionSnapshot } from './builder'
import { startOfLocalDaySec, sumRealizedPnl } from './daily-pnl'

type Listener = (snapshot: DecisionSnapshot) => void

const PNL_TTL_MS = 30_000

function emptySnapshot(): DecisionSnapshot {
  return buildDecisionSnapshot({
    market: {
      symbol: 'XAUUSD',
      asOf: null,
      ready: false,
      lastError: null,
      priceChangedAt: null,
      price: null,
      swap: null,
      specs: null,
      timeframes: { M15: null, H1: null, H4: null, D1: null },
      levels: [],
      account: null,
      positions: []
    },
    pm: {
      symbol: 'XAUUSD',
      displayName: '黄金',
      quotes: [],
      health: {
        status: 'idle',
        lastSuccessAt: null,
        lastError: null,
        consecutiveFailures: 0,
        pollIntervalMs: 60_000
      }
    },
    news: { asOf: null, lastError: null, headlines: [], calendar: [] },
    dailyPnlRealized: null
  })
}

export class SnapshotService {
  private snapshot: DecisionSnapshot = emptySnapshot()
  private readonly listeners = new Set<Listener>()
  private readonly unsub: Array<() => void> = []
  private debounce: NodeJS.Timeout | null = null
  private tail: Promise<void> = Promise.resolve()
  private started = false
  private lastPersistAt = 0
  private pnlCache: { at: number; value: number | null } = { at: 0, value: null }

  constructor(
    private readonly market: MarketCollector,
    private readonly pm: PolymarketCollector,
    private readonly news: NewsCollector,
    private readonly mt5: Mt5Client
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.unsub.push(this.market.onUpdated(() => this.schedule()))
    this.unsub.push(this.pm.onUpdated(() => this.schedule()))
    this.unsub.push(this.news.onUpdated(() => this.schedule()))
    void this.rebuild()
  }

  stop(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
    for (const off of this.unsub) off()
    this.unsub.length = 0
    this.started = false
  }

  getSnapshot(): DecisionSnapshot {
    return this.snapshot
  }

  async refresh(): Promise<DecisionSnapshot> {
    this.pnlCache = { at: 0, value: null }
    await this.market.refresh()
    await this.rebuild()
    this.persist(true)
    return this.snapshot
  }

  /** 只用现有采集器数据重建（例如风控配置变了），不重新拉行情 */
  async rebuildFromCache(): Promise<DecisionSnapshot> {
    await this.rebuild()
    return this.snapshot
  }

  onUpdated(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private schedule(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      void this.rebuild()
    }, 400)
  }

  private rebuild(): Promise<void> {
    const run = this.tail.then(
      () => this.buildOnce(),
      () => this.buildOnce()
    )
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async buildOnce(): Promise<void> {
    try {
      const realized = await this.realizedPnl()
      const risk = getPublicConfig()
      this.snapshot = buildDecisionSnapshot({
        market: this.market.getSnapshot(),
        pm: this.pm.getSnapshot('XAUUSD'),
        news: this.news.getSnapshot(),
        dailyPnlRealized: realized,
        maxVolume: risk.maxVolume,
        riskPct: risk.riskPct,
        fixedVolume: risk.fixedVolume
      })
      this.persist(false)
      this.emit()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[snapshot] rebuild failed', message)
    }
  }

  private async realizedPnl(): Promise<number | null> {
    const now = Date.now()
    if (now - this.pnlCache.at < PNL_TTL_MS) return this.pnlCache.value
    try {
      const fromSec = startOfLocalDaySec(now)
      const toSec = Math.floor(now / 1000)
      const deals = (await this.mt5.request('history_deals_get', {
        date_from: fromSec,
        date_to: toSec
      })) as Mt5Deal[]
      const value = sumRealizedPnl(Array.isArray(deals) ? deals : [])
      this.pnlCache = { at: now, value }
      return value
    } catch {
      this.pnlCache = { at: now, value: this.pnlCache.value }
      return this.pnlCache.value
    }
  }

  private persist(force: boolean): void {
    const now = Date.now()
    if (!force && now - this.lastPersistAt < 10_000) return
    this.lastPersistAt = now
    try {
      writeFileSync(
        join(app.getPath('userData'), 'decision-snapshot.json'),
        JSON.stringify(this.snapshot)
      )
    } catch {
      /* ignore disk errors */
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}
