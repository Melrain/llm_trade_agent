import type {
  MarketLevel,
  MarketSnapshot,
  MarketTimeframeId,
  MarketTimeframePack
} from '../../../preload/market-types'
import type {
  Mt5AccountInfo,
  Mt5Position,
  Mt5Rate,
  Mt5SymbolInfo
} from '../../../preload/mt5-types'
import { ACCOUNT_TRADE_MODE_DEMO, ACCOUNT_TRADE_MODE_REAL } from '../../../preload/mt5-types'
import {
  atr,
  ema,
  highLow,
  pctChange,
  posInRange,
  rsiWilder,
  trendFromEmas
} from '../../indicators'
import { AGENT_MAGIC } from '../../../preload/agent-types'
import { getAsset, getPublicConfig, getVenue } from '../../agent/config'
import type { Mt5Client } from '../../mt5/client'
import type { OkxClient } from '../../okx/client'
import { posIdToTicket } from '../../okx/normalize'
import { okxPositionType } from '../../okx/order-builder'
import {
  okxInstIdForAsset,
  venueSymbol,
  type TradeAsset,
  type TradeVenue
} from '../../../preload/okx-types'
import { fetchSpotFromMt5 } from './spot-mt5'

const OKX_BARS: Record<MarketTimeframeId, string> = {
  M15: '15m',
  H1: '1H',
  H4: '4H',
  D1: '1Dutc'
}

type Listener = (snapshot: MarketSnapshot) => void

const TIMEFRAMES: MarketTimeframeId[] = ['M15', 'H1', 'H4', 'D1']
// EMA200 以 SMA 起步，需要远多于 200 根才能收敛，取 500 根
const RATE_COUNT = 500
const RECENT_BARS = 20
const LOOKBACK_24H: Record<MarketTimeframeId, number> = {
  M15: 96,
  H1: 24,
  H4: 6,
  D1: 1
}

function emptyTimeframes(): MarketSnapshot['timeframes'] {
  return { M15: null, H1: null, H4: null, D1: null }
}

function emptySnapshot(
  symbol = venueSymbol('mt5', 'XAU'),
  venue: 'mt5' | 'okx' = 'mt5'
): MarketSnapshot {
  return {
    venue,
    symbol,
    asOf: null,
    ready: false,
    lastError: null,
    priceChangedAt: null,
    price: null,
    swap: null,
    specs: null,
    timeframes: emptyTimeframes(),
    levels: [],
    account: null,
    positions: []
  }
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toLevel(
  id: MarketLevel['id'],
  range: { high: number; low: number } | null,
  mid: number
): MarketLevel | null {
  if (!range) return null
  return { id, high: range.high, low: range.low, pos: posInRange(mid, range.high, range.low) }
}

function buildLevels(h1: Mt5Rate[], h4: Mt5Rate[], d1: Mt5Rate[], mid: number): MarketLevel[] {
  const levels: MarketLevel[] = []
  const h4Range = highLow(h1.slice(-4)) ?? highLow(h4.slice(-1))
  const h4Level = toLevel('h4', h4Range, mid)
  if (h4Level) levels.push(h4Level)

  const prev = d1.length >= 2 ? d1[d1.length - 2] : null
  const prevRange = prev ? { high: prev.high, low: prev.low } : null
  const prevLevel = toLevel('prevDay', prevRange, mid)
  if (prevLevel) levels.push(prevLevel)

  const d5 = toLevel('d5', highLow(d1.slice(-5)), mid)
  if (d5) levels.push(d5)
  const d20 = toLevel('d20', highLow(d1.slice(-20)), mid)
  if (d20) levels.push(d20)
  return levels
}

function packRates(rates: Mt5Rate[], tf: MarketTimeframeId): MarketTimeframePack | null {
  if (!Array.isArray(rates) || rates.length < 21) return null
  // copy_rates_from_pos(start=0) 的最后一根是未收盘K线：
  // 指标与 recentBars 只用已收盘K线，避免盘中数值随轮询抖动；
  // pctChange24h 保留最新价，反映真实的 24 小时变化。
  const closed = rates.slice(0, -1)
  const closes = closed.map((r) => r.close)
  const ema20 = ema(closes, 20)
  const ema50 = ema(closes, 50)
  const ema200 = ema(closes, 200)
  const rsi14 = rsiWilder(closes, 14)
  const atr14 = atr(closed, 14)
  const recent = closed.slice(-RECENT_BARS).map((r) => ({
    t: new Date(r.time).toISOString(),
    o: r.open,
    h: r.high,
    l: r.low,
    c: r.close
  }))
  return {
    bars: closed.length,
    recentBars: recent,
    ema20,
    ema50,
    ema200,
    rsi14,
    atr14,
    trend: trendFromEmas(ema20, ema50, ema200, atr14),
    pctChange24h: pctChange(
      rates.map((r) => r.close),
      LOOKBACK_24H[tf]
    )
  }
}

export class MarketCollector {
  private snapshot: MarketSnapshot = emptySnapshot()
  private readonly listeners = new Set<Listener>()
  private timer: NodeJS.Timeout | null = null
  private tail: Promise<void> = Promise.resolve()
  private started = false
  private cachedSpot: { asset: TradeAsset; symbol: string } | null = null
  private lastRoute: { venue: TradeVenue; asset: TradeAsset } | null = null
  private lastPriceKey: string | null = null
  private lastPriceChangeAt: number | null = null

  constructor(
    private readonly mt5: Mt5Client,
    private readonly okx?: OkxClient
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    void this.cycle()
    this.timer = setInterval(() => {
      void this.cycle()
    }, 5_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.started = false
  }

  onUpdated(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): MarketSnapshot {
    return this.snapshot
  }

  async refresh(): Promise<MarketSnapshot> {
    await this.cycle()
    return this.snapshot
  }

  private cycle(): Promise<void> {
    const run = this.tail.then(
      () => this.poll(),
      () => this.poll()
    )
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private syncRoute(): boolean {
    const venue = getVenue()
    const asset = getAsset()
    if (this.lastRoute?.venue === venue && this.lastRoute.asset === asset) return false
    this.lastRoute = { venue, asset }
    this.cachedSpot = null
    this.lastPriceKey = null
    this.lastPriceChangeAt = null
    this.snapshot = emptySnapshot(venueSymbol(venue, asset), venue)
    this.emit()
    return true
  }

  private async poll(): Promise<void> {
    this.syncRoute()
    try {
      const next = await this.buildSnapshot()
      this.snapshot = next
      this.emit()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('未就绪')) {
        this.snapshot = {
          ...emptySnapshot(this.snapshot.symbol, this.snapshot.venue),
          lastError: null
        }
        return
      }
      this.snapshot = { ...this.snapshot, ready: false, lastError: message }
      this.emit()
    }
  }

  private async buildSnapshot(): Promise<MarketSnapshot> {
    if (getVenue() === 'okx') {
      return this.buildOkxSnapshot()
    }
    return this.buildMt5Snapshot()
  }

  private async buildOkxSnapshot(): Promise<MarketSnapshot> {
    if (!this.okx) {
      return {
        ...emptySnapshot(getPublicConfig().okx.instId, 'okx'),
        lastError: 'OKX 客户端未初始化'
      }
    }
    const instId = getPublicConfig().okx.instId || okxInstIdForAsset(getAsset())
    const [ticker, spec, funding, ...candleRows] = await Promise.all([
      this.okx.getTicker(instId),
      this.okx.getInstrumentSpec(instId),
      this.okx.getFundingRate(instId),
      ...TIMEFRAMES.map((tf) =>
        this.okx!.getCandles(instId, OKX_BARS[tf], RATE_COUNT).catch(() => [])
      )
    ])

    const timeframes = emptyTimeframes()
    TIMEFRAMES.forEach((tf, i) => {
      const candles = candleRows[i] ?? []
      timeframes[tf] = packRates(
        candles.map((c) => ({
          time: c.ts,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          tick_volume: 0,
          spread: 0
        })),
        tf
      )
    })

    const bid = ticker.bid
    const ask = ticker.ask
    const mid = ticker.mid
    const spread = ask - bid
    const priceKey = `${bid}|${ask}|okx|${instId}`
    if (priceKey !== this.lastPriceKey) {
      this.lastPriceKey = priceKey
      this.lastPriceChangeAt = Date.now()
    }

    const h1Rates = (candleRows[TIMEFRAMES.indexOf('H1')] ?? []).map((c) => ({
      time: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tick_volume: 0,
      spread: 0
    }))
    const h4Rates = (candleRows[TIMEFRAMES.indexOf('H4')] ?? []).map((c) => ({
      time: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tick_volume: 0,
      spread: 0
    }))
    const d1Rates = (candleRows[TIMEFRAMES.indexOf('D1')] ?? []).map((c) => ({
      time: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tick_volume: 0,
      spread: 0
    }))

    let account: MarketSnapshot['account'] = null
    let positions: MarketSnapshot['positions'] = []
    if (this.okx.hasKeys()) {
      try {
        const [balance, rawPositions, cfg] = await Promise.all([
          this.okx.getBalance(),
          this.okx.getPositions(instId),
          this.okx.getAccountConfig()
        ])
        const usdt = balance.details.find((d) => d.ccy === 'USDT')
        const equity = usdt?.eq || balance.totalEq
        const loginRaw = Number(cfg.uid)
        account = {
          balance: usdt?.eq ?? balance.totalEq,
          equity,
          marginFree: usdt?.availEq || balance.availEq,
          profit: usdt?.upl ?? balance.upl,
          currency: 'USDT',
          tradeMode: getPublicConfig().okx.demo ? ACCOUNT_TRADE_MODE_DEMO : ACCOUNT_TRADE_MODE_REAL,
          tradeAllowed: true,
          login:
            Number.isFinite(loginRaw) && loginRaw > 0 ? loginRaw : posIdToTicket(cfg.uid ?? instId),
          server: getPublicConfig().okx.demo ? 'OKX-DEMO' : 'OKX'
        }
        positions = rawPositions.map((p) => ({
          ticket: posIdToTicket(p.posId),
          type: okxPositionType(p.pos, p.posSide),
          volume: Math.abs(p.pos),
          priceOpen: p.avgPx,
          priceCurrent: p.last || mid,
          profit: p.upl,
          swap: 0,
          sl: p.slTriggerPx ?? 0,
          tp: p.tpTriggerPx ?? 0,
          magic: AGENT_MAGIC
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          venue: 'okx',
          symbol: instId,
          asOf: new Date().toISOString(),
          ready: false,
          lastError: message,
          priceChangedAt: this.lastPriceChangeAt,
          price: { bid, ask, mid, spread },
          swap: { long: funding, short: funding },
          specs: {
            volumeMin: spec.minSz,
            volumeStep: spec.lotSz,
            contractSize: spec.ctVal,
            fillingMode: null,
            digits: spec.digits
          },
          timeframes,
          levels: buildLevels(h1Rates, h4Rates, d1Rates, mid),
          account: null,
          positions: []
        }
      }
    }

    return {
      venue: 'okx',
      symbol: instId,
      asOf: new Date().toISOString(),
      ready: Number.isFinite(bid) && timeframes.H1 != null && timeframes.D1 != null,
      lastError: null,
      priceChangedAt: this.lastPriceChangeAt,
      price: { bid, ask, mid, spread },
      swap: { long: funding, short: funding },
      specs: {
        volumeMin: spec.minSz,
        volumeStep: spec.lotSz,
        contractSize: spec.ctVal,
        fillingMode: null,
        digits: spec.digits
      },
      timeframes,
      levels: buildLevels(h1Rates, h4Rates, d1Rates, mid),
      account,
      positions
    }
  }

  private async buildMt5Snapshot(): Promise<MarketSnapshot> {
    const asset = getAsset()
    const cached = this.cachedSpot?.asset === asset ? this.cachedSpot.symbol : null
    const tick = await fetchSpotFromMt5(this.mt5, asset, cached)
    this.cachedSpot = { asset, symbol: tick.symbol }

    const [infoRaw, accountRaw, positionsRaw, ...rateRows] = await Promise.all([
      this.mt5.request('symbol_info', { symbol: tick.symbol }).catch(() => null),
      this.mt5.request('account_info').catch(() => null),
      this.mt5.request('positions_get', { symbol: tick.symbol }).catch(() => []),
      ...TIMEFRAMES.map((tf) =>
        this.mt5
          .request('copy_rates_from_pos', {
            symbol: tick.symbol,
            timeframe: tf,
            start: 0,
            count: RATE_COUNT
          })
          .catch(() => [])
      )
    ])

    const info = (infoRaw ?? {}) as Mt5SymbolInfo
    const account = accountRaw as Mt5AccountInfo | null
    const positions = Array.isArray(positionsRaw) ? (positionsRaw as Mt5Position[]) : []
    const timeframes = emptyTimeframes()
    TIMEFRAMES.forEach((tf, i) => {
      timeframes[tf] = packRates((rateRows[i] as Mt5Rate[]) ?? [], tf)
    })

    const bid = asNumber(info.bid) ?? (tick.price > 0 ? tick.price : null)
    const ask = asNumber(info.ask) ?? bid
    const mid = bid != null && ask != null ? (bid + ask) / 2 : tick.price
    const spread = bid != null && ask != null ? ask - bid : (asNumber(info.spread) ?? 0)

    const priceKey = `${bid}|${ask}`
    if (priceKey !== this.lastPriceKey) {
      this.lastPriceKey = priceKey
      this.lastPriceChangeAt = Date.now()
    }

    const h1Rates = (rateRows[TIMEFRAMES.indexOf('H1')] as Mt5Rate[]) ?? []
    const h4Rates = (rateRows[TIMEFRAMES.indexOf('H4')] as Mt5Rate[]) ?? []
    const d1Rates = (rateRows[TIMEFRAMES.indexOf('D1')] as Mt5Rate[]) ?? []
    const levels = buildLevels(h1Rates, h4Rates, d1Rates, mid)

    return {
      venue: 'mt5',
      symbol: tick.symbol,
      asOf: new Date().toISOString(),
      // 有现价且核心周期指标齐备才算就绪，避免模型在缺技术面的情况下决策
      ready: bid != null && timeframes.H1 != null && timeframes.D1 != null,
      lastError: null,
      priceChangedAt: this.lastPriceChangeAt,
      price: {
        bid: bid ?? mid,
        ask: ask ?? mid,
        mid,
        spread
      },
      swap: {
        long: asNumber(info.swap_long),
        short: asNumber(info.swap_short)
      },
      specs: {
        volumeMin: asNumber(info.volume_min),
        volumeStep: asNumber(info.volume_step),
        contractSize: asNumber(info.trade_contract_size),
        fillingMode: asNumber(info.filling_mode),
        digits: asNumber(info.digits)
      },
      timeframes,
      levels,
      account: account
        ? {
            balance: account.balance,
            equity: account.equity,
            marginFree: account.margin_free,
            profit: account.profit,
            currency: account.currency,
            tradeMode: account.trade_mode,
            tradeAllowed: account.trade_allowed,
            login: account.login,
            server: account.server
          }
        : null,
      positions: positions.map((p) => ({
        ticket: p.ticket,
        type: p.type === 0 ? 'buy' : 'sell',
        volume: p.volume,
        priceOpen: p.price_open,
        priceCurrent: p.price_current,
        profit: p.profit,
        swap: p.swap,
        sl: p.sl,
        tp: p.tp,
        magic: p.magic
      }))
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}
