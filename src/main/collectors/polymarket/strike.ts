/** 从 groupItemTitle / question 解析触及价（黄金 ladder 等）。 */

export type StrikeParsed = {
  direction?: 'up' | 'down' | 'flat'
  strike?: number
  unit?: 'USD'
  sortKey?: number
}

export type RateAction = 'hike' | 'cut' | 'hold'

export const RATE_ACTION_LABEL: Record<RateAction, string> = {
  hike: '加息',
  cut: '降息',
  hold: '不变'
}

export const RATE_ACTION_ORDER: RateAction[] = ['hike', 'cut', 'hold']

export function parseStrikeLabel(label: string): StrikeParsed {
  const isUp = /(?:↑|\bup\b|above|hit\s*≥?|HIGH|>=)/i.test(label)
  const isDown = /(?:↓|\bdown\b|below|LOW|≤|<=)/i.test(label)
  // 必须带 $，避免把 "25 bps" 里的 b 当成 billion
  const m = label.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)\s*([kKmMbB])?\b/)

  let strike: number | undefined
  if (m) {
    strike = Number(m[1])
    const suf = (m[2] || '').toLowerCase()
    if (suf === 'k') strike *= 1_000
    if (suf === 'm') strike *= 1_000_000
    if (suf === 'b') strike *= 1_000_000_000
  }

  const direction: StrikeParsed['direction'] = isUp ? 'up' : isDown ? 'down' : undefined

  let sortKey: number | undefined
  if (strike != null) {
    sortKey = direction === 'down' ? -strike : strike
  }

  return {
    direction,
    strike,
    unit: strike != null ? 'USD' : undefined,
    sortKey
  }
}

export function parseRateDecisionLabel(label: string): {
  action?: RateAction
  bps?: number
} {
  const t = label.toLowerCase()
  if (/no\s*change|unchanged|\bhold\b|不变/.test(t)) {
    return { action: 'hold' }
  }

  const bpsMatch = t.match(/(\d+)\s*\+?\s*(?:bps|bp)\b/)
  const bps = bpsMatch ? Number(bpsMatch[1]) : undefined
  const isCut = /decrease|cut|dovish|降息/.test(t)
  const isHike = /increase|hike|hawkish|加息/.test(t)

  if (isCut) return { action: 'cut', bps }
  if (isHike) return { action: 'hike', bps }
  return {}
}

export function compareLadderRows(
  a: { direction?: string; strike?: number },
  b: { direction?: string; strike?: number }
): number {
  const rank = (d?: string): number => (d === 'up' ? 0 : d === 'down' ? 1 : 2)
  const ra = rank(a.direction)
  const rb = rank(b.direction)
  if (ra !== rb) return ra - rb
  return (b.strike ?? 0) - (a.strike ?? 0)
}
