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
import { isGoldRelevant } from '../collectors/news/rss'

const DEFAULT_MAX_VOLUME = 0.1
const DEFAULT_RISK_PCT = 0.01
const HALT_MS = 15 * 60 * 1000
const PRICE_STALE_MS = 5 * 60 * 1000
/** 点差超过 0.15×H1 ATR 且超过绝对下限时视为异常（黄金正常 0.2–0.4） */
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
}

function round(value: number | null | undefined, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const p = 10 ** digits
  return Math.round(value * p) / p
}

function roundReq(value: number, digits: number): number {
  return round(value, digits) ?? 0
}

function packTf(pack: MarketTimeframePack | null): SnapshotTimeframe | null {
  if (!pack) return null
  return {
    ema20: round(pack.ema20, 2),
    ema50: round(pack.ema50, 2),
    ema200: round(pack.ema200, 2),
    rsi14: round(pack.rsi14, 1),
    atr14: round(pack.atr14, 2),
    trend: pack.trend,
    pctChange24h: round(pack.pctChange24h, 4),
    recentBars: pack.recentBars.slice(-BARS_PER_TF).map((bar): SnapshotBar => ({
      t: bar.t,
      o: roundReq(bar.o, 2),
      h: roundReq(bar.h, 2),
      l: roundReq(bar.l, 2),
      c: roundReq(bar.c, 2)
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
  now: number
): string | null {
  if (!market.ready) return '技术面未就绪'
  if (market.priceChangedAt != null && now - market.priceChangedAt > PRICE_STALE_MS) {
    return '价格超过 5 分钟未变动，疑似休市'
  }
  const atrH1 = market.timeframes.H1?.atr14
  const spread = market.price?.spread
  if (atrH1 != null && atrH1 > 0 && spread != null) {
    const cap = Math.max(SPREAD_FLOOR, atrH1 * SPREAD_ATR_RATIO)
    if (spread > cap) return `点差异常（${spread.toFixed(2)} > ${cap.toFixed(2)}）`
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

  const halted = haltReason(market, calendar, now)
  const headlines = news.headlines.filter(isGoldRelevant).slice(0, 8)

  return {
    meta: {
      snapshotId: randomUUID(),
      symbol: market.symbol || pm.symbol || 'XAUUSD',
      generatedAt: new Date(now).toISOString(),
      barTime: 'mt5-server'
    },
    sources: {
      market: sourceOf(market.ready, market.lastError),
      polymarket: sourceOf(
        pm.health.status === 'ok' || pm.health.status === 'degraded',
        pm.health.lastError,
        pm.health.status === 'degraded'
      ),
      // 抓取成功但当下没有黄金相关新闻也算正常，不应报 unavailable
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
            priceOpen: roundReq(pos.priceOpen, 2),
            profit: roundReq(pos.profit, 2),
            sl: roundReq(pos.sl, 2),
            tp: roundReq(pos.tp, 2),
            magic: pos.magic
          }))
        }
      : null,
    technical: market.price
      ? {
          price: {
            bid: roundReq(market.price.bid, 2),
            ask: roundReq(market.price.ask, 2),
            mid: roundReq(market.price.mid, 2),
            spread: roundReq(market.price.spread, 2)
          },
          timeframes: {
            M15: packTf(market.timeframes.M15),
            H1: packTf(market.timeframes.H1),
            H4: packTf(market.timeframes.H4),
            D1: packTf(market.timeframes.D1)
          },
          levels: market.levels.map((level) => ({
            id: level.id,
            high: roundReq(level.high, 2),
            low: roundReq(level.low, 2),
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
