import {
  fetchEventBySlugOrNull,
  searchEvents,
  type GammaEvent,
  type GammaSearchEvent,
  type PmHttpConfig
} from './client'
import type { WatchDiscover, WatchMarket } from './config'
import { num } from './quotes'

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
] as const

export type DiscoveredEvent = {
  slug: string
  title?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isOpen(ev: { active?: boolean; closed?: boolean; archived?: boolean }): boolean {
  if (ev.closed || ev.archived) return false
  if (ev.active === false) return false
  return true
}

function notExpired(endDate: string | undefined, now = Date.now()): boolean {
  if (!endDate) return true
  const t = Date.parse(endDate)
  if (!Number.isFinite(t)) return true
  return t > now - 12 * 60 * 60 * 1000
}

function rollingMonths(now = new Date(), count = 2): Array<{ month: string; year: number }> {
  const out: Array<{ month: string; year: number }> = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    out.push({ month: MONTHS[d.getMonth()], year: d.getFullYear() })
  }
  return out
}

function fillTemplate(template: string, month: string, year: number): string {
  return template.replaceAll('{month}', month).replaceAll('{year}', String(year))
}

function vol(ev: GammaSearchEvent): number {
  return num(ev.volume24hr) ?? num(ev.volume) ?? 0
}

async function discoverMonthlyPriceHit(
  discover: WatchDiscover,
  http: PmHttpConfig
): Promise<DiscoveredEvent | null> {
  const template = discover.slugTemplate ?? 'what-price-will-xauusd-hit-in-{month}-{year}'

  for (const { month, year } of rollingMonths()) {
    const slug = fillTemplate(template, month, year)
    const event = await fetchEventBySlugOrNull(slug, http)
    if (event && isOpen(event) && notExpired(event.endDate)) {
      return { slug: event.slug ?? slug, title: event.title }
    }
  }

  const prefix = template.split('-{month}')[0] ?? 'xauusd-hit-in'
  const queries = discover.queries?.length ? discover.queries : ['XAUUSD hit']
  const seen = new Map<string, GammaSearchEvent>()
  for (const q of queries) {
    const events = await searchEvents(q, http)
    for (const ev of events) {
      const slug = (ev.slug || '').trim()
      if (!slug || seen.has(slug)) continue
      if (!isOpen(ev) || !notExpired(ev.endDate)) continue
      if (/week-of|up-or-down/.test(slug)) continue
      if (!slug.includes(prefix) && !/xauusd-hit-in-[a-z]+-\d{4}$/.test(slug)) continue
      seen.set(slug, ev)
    }
    await sleep(200)
  }

  const best = [...seen.values()].sort((a, b) => vol(b) - vol(a))[0]
  if (!best?.slug) return null
  return { slug: best.slug, title: best.title }
}

async function discoverNextFedDecision(
  discover: WatchDiscover,
  http: PmHttpConfig
): Promise<DiscoveredEvent | null> {
  const queries = discover.queries?.length ? discover.queries : ['Fed Decision']
  const needle = (discover.slugIncludes ?? 'fed-decision-in-').toLowerCase()
  const seen = new Map<string, GammaSearchEvent>()

  for (const q of queries) {
    const events = await searchEvents(q, http)
    for (const ev of events) {
      const slug = (ev.slug || '').trim()
      if (!slug || seen.has(slug)) continue
      if (!slug.toLowerCase().includes(needle)) continue
      if (!isOpen(ev) || !notExpired(ev.endDate)) continue
      seen.set(slug, ev)
    }
    await sleep(200)
  }

  const best = [...seen.values()].sort((a, b) => {
    const ta = Date.parse(a.endDate || '') || Number.POSITIVE_INFINITY
    const tb = Date.parse(b.endDate || '') || Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return vol(b) - vol(a)
  })[0]
  if (!best?.slug) return null
  return { slug: best.slug, title: best.title }
}

type GeoRule = {
  key: string
  match: (slug: string) => boolean
}

/** 人工挑过的黄金相关地缘盘：近端美伊/霍尔木兹 + 两条入侵 + 俄乌 */
const GEO_RULES: GeoRule[] = [
  { key: 'us_iran_ceasefire', match: (s) => /^us-ceasefire-against-iran/i.test(s) },
  { key: 'hormuz_normal', match: (s) => /strait-of-hormuz-traffic-returns-to-normal/i.test(s) },
  { key: 'us_invade_iran', match: (s) => s === 'will-the-us-invade-iran-before-2027' },
  { key: 'china_taiwan', match: (s) => s === 'will-china-invade-taiwan-before-2027' },
  { key: 'ru_ua_ceasefire', match: (s) => s === 'russia-x-ukraine-ceasefire-by' }
]

function pickBestGeo(events: GammaSearchEvent[]): GammaSearchEvent | null {
  const open = events.filter((ev) => ev.slug && isOpen(ev) && notExpired(ev.endDate))
  if (open.length === 0) return null
  return [...open].sort((a, b) => {
    const ta = Date.parse(a.endDate || '') || Number.POSITIVE_INFINITY
    const tb = Date.parse(b.endDate || '') || Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return vol(b) - vol(a)
  })[0]
}

async function discoverGoldGeopolitics(
  discover: WatchDiscover,
  http: PmHttpConfig
): Promise<DiscoveredEvent[]> {
  const queries = discover.queries?.length
    ? discover.queries
    : ['iran', 'israel', 'strait of hormuz', 'china taiwan', 'russia ukraine']
  const seen = new Map<string, GammaSearchEvent>()

  for (const q of queries) {
    const events = await searchEvents(q, http, 20)
    for (const ev of events) {
      const slug = (ev.slug || '').trim()
      if (!slug || seen.has(slug)) continue
      if (!isOpen(ev) || !notExpired(ev.endDate)) continue
      if (/mayor|election|winning-region|lol-worlds/i.test(slug)) continue
      seen.set(slug, ev)
    }
    await sleep(200)
  }

  const all = [...seen.values()]
  const picked: DiscoveredEvent[] = []
  for (const rule of GEO_RULES) {
    const match = pickBestGeo(all.filter((ev) => rule.match((ev.slug || '').trim())))
    if (!match?.slug) continue
    picked.push({ slug: match.slug, title: match.title })
    if (discover.maxEvents && picked.length >= discover.maxEvents) break
  }
  return picked
}

export async function discoverWatchEvents(
  watch: WatchMarket,
  http: PmHttpConfig
): Promise<DiscoveredEvent[]> {
  if (!watch.discover) return watch.eventSlug ? [{ slug: watch.eventSlug }] : []

  if (watch.discover.kind === 'monthly_price_hit') {
    const found = await discoverMonthlyPriceHit(watch.discover, http)
    if (found) console.log('[pm] discover', watch.id, found.slug)
    return found ? [found] : []
  }
  if (watch.discover.kind === 'next_fed_decision') {
    const found = await discoverNextFedDecision(watch.discover, http)
    if (found) console.log('[pm] discover', watch.id, found.slug)
    return found ? [found] : []
  }
  if (watch.discover.kind === 'gold_geopolitics') {
    const found = await discoverGoldGeopolitics(watch.discover, http)
    if (found.length) {
      console.log('[pm] discover', watch.id, found.map((e) => e.slug).join(', '))
    }
    return found
  }
  return watch.eventSlug ? [{ slug: watch.eventSlug }] : []
}

export async function discoverWatchSlug(
  watch: WatchMarket,
  http: PmHttpConfig
): Promise<DiscoveredEvent | null> {
  const found = await discoverWatchEvents(watch, http)
  return found[0] ?? null
}

export function isEventOpen(event: GammaEvent): boolean {
  return isOpen(event) && notExpired(event.endDate)
}
