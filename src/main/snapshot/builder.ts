import { randomUUID } from 'crypto'

import type { MarketSnapshot, MarketTimeframePack } from '../../preload/market-types'
import type { NewsSnapshot } from '../../preload/news-types'
import type { PmSnapshot } from '../../preload/pm-types'
import type {
  DecisionSnapshot,
  SnapshotBar,
  SnapshotCalendarItem,
  SnapshotPmMarket,
  SnapshotSourceStatus,
  SnapshotTimeframe
} from '../../preload/snapshot-types'
import { isCryptoRelevant } from '../collectors/news/rss'
import type { TradeVenue } from '../../preload/okx-types'

const DEFAULT_MAX_VOLUME = 0.1
const DEFAULT_RISK_PCT = 0.01
const HALT_MS = 15 * 60 * 1000
const PRICE_STALE_MS = 5 * 60 * 1000
/** 点差超过 0.15×H1 ATR 且超过绝对下限时视为异常（BTC/ETH 现货点差因经纪商差异较大） */
const SPREAD_ATR_RATIO = 0.15
const SPREAD_FLOOR = 1.0
const NEWS_SUMMARY_LEN = 220
const PM_LEGS_MAX = 8
const BARS_PER_TF = 8

export type BuilderInput = {
  market: MarketSnapshot
  pm: PmSnapshot
  news: NewsSnapshot
  dailyPnlRealized: number | null
  now?: number
  maxVolume?: number
  riskPct?: number
  fixedVolume?: number | null
  venue?: TradeVenue
}

function round(value: number | null | undefined, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const p = 10 ** digits
  return Math.round(value * p) / p
}

function roundReq(value: number, digits: number): number {
  return round(value, digits) ?? 0
}

function packTf(pack: MarketTimeframePack | null, digits: number): SnapshotTimeframe | null {
  if (!pack) return null
  return {
    ema20: round(pack.ema20, digits),
    ema50: round(pack.ema50, digits),
    ema200: round(pack.ema200, digits),
    rsi14: round(pack.rsi14, 1),
    atr14: round(pack.atr14, digits),
    trend: pack.trend,
    pctChange24h: round(pack.pctChange24h, 4),
    recentBars: pack.recentBars.slice(-BARS_PER_TF).map((bar): SnapshotBar => ({
      t: bar.t,
      o: roundReq(bar.o, digits),
      h: roundReq(bar.h, digits),
      l: roundReq(bar.l, digits),
      c: roundReq(bar.c, digits)
    }))
  }
}

function sourceOf(ok: boolean, error: string | null, degraded = false): SnapshotSourceStatus {
  if (ok && !degraded) return 'ok'
  if (ok) return 'degraded'
  if (error) return 'error'
  return 'unavailable'
}

function compactPm(pm: PmSnapshot): SnapshotPmMarket[] {
  return pm.quotes.map((quote) => ({
    id: quote.id,
    role: quote.role,
    title: quote.eventTitle,
    slug: quote.slug,
    stale: quote.stale,
    volume24h: round(quote.volume24h, 0),
    endDate: quote.endDate,
    legs: quote.ladder.slice(0, PM_LEGS_MAX).map((leg) => ({
      label: leg.label,
      impliedProb: roundReq(leg.impliedProb, 3),
      probChange24h: round(leg.probChange24h, 3)
    }))
  }))
}

function haltReason(
  market: MarketSnapshot,
  calendar: SnapshotCalendarItem[],
  now: number,
  venue: TradeVenue
): string | null {
  if (!market.ready) return '技术面未就绪'
  if (market.priceChangedAt != null && now - market.priceChangedAt > PRICE_STALE_MS) {
    return venue === 'okx'
      ? '价格超过 5 分钟未变动，行情可能中断'
      : '价格超过 5 分钟未变动，疑似休市'
  }
  const atrH1 = market.timeframes.H1?.atr14
  const spread = market.price?.spread
  const mid = market.price?.mid
  if (atrH1 != null && atrH1 > 0 && spread != null) {
    const cap =
      venue === 'okx'
        ? Math.max(atrH1 * SPREAD_ATR_RATIO, mid != null && mid > 0 ? mid * 0.003 : 0)
        : Math.max(SPREAD_FLOOR, atrH1 * SPREAD_ATR_RATIO)
    if (spread > cap) return `点差异常（${spread.toFixed(4)} > ${cap.toFixed(4)}）`
  }
  const soon = calendar.find((event) => {
    if (event.impact !== 'high') return false
    const t = Date.parse(event.when)
    return Number.isFinite(t) && Math.abs(t - now) <= HALT_MS
  })
  if (soon) return `高影响事件临近：${soon.titleZh}`
  return null
}

export function buildDecisionSnapshot(input: BuilderInput): DecisionSnapshot {
  const now = input.now ?? Date.now()
  const { market, pm, news, dailyPnlRealized } = input
  const venue: TradeVenue = input.venue ?? market.venue ?? 'mt5'
  const digits = market.specs?.digits ?? 2
  const floating = market.account?.profit ?? 0
  const dailyPnl = dailyPnlRealized == null ? null : round(dailyPnlRealized + floating, 2)

  const calendar: SnapshotCalendarItem[] = news.calendar.map((event) => ({
    when: event.when,
    title: event.title,
    titleZh: event.titleZh,
    currency: event.currency,
    impact: event.impact,
    forecast: event.forecast,
    previous: event.previous,
    actual: event.actual
  }))

  const halted = haltReason(market, calendar, now, venue)
  const headlines = news.headlines.filter(isCryptoRelevant).slice(0, 8)

  return {
    meta: {
      snapshotId: randomUUID(),
      symbol: market.symbol || (venue === 'okx' ? 'BTC-USDT-SWAP' : 'BTCUSD'),
      generatedAt: new Date(now).toISOString(),
      barTime: venue === 'okx' ? 'utc' : 'mt5-server',
      venue
    },
    sources: {
      market: sourceOf(market.ready, market.lastError),
      polymarket: sourceOf(
        pm.health.status === 'ok' || pm.health.status === 'degraded',
        pm.health.lastError,
        pm.health.status === 'degraded'
      ),
      // 抓取成功但当下没有加密相关新闻也算正常，不应报 unavailable
      news: sourceOf(
        Boolean(news.asOf) || headlines.length > 0,
        news.lastError,
        Boolean(news.lastError)
      ),
      calendar: sourceOf(news.calendar.length > 0, news.lastError, Boolean(news.lastError))
    },
    account: market.account
      ? {
          balance: roundReq(market.account.balance, 2),
          equity: roundReq(market.account.equity, 2),
          marginFree: roundReq(market.account.marginFree, 2),
          profit: roundReq(market.account.profit, 2),
          dailyPnl,
          dailyPnlRealized: round(dailyPnlRealized, 2),
          currency: market.account.currency,
          tradeMode: market.account.tradeMode,
          tradeAllowed: market.account.tradeAllowed,
          login: market.account.login,
          server: market.account.server,
          positions: market.positions.map((pos) => ({
            ticket: pos.ticket,
            type: pos.type,
            volume: roundReq(pos.volume, 2),
            priceOpen: roundReq(pos.priceOpen, digits),
            profit: roundReq(pos.profit, 2),
            sl: roundReq(pos.sl, digits),
            tp: roundReq(pos.tp, digits),
            magic: pos.magic
          }))
        }
      : null,
    technical: market.price
      ? {
          price: {
            bid: roundReq(market.price.bid, digits),
            ask: roundReq(market.price.ask, digits),
            mid: roundReq(market.price.mid, digits),
            spread: roundReq(market.price.spread, digits)
          },
          timeframes: {
            M15: packTf(market.timeframes.M15, digits),
            H1: packTf(market.timeframes.H1, digits),
            H4: packTf(market.timeframes.H4, digits),
            D1: packTf(market.timeframes.D1, digits)
          },
          levels: market.levels.map((level) => ({
            id: level.id,
            high: roundReq(level.high, digits),
            low: roundReq(level.low, digits),
            pos: round(level.pos, 3)
          }))
        }
      : null,
    polymarket: compactPm(pm),
    news: headlines.map((item) => ({
      publishedAt: item.publishedAt,
      source: item.sourceZh,
      title: item.title,
      summary: item.summary.slice(0, NEWS_SUMMARY_LEN),
      tags: item.tags
    })),
    calendar,
    constraints: {
      maxVolume: input.maxVolume ?? DEFAULT_MAX_VOLUME,
      riskPct: input.riskPct ?? DEFAULT_RISK_PCT,
      fixedVolume: input.fixedVolume ?? null,
      volumeMin: round(market.specs?.volumeMin, 2),
      volumeStep: round(market.specs?.volumeStep, 2),
      contractSize: round(market.specs?.contractSize, 2),
      fillingMode: market.specs?.fillingMode ?? null,
      digits: market.specs?.digits ?? null,
      swapLong: round(market.swap?.long, 2),
      swapShort: round(market.swap?.short, 2),
      allowedDirections: halted ? [] : ['buy', 'sell'],
      tradingHalted: Boolean(halted),
      haltReason: halted
    }
  }
}
