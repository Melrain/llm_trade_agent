import type { PmPriceSource } from '../../../preload/pm-types'

export function selectProb(input: { mid?: number; last?: number; bid?: number; ask?: number }): {
  prob?: number
  source?: PmPriceSource
} {
  if (input.mid != null && Number.isFinite(input.mid)) {
    return { prob: input.mid, source: 'mid' }
  }
  if (input.last != null && Number.isFinite(input.last)) {
    return { prob: input.last, source: 'last' }
  }
  if (
    input.bid != null &&
    input.ask != null &&
    Number.isFinite(input.bid) &&
    Number.isFinite(input.ask)
  ) {
    return { prob: (input.bid + input.ask) / 2, source: 'midpoint_fallback' }
  }
  return {}
}

export function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function parseJsonField<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v as T
}

/** 按 outcome 名定位 token。不要假设 tokenIds[0] 一定是 Yes。 */
export function findOutcomeTokenId(
  outcomes: string[],
  tokenIds: string[],
  outcomeName = 'Yes'
): { index: number; tokenId: string; outcome: string } | null {
  const ids = tokenIds.map((id) => String(id ?? '')).filter(Boolean)
  const want = outcomeName.toLowerCase()
  const index = outcomes.findIndex((o) => o.toLowerCase() === want)
  if (index >= 0 && ids[index]) {
    return { index, tokenId: ids[index], outcome: outcomes[index] }
  }
  if (ids[0] && outcomes.length === 0) {
    return { index: 0, tokenId: ids[0], outcome: outcomeName }
  }
  return null
}
