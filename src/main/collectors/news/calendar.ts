import type { CalendarEvent, NewsImpact } from '../../../preload/news-types'
import { readCalendarCache, writeCalendarCache } from '../../db/calendar'
import { fetchJson } from '../../http'

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const FRESH_MS = 60 * 60 * 1000
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000

let rateLimitedUntil = 0

type FfEvent = {
  title?: string
  country?: string
  date?: string
  impact?: string
  forecast?: string
  previous?: string
  actual?: string
}

type CacheFile = {
  fetchedAt: number
  rows: FfEvent[]
}

function readCache(): CacheFile | null {
  try {
    return readCalendarCache()
  } catch (error) {
    console.warn('[news] calendar cache read', error instanceof Error ? error.message : error)
    return null
  }
}

function writeCache(rows: FfEvent[]): void {
  try {
    writeCalendarCache(rows)
  } catch (error) {
    console.warn('[news] calendar cache write', error instanceof Error ? error.message : error)
  }
}

const LOW_KEEP =
  /pmi|crude oil|inventor|cpi|pce|gdp|retail|ism|jolts|adp|payroll|claims|fomc|powell|housing|permit/i

const TITLE_ZH: Array<[RegExp, string]> = [
  [/FOMC Meeting Minutes/i, '美联储会议纪要'],
  [/FOMC Statement/i, '美联储声明'],
  [/FOMC Press Conference/i, '美联储新闻发布会'],
  [/Federal Funds Rate/i, '联邦基金利率'],
  [/President Trump Speaks/i, '特朗普讲话'],
  [/Non-Farm Employment Change|Nonfarm Payroll/i, '非农就业人数'],
  [/Unemployment Claims|Initial Jobless Claims/i, '初请失业金'],
  [/Unemployment Rate/i, '失业率'],
  [/Average Hourly Earnings/i, '平均小时工资'],
  [/Core CPI/i, '核心 CPI'],
  [/\bCPI\b/i, 'CPI'],
  [/Core PCE/i, '核心 PCE'],
  [/\bPCE\b/i, 'PCE 物价'],
  [/\bPPI\b/i, 'PPI'],
  [/\bGDP\b/i, 'GDP'],
  [/Retail Sales/i, '零售销售'],
  [/ISM Manufacturing/i, 'ISM 制造业 PMI'],
  [/ISM Services/i, 'ISM 服务业 PMI'],
  [/JOLTS/i, '职位空缺 (JOLTS)'],
  [/\bADP\b/i, 'ADP 就业'],
  [/Durable Goods/i, '耐用品订单'],
  [/Existing Home Sales/i, '成屋销售'],
  [/New Home Sales/i, '新屋销售'],
  [/Building Permits/i, '营建许可'],
  [/Housing Starts/i, '新屋开工'],
  [/Michigan/i, '密歇根消费者信心'],
  [/Consumer Confidence/i, '消费者信心'],
  [/Crude Oil Inventories/i, '原油库存'],
  [/Trade Balance/i, '贸易帐'],
  [/Factory Orders/i, '工厂订单'],
  [/Philly Fed|Philadelphia Fed/i, '费城联储制造业'],
  [/Flash Manufacturing PMI/i, '制造业 PMI 初值'],
  [/Flash Services PMI/i, '服务业 PMI 初值']
]

function impactOf(value: string | undefined): NewsImpact | null {
  const raw = (value ?? '').trim().toLowerCase()
  if (raw === 'high') return 'high'
  if (raw === 'medium') return 'medium'
  if (raw === 'low') return 'low'
  return null
}

function titleZh(title: string): string {
  for (const [re, zh] of TITLE_ZH) {
    if (re.test(title)) return zh
  }
  return title
}

function blank(value: string | undefined): string | null {
  const text = (value ?? '').trim()
  return text ? text : null
}

function keepUsd(row: FfEvent): boolean {
  if ((row.country ?? '').toUpperCase() !== 'USD') return false
  const impact = impactOf(row.impact)
  if (!impact) return false
  if (impact === 'high' || impact === 'medium') return true
  return LOW_KEEP.test(row.title ?? '')
}

export function selectCalendar(rows: FfEvent[], now = Date.now(), max = 12): CalendarEvent[] {
  const lookbackMs = 24 * 60 * 60 * 1000
  const windowStart = now - 2 * 60 * 60 * 1000
  const windowEnd = now + 24 * 60 * 60 * 1000
  const soonMs = 15 * 60 * 1000

  return rows
    .filter(keepUsd)
    .map((row): CalendarEvent | null => {
      const title = (row.title ?? '').trim()
      const whenMs = row.date ? Date.parse(row.date) : NaN
      const impact = impactOf(row.impact)
      if (!title || !impact || !Number.isFinite(whenMs)) return null
      if (whenMs < now - lookbackMs) return null
      const when = new Date(whenMs).toISOString()
      return {
        id: `${when}|${title}|USD`,
        title,
        titleZh: titleZh(title),
        currency: 'USD',
        impact,
        when,
        forecast: blank(row.forecast),
        previous: blank(row.previous),
        actual: blank(row.actual),
        inWindow: whenMs >= windowStart && whenMs <= windowEnd,
        soon: impact === 'high' && Math.abs(whenMs - now) <= soonMs
      }
    })
    .filter((row): row is CalendarEvent => row != null)
    .sort((a, b) => Date.parse(a.when) - Date.parse(b.when))
    .slice(0, max)
}

export async function fetchCalendar(now = Date.now()): Promise<CalendarEvent[]> {
  const cached = readCache()
  if (cached && now - cached.fetchedAt < FRESH_MS) {
    return selectCalendar(cached.rows, now)
  }
  if (now < rateLimitedUntil) {
    if (cached && now - cached.fetchedAt < STALE_MAX_MS) {
      return selectCalendar(cached.rows, now)
    }
    throw new Error('HTTP 429 nfs.faireconomy.media（冷却中）')
  }

  try {
    const rows = await fetchJson<FfEvent[]>(CALENDAR_URL, { timeoutMs: 20_000, retries: 0 })
    if (!Array.isArray(rows)) {
      throw new Error('calendar payload is not an array')
    }
    writeCache(rows)
    return selectCalendar(rows, now)
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    if (/HTTP 429/.test(reason)) {
      rateLimitedUntil = now + RATE_LIMIT_COOLDOWN_MS
    }
    if (cached && now - cached.fetchedAt < STALE_MAX_MS) {
      console.warn('[news] calendar using cache after', reason)
      return selectCalendar(cached.rows, now)
    }
    throw error
  }
}
