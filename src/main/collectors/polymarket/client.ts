import { fetchJson, type FetchJsonOptions } from '../../http'
import { num } from './quotes'

export type GammaMarket = {
  id: string
  question?: string
  slug?: string
  groupItemTitle?: string
  active?: boolean
  closed?: boolean
  endDate?: string
  outcomes?: string | string[]
  clobTokenIds?: string | string[]
  volume?: string | number
  volume24hr?: number
  bestBid?: number
  bestAsk?: number
  lastTradePrice?: number
  outcomePrices?: string | string[]
}

export type GammaEvent = {
  id: string
  slug?: string
  title?: string
  description?: string
  active?: boolean
  closed?: boolean
  endDate?: string
  volume?: number
  volume24hr?: number
  markets?: GammaMarket[]
}

export type PmHttpConfig = {
  gammaBase: string
  clobBase: string
  timeoutMs: number
  retries: number
  userAgent: string
}

function httpOpts(cfg: PmHttpConfig): FetchJsonOptions {
  return {
    timeoutMs: cfg.timeoutMs,
    retries: cfg.retries,
    userAgent: cfg.userAgent
  }
}

export async function fetchEventBySlug(slug: string, cfg: PmHttpConfig): Promise<GammaEvent> {
  const events = await fetchJson<GammaEvent[]>(
    `${cfg.gammaBase.replace(/\/$/, '')}/events?${new URLSearchParams({ slug })}`,
    httpOpts(cfg)
  )
  if (!events?.length) {
    throw new Error(`Gamma 未找到 event: slug=${slug}`)
  }
  return events[0]
}

export async function fetchEventBySlugOrNull(
  slug: string,
  cfg: PmHttpConfig
): Promise<GammaEvent | null> {
  try {
    return await fetchEventBySlug(slug, cfg)
  } catch {
    return null
  }
}

export type GammaSearchEvent = {
  slug?: string
  title?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  endDate?: string
  volume24hr?: number | string
  volume?: number | string
}

export async function searchEvents(
  query: string,
  cfg: PmHttpConfig,
  limitPerType = 12
): Promise<GammaSearchEvent[]> {
  const data = await fetchJson<{ events?: GammaSearchEvent[] }>(
    `${cfg.gammaBase.replace(/\/$/, '')}/public-search?${new URLSearchParams({
      q: query,
      limit_per_type: String(limitPerType)
    })}`,
    httpOpts(cfg)
  )
  return Array.isArray(data.events) ? data.events : []
}

export async function fetchMidpoints(
  tokenIds: string[],
  cfg: PmHttpConfig
): Promise<Record<string, number>> {
  if (tokenIds.length === 0) return {}
  const data = await fetchJson<Record<string, string>>(
    `${cfg.clobBase.replace(/\/$/, '')}/midpoints`,
    {
      ...httpOpts(cfg),
      method: 'POST',
      body: tokenIds.map((token_id) => ({ token_id }))
    }
  )
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(data ?? {})) {
    const n = num(value)
    if (n != null) out[String(id)] = n
  }
  return out
}

export function lookupMid(mids: Record<string, number>, tokenId: string): number | undefined {
  const direct = mids[tokenId]
  if (direct != null) return direct
  const found = Object.entries(mids).find(([id]) => id === String(tokenId))
  return found?.[1]
}

export async function fetchMidpoint(
  tokenId: string,
  cfg: PmHttpConfig
): Promise<number | undefined> {
  try {
    const res = await fetchJson<{ mid?: string }>(
      `${cfg.clobBase.replace(/\/$/, '')}/midpoint?token_id=${encodeURIComponent(tokenId)}`,
      httpOpts(cfg)
    )
    return num(res.mid)
  } catch {
    return undefined
  }
}
