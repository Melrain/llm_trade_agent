import type { PmHealth, PmQuote, PmSnapshot, PmSpotPrice } from '../../../preload/pm-types'
import type { Mt5Client } from '../../mt5/client'
import { fetchMidpoint, fetchMidpoints, lookupMid } from './client'
import {
  listEnabledInstruments,
  loadWatchConfig,
  onWatchConfigChanged,
  stopWatchConfigWatch,
  type PolymarketWatchConfig,
  type WatchInstrument
} from './config'
import { resolvedToQuote, resolveWatchEvent, type PricedLeg, type ResolvedEvent } from './resolve'
import { fetchGoldSpotFromMt5, SPOT_STORE_ID } from './spot-mt5'
import { selectProb } from './quotes'
import { PmPriceStore } from './store'

type Listener = (snapshot: PmSnapshot) => void

const EMPTY_HEALTH: PmHealth = {
  status: 'idle',
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailures: 0,
  pollIntervalMs: 60_000
}

export class PolymarketCollector {
  private config: PolymarketWatchConfig | null = null
  private resolved: ResolvedEvent[] = []
  private quotes: PmQuote[] = []
  private health: PmHealth = { ...EMPTY_HEALTH }
  private readonly store = new PmPriceStore()
  private readonly listeners = new Set<Listener>()
  private pollTimer: NodeJS.Timeout | null = null
  private resolveTimer: NodeJS.Timeout | null = null
  private spotTimer: NodeJS.Timeout | null = null
  private tail: Promise<void> = Promise.resolve()
  private started = false
  private goldMt5Symbol: string | null = null
  private spot: PmSpotPrice | null = null
  private spotBusy = false
  private lastSpotPersistAt = 0
  private unsubWatch: (() => void) | null = null

  constructor(private readonly mt5?: Mt5Client) {}

  start(): void {
    if (this.started) return
    this.started = true
    try {
      this.config = loadWatchConfig()
      this.health.pollIntervalMs = this.config.pollIntervalMs
      console.log(
        '[pm] watch loaded',
        listEnabledInstruments(this.config)
          .map((i) => `${i.symbol}:${i.markets.length}`)
          .join(', ') || '(none)'
      )
    } catch (error) {
      this.fail(error)
      return
    }

    this.store.load()
    this.unsubWatch = onWatchConfigChanged(() => {
      void this.refresh()
    })
    this.armTimers()
    void this.cycle(true)
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.resolveTimer) clearInterval(this.resolveTimer)
    if (this.spotTimer) clearInterval(this.spotTimer)
    this.pollTimer = null
    this.resolveTimer = null
    this.spotTimer = null
    this.unsubWatch?.()
    this.unsubWatch = null
    stopWatchConfigWatch()
    this.started = false
  }

  onUpdated(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(symbol = 'XAUUSD'): PmSnapshot {
    const instrument = this.findInstrument(symbol)
    return {
      symbol: instrument?.symbol ?? symbol.toUpperCase(),
      displayName: instrument?.displayName ?? symbol.toUpperCase(),
      quotes: this.quotes.filter((q) => q.symbol === (instrument?.symbol ?? symbol.toUpperCase())),
      health: this.health
    }
  }

  async refresh(symbol = 'XAUUSD'): Promise<PmSnapshot> {
    try {
      this.config = loadWatchConfig()
      this.health.pollIntervalMs = this.config.pollIntervalMs
    } catch (error) {
      this.fail(error)
      return this.getSnapshot(symbol)
    }
    this.armTimers()
    await this.cycle(true)
    return this.getSnapshot(symbol)
  }

  private armTimers(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.resolveTimer) clearInterval(this.resolveTimer)
    this.pollTimer = null
    this.resolveTimer = null
    if (!this.config) return
    this.pollTimer = setInterval(() => {
      void this.cycle(false)
    }, this.config.pollIntervalMs)
    this.resolveTimer = setInterval(() => {
      void this.cycle(true)
    }, this.config.resolveIntervalMs)
    this.ensureSpotTimer()
  }

  private findInstrument(symbol: string): WatchInstrument | undefined {
    if (!this.config) return undefined
    const want = symbol.toUpperCase()
    return listEnabledInstruments(this.config).find((i) => i.symbol === want)
  }

  private cycle(forceResolve: boolean): Promise<void> {
    const run = this.tail.then(
      () => this.runCycle(forceResolve),
      () => this.runCycle(forceResolve)
    )
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async runCycle(forceResolve: boolean): Promise<void> {
    try {
      if (forceResolve || !this.config) {
        this.config = loadWatchConfig()
        this.health.pollIntervalMs = this.config.pollIntervalMs
        this.ensureSpotTimer()
      }
      if (forceResolve || this.resolved.length === 0) {
        await this.resolveAll()
      }
      await this.pollQuotes()
      this.applyHealth()
      this.emit()
    } catch (error) {
      this.fail(error)
    }
  }

  private applyHealth(): void {
    const reasons = this.quotes
      .map((q) => q.staleReason)
      .filter((reason): reason is string => Boolean(reason))
    const hasLadder = this.quotes.some((q) => q.ladder.length > 0)
    const allFresh = this.quotes.length > 0 && this.quotes.every((q) => !q.stale)

    if (allFresh && hasLadder) {
      this.health = {
        ...this.health,
        status: 'ok',
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        consecutiveFailures: 0
      }
      return
    }

    if (hasLadder) {
      this.health = {
        ...this.health,
        status: 'degraded',
        lastSuccessAt: new Date().toISOString(),
        lastError: reasons[0] ?? null,
        consecutiveFailures: 0
      }
      return
    }

    this.health = {
      ...this.health,
      status: 'error',
      lastError: reasons[0] ?? '未拿到任何报价',
      consecutiveFailures: this.health.consecutiveFailures + 1
    }
  }

  private async resolveAll(): Promise<void> {
    if (!this.config) return
    const instruments = listEnabledInstruments(this.config)
    const http = this.config.http
    const jobs = instruments.flatMap((instrument) =>
      instrument.markets.map(async (market) => {
        const resolved = await resolveWatchEvent(instrument, market, http)
        if (resolved.stale) {
          console.warn('[pm] stale', instrument.symbol, market.id, resolved.staleReason)
        } else {
          console.log(
            '[pm] resolved',
            instrument.symbol,
            resolved.slug,
            `${resolved.legs.length} legs`
          )
        }
        return resolved
      })
    )
    this.resolved = await Promise.all(jobs)
  }

  private async pollQuotes(): Promise<void> {
    if (!this.config) return
    const tokenIds = this.resolved
      .flatMap((event) => event.legs.map((leg) => leg.tokenId))
      .filter((id): id is string => Boolean(id))
    let mids: Record<string, number> = {}
    if (tokenIds.length > 0) {
      try {
        mids = await fetchMidpoints(tokenIds, this.config.http)
      } catch (error) {
        console.warn('[pm] batch midpoints failed, fallback per token', error)
        for (const tokenId of tokenIds) {
          const mid = await fetchMidpoint(tokenId, this.config.http)
          if (mid != null) mids[tokenId] = mid
        }
      }
    }

    const asOf = new Date().toISOString()
    const priced = new Map<string, PricedLeg>()

    for (const event of this.resolved) {
      for (const leg of event.legs) {
        if (!leg.tokenId) continue
        const mid = lookupMid(mids, leg.tokenId)
        const selected = selectProb({
          mid,
          last: leg.fallback.last,
          bid: leg.fallback.bid,
          ask: leg.fallback.ask
        })
        const prob = selected.prob ?? leg.fallback.mid ?? null
        const source = selected.source ?? (prob != null ? (leg.fallback.source ?? null) : null)
        let change24h: number | null = null
        if (prob != null) {
          this.store.append(leg.tokenId, prob)
          change24h = this.store.change24h(leg.tokenId, prob)
        }
        priced.set(leg.tokenId, { prob, source: source ?? null, change24h })
      }
    }

    this.quotes = this.resolved.map((event) => resolvedToQuote(event, priced, asOf, this.spot))
    void this.refreshSpot()
  }

  private ensureSpotTimer(): void {
    if (this.spotTimer) clearInterval(this.spotTimer)
    const ms = this.config?.spotIntervalMs ?? 1_000
    this.spotTimer = setInterval(() => {
      void this.refreshSpot()
    }, ms)
    void this.refreshSpot()
  }

  private async refreshSpot(): Promise<void> {
    if (this.spotBusy || !this.mt5) return
    this.spotBusy = true
    try {
      const next = await this.fetchSpot()
      if (!next) return
      const unchanged =
        this.spot != null &&
        this.spot.symbol === next.symbol &&
        Math.abs(this.spot.price - next.price) < 0.005
      this.spot = next
      if (this.quotes.length === 0) return
      this.quotes = this.quotes.map((quote) =>
        quote.role === 'price_target' ? { ...quote, spot: next } : quote
      )
      if (!unchanged) this.emit()
    } finally {
      this.spotBusy = false
    }
  }

  private async fetchSpot(): Promise<PmSpotPrice | null> {
    if (!this.mt5) return null
    try {
      const tick = await fetchGoldSpotFromMt5(this.mt5, this.goldMt5Symbol)
      this.goldMt5Symbol = tick.symbol
      const now = Date.now()
      if (now - this.lastSpotPersistAt >= 60_000) {
        this.store.append(SPOT_STORE_ID, tick.price)
        this.lastSpotPersistAt = now
      }
      const change24h = this.store.change24h(SPOT_STORE_ID, tick.price)
      const prev = change24h != null ? tick.price - change24h : null
      const change24hPct = change24h != null && prev != null && prev !== 0 ? change24h / prev : null
      return {
        symbol: tick.symbol,
        price: tick.price,
        change24h,
        change24hPct,
        asOf: new Date(tick.timeMs).toISOString()
      }
    } catch (error) {
      this.goldMt5Symbol = null
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('未就绪')) {
        console.warn('[pm] MT5 gold spot failed', error)
      }
      return null
    }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[pm]', message)
    this.health = {
      ...this.health,
      status: 'error',
      lastError: message,
      consecutiveFailures: this.health.consecutiveFailures + 1
    }
    this.emit()
  }

  private emit(): void {
    const snapshot = this.getSnapshot('XAUUSD')
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}
