import type { PmLadderRow, PmPriceSource, PmQuote, PmSpotPrice } from '../../../preload/pm-types'
import { fetchEventBySlug, type GammaEvent, type GammaMarket, type PmHttpConfig } from './client'
import type { WatchInstrument, WatchMarket } from './config'
import { discoverWatchEvents, discoverWatchSlug, isEventOpen } from './discover'
import { findOutcomeTokenId, num, parseJsonField, selectProb } from './quotes'
import { localizeEventTitle, localizeGeoLabel, localizePriceLabel } from './labels'
import {
  compareLadderRows,
  parseRateDecisionLabel,
  parseStrikeLabel,
  RATE_ACTION_LABEL,
  RATE_ACTION_ORDER,
  type RateAction
} from './strike'

/** 官网 1% 档视为噪声，不进 UI / 快照 */
export const MIN_DISPLAY_PROB = 0.01
const MAX_LADDER_ROWS = 20

export type ResolvedLeg = {
  marketId: string
  marketLabel: string
  question: string
  tokenId: string | null
  direction?: 'up' | 'down' | 'flat'
  strike?: number
  unit?: 'USD'
  rateAction?: RateAction
  volume24h: number | null
  volume: number | null
  stale: boolean
  staleReason?: string
  fallback: { mid?: number; last?: number; bid?: number; ask?: number; source?: PmPriceSource }
  eventSlug?: string
  displayLabel?: string
}

export type ResolvedEvent = {
  watch: WatchMarket
  symbol: string
  eventTitle: string
  slug: string
  endDate: string | null
  volume24h: number | null
  volume: number | null
  stale: boolean
  staleReason?: string
  legs: ResolvedLeg[]
}

function marketLabel(m: GammaMarket): string {
  const group = (m.groupItemTitle || '').trim()
  if (group) return group
  const q = (m.question || '').trim()
  if (!q) return String(m.id)
  return q.length <= 80 ? q : `${q.slice(0, 77)}…`
}

function listQuoteMarkets(event: GammaEvent): GammaMarket[] {
  const open = (event.markets ?? []).filter((m) => {
    if (m.closed) return false
    return parseJsonField<unknown[]>(m.clobTokenIds, []).length > 0
  })
  return open.length > 0 ? open : (event.markets ?? [])
}

function gammaFallback(market: GammaMarket, yesIndex: number): ResolvedLeg['fallback'] {
  const prices = parseJsonField<string[]>(market.outcomePrices, [])
  const gammaYes = yesIndex >= 0 ? num(prices[yesIndex]) : num(prices[0])
  const selected = selectProb({
    last: num(market.lastTradePrice),
    bid: num(market.bestBid),
    ask: num(market.bestAsk)
  })
  return {
    mid: gammaYes,
    last: num(market.lastTradePrice),
    bid: num(market.bestBid),
    ask: num(market.bestAsk),
    source: selected.source ?? (gammaYes != null ? 'gamma_outcomePrices' : undefined)
  }
}

function emptyEvent(
  instrument: WatchInstrument,
  watch: WatchMarket,
  extra: Partial<ResolvedEvent>
): ResolvedEvent {
  return {
    watch,
    symbol: instrument.symbol,
    eventTitle: watch.titleZh ?? watch.eventSlug ?? watch.id,
    slug: watch.eventSlug ?? watch.id,
    endDate: null,
    volume24h: null,
    volume: null,
    stale: true,
    legs: [],
    ...extra
  }
}

function toLeg(market: GammaMarket, outcomeName: string): ResolvedLeg {
  const outcomes = parseJsonField<string[]>(market.outcomes, ['Yes', 'No']).map(String)
  const tokenIds = parseJsonField<unknown[]>(market.clobTokenIds, []).map((id) => String(id))
  const yes = findOutcomeTokenId(outcomes, tokenIds, outcomeName)
  const label = marketLabel(market)
  const strike = parseStrikeLabel(label)
  const rate = parseRateDecisionLabel(`${label} ${market.question ?? ''}`)
  const stale = Boolean(market.closed || !yes)
  return {
    marketId: String(market.id),
    marketLabel: label,
    question: market.question ?? label,
    tokenId: yes?.tokenId ?? null,
    direction: strike.direction,
    strike: strike.strike,
    unit: strike.unit,
    rateAction: rate.action,
    volume24h: num(market.volume24hr) ?? null,
    volume: num(market.volume) ?? null,
    stale,
    staleReason: market.closed
      ? 'market closed'
      : yes
        ? undefined
        : `outcome "${outcomeName}" not found`,
    fallback: gammaFallback(market, yes?.index ?? -1)
  }
}

const GEO_MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
}

function parseGroupDate(label: string, fallbackYear: number): number | null {
  const m = /([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/.exec(label)
  if (!m) return null
  const month = GEO_MONTHS[m[1].toLowerCase()]
  if (month == null) return null
  return Date.UTC(m[3] ? Number(m[3]) : fallbackYear, month, Number(m[2]))
}

function pickGeoMarket(event: GammaEvent): GammaMarket | null {
  const markets = listQuoteMarkets(event)
  if (markets.length === 0) return null
  if (markets.length === 1) return markets[0]
  const year = Number.isFinite(Date.parse(event.endDate ?? ''))
    ? new Date(event.endDate as string).getUTCFullYear()
    : new Date().getUTCFullYear()
  const now = Date.now()
  const scored = markets.map((market) => {
    const parsed =
      parseGroupDate(market.groupItemTitle ?? '', year) ??
      Date.parse(market.endDate ?? '') ??
      Date.parse(event.endDate ?? '')
    return {
      market,
      t: Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY,
      vol: num(market.volume24hr) ?? 0
    }
  })
  const future = scored.filter((row) => row.t > now - 12 * 60 * 60 * 1000)
  const pool = future.length > 0 ? future : scored
  pool.sort((a, b) => a.t - b.t || b.vol - a.vol)
  return pool[0]?.market ?? null
}

function looksLikeGeo(watch: WatchMarket): boolean {
  return watch.role === 'geopolitics' || watch.discover?.kind === 'gold_geopolitics'
}

async function resolveGeoWatch(
  instrument: WatchInstrument,
  watch: WatchMarket,
  http: PmHttpConfig
): Promise<ResolvedEvent> {
  const founds = await discoverWatchEvents(watch, http)
  if (founds.length === 0) {
    return emptyEvent(instrument, watch, { staleReason: 'discover failed' })
  }

  const legs: ResolvedLeg[] = []
  let volume24h = 0
  let volume = 0
  let endDate: string | null = null

  for (const found of founds) {
    let event: GammaEvent
    try {
      event = await fetchEventBySlug(found.slug, http)
    } catch {
      continue
    }
    if (!isEventOpen(event)) continue
    const market = pickGeoMarket(event)
    if (!market) continue
    const slug = event.slug ?? found.slug
    const dateHint = (market.groupItemTitle || '').trim() || undefined
    legs.push({
      ...toLeg(market, watch.outcome),
      eventSlug: slug,
      displayLabel: localizeGeoLabel(event.title ?? slug, slug, dateHint)
    })
    volume24h += num(event.volume24hr) ?? 0
    volume += num(event.volume) ?? 0
    if (event.endDate && (!endDate || Date.parse(event.endDate) < Date.parse(endDate))) {
      endDate = event.endDate
    }
  }

  if (legs.length === 0) {
    return emptyEvent(instrument, watch, {
      eventTitle: watch.titleZh ?? '地缘政治',
      staleReason: 'no geopolitics markets'
    })
  }

  return {
    watch,
    symbol: instrument.symbol,
    eventTitle: watch.titleZh ?? '地缘政治',
    slug: legs[0].eventSlug ?? founds[0].slug,
    endDate,
    volume24h: volume24h || null,
    volume: volume || null,
    stale: false,
    legs
  }
}

export async function resolveWatchEvent(
  instrument: WatchInstrument,
  watch: WatchMarket,
  http: PmHttpConfig
): Promise<ResolvedEvent> {
  if (looksLikeGeo(watch)) {
    try {
      return await resolveGeoWatch(instrument, watch, http)
    } catch (error) {
      return emptyEvent(instrument, watch, {
        eventTitle: watch.titleZh ?? '地缘政治',
        staleReason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  try {
    const found = await discoverWatchSlug(watch, http)
    const slug = found?.slug
    if (!slug) {
      return emptyEvent(instrument, watch, {
        staleReason: 'discover failed'
      })
    }

    let event = await fetchEventBySlug(slug, http)
    if (watch.discover && !isEventOpen(event)) {
      const again = await discoverWatchSlug({ ...watch, eventSlug: undefined }, http)
      if (again?.slug && again.slug !== slug) {
        event = await fetchEventBySlug(again.slug, http)
      }
    }

    const resolvedSlug = event.slug ?? slug
    const markets = listQuoteMarkets(event)
    if (markets.length === 0) {
      return emptyEvent(instrument, watch, {
        eventTitle: event.title ?? resolvedSlug,
        slug: resolvedSlug,
        endDate: event.endDate ?? null,
        staleReason: event.closed ? 'event closed' : 'no markets'
      })
    }

    const legs = markets.map((m) => toLeg(m, watch.outcome))
    const stale = Boolean(event.closed) || legs.every((leg) => leg.stale)

    return {
      watch,
      symbol: instrument.symbol,
      eventTitle: event.title ?? resolvedSlug,
      slug: resolvedSlug,
      endDate: event.endDate ?? null,
      volume24h: num(event.volume24hr) ?? null,
      volume: num(event.volume) ?? null,
      stale,
      staleReason: event.closed ? 'event closed' : undefined,
      legs
    }
  } catch (error) {
    return emptyEvent(instrument, watch, {
      staleReason: error instanceof Error ? error.message : String(error)
    })
  }
}

export type PricedLeg = {
  prob: number | null
  source: PmPriceSource | null
  change24h: number | null
}

function legProb(leg: ResolvedLeg, priced: Map<string, PricedLeg>): number | null {
  const pricedLeg = leg.tokenId ? priced.get(leg.tokenId) : undefined
  return pricedLeg?.prob ?? leg.fallback.mid ?? null
}

function looksLikeRateDecision(event: ResolvedEvent): boolean {
  if (event.watch.role === 'macro') return true
  if (
    /fed-decision|fomc|federal reserve|interest rate/i.test(`${event.slug} ${event.eventTitle}`)
  ) {
    return true
  }
  return event.legs.filter((leg) => Boolean(leg.rateAction)).length >= 2
}

function buildRateLadder(event: ResolvedEvent, priced: Map<string, PricedLeg>): PmLadderRow[] {
  const buckets: Record<RateAction, { prob: number; volume24h: number; change: number | null }> = {
    hike: { prob: 0, volume24h: 0, change: null },
    cut: { prob: 0, volume24h: 0, change: null },
    hold: { prob: 0, volume24h: 0, change: null }
  }

  for (const leg of event.legs) {
    const action =
      leg.rateAction ?? parseRateDecisionLabel(`${leg.marketLabel} ${leg.question}`).action
    if (!action) continue
    const prob = legProb(leg, priced)
    if (prob == null) continue
    buckets[action].prob += prob
    buckets[action].volume24h += leg.volume24h ?? 0
    const change = leg.tokenId ? (priced.get(leg.tokenId)?.change24h ?? null) : null
    if (change != null) {
      buckets[action].change = (buckets[action].change ?? 0) + change
    }
  }

  return RATE_ACTION_ORDER.flatMap((action) => {
    const bucket = buckets[action]
    if (bucket.prob <= MIN_DISPLAY_PROB) return []
    return [
      {
        label: RATE_ACTION_LABEL[action],
        unit: 'bps' as const,
        impliedProb: Math.min(bucket.prob, 1),
        probChange24h: bucket.change,
        volume24h: bucket.volume24h || null
      }
    ]
  })
}

function looksLikeGeoEvent(event: ResolvedEvent): boolean {
  return looksLikeGeo(event.watch)
}

function buildGeoLadder(event: ResolvedEvent, priced: Map<string, PricedLeg>): PmLadderRow[] {
  const ladder: PmLadderRow[] = []
  for (const leg of event.legs) {
    const pricedLeg = leg.tokenId ? priced.get(leg.tokenId) : undefined
    const prob = pricedLeg?.prob ?? leg.fallback.mid ?? null
    if (prob == null) continue
    ladder.push({
      label: leg.displayLabel ?? localizeGeoLabel(leg.question, leg.eventSlug ?? event.slug),
      impliedProb: prob,
      probChange24h: pricedLeg?.change24h ?? null,
      volume24h: leg.volume24h,
      slug: leg.eventSlug
    })
  }
  return ladder
}

function buildPriceLadder(event: ResolvedEvent, priced: Map<string, PricedLeg>): PmLadderRow[] {
  const ladder: PmLadderRow[] = []
  for (const leg of event.legs) {
    const pricedLeg = leg.tokenId ? priced.get(leg.tokenId) : undefined
    const prob = pricedLeg?.prob ?? leg.fallback.mid ?? null
    if (prob == null || prob <= MIN_DISPLAY_PROB) continue
    ladder.push({
      label: localizePriceLabel(leg.direction, leg.strike, leg.marketLabel),
      direction: leg.direction,
      strike: leg.strike,
      unit: leg.unit,
      impliedProb: prob,
      probChange24h: pricedLeg?.change24h ?? null,
      volume24h: leg.volume24h
    })
  }
  ladder.sort(compareLadderRows)
  return ladder.slice(0, MAX_LADDER_ROWS)
}

export function resolvedToQuote(
  event: ResolvedEvent,
  priced: Map<string, PricedLeg>,
  asOf: string,
  spot?: PmSpotPrice | null
): PmQuote {
  const visible = looksLikeGeoEvent(event)
    ? buildGeoLadder(event, priced)
    : looksLikeRateDecision(event)
      ? buildRateLadder(event, priced)
      : buildPriceLadder(event, priced)
  const impliedProb = visible.length > 0 ? Math.max(...visible.map((row) => row.impliedProb)) : null

  return {
    id: event.watch.id,
    symbol: event.symbol,
    role: event.watch.role,
    primary: event.watch.primary,
    notes: event.watch.notes,
    eventTitle: event.watch.titleZh ?? localizeEventTitle(event.eventTitle, event.slug),
    question: event.eventTitle,
    marketLabel: visible[0]?.label ?? event.eventTitle,
    slug: event.slug,
    impliedProb,
    probSource: null,
    probChange24h: visible[0]?.probChange24h ?? null,
    volume24h: event.volume24h,
    volume: event.volume,
    endDate: event.endDate,
    stale: event.stale,
    staleReason: event.staleReason,
    asOf,
    ladder: visible,
    spot: event.watch.role === 'price_target' ? (spot ?? null) : null
  }
}
