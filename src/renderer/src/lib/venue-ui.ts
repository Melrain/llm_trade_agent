export type FeedStatus = 'ok' | 'degraded' | 'error' | 'idle'

/** 行情超过该时长未变动才标黄，避免加密 24h 盘每 10 秒就降级 */
export const PRICE_STALE_MS = 5 * 60 * 1000

export function venueFeedStatus(
  ready: boolean,
  lastError: string | null,
  priceChangedAt: number | null,
  now: number
): FeedStatus {
  if (lastError) return 'error'
  if (!ready) return 'idle'
  if (priceChangedAt != null && now - priceChangedAt > PRICE_STALE_MS) return 'degraded'
  return 'ok'
}

export function feedStatusHint(status: FeedStatus, lastError: string | null): string {
  if (lastError) return lastError
  if (status === 'degraded') return '行情超过 5 分钟未更新'
  if (status === 'idle') return '尚未就绪'
  if (status === 'error') return '行情故障'
  return '行情正常'
}

export function assetShortName(symbol: string | null | undefined): string {
  const raw = (symbol ?? '').trim()
  if (!raw) return '—'
  const s = raw.toUpperCase()
  if (s.includes('ETH')) return 'ETH'
  if (s.includes('BTC')) return 'BTC'
  const head = s.split(/[-_/]/)[0]
  return head || s
}

export function volumeUnit(venue: 'mt5' | 'okx' | undefined): '张' | '手' {
  return venue === 'okx' ? '张' : '手'
}

export function volumeLabel(venue: 'mt5' | 'okx' | undefined): string {
  return venue === 'okx' ? '张数' : '手数'
}
