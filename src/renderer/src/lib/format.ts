import type { MarketLevelId, MarketTimeframeId, MarketTrend } from '../../../preload/market-types'
import type { NewsImpact } from '../../../preload/news-types'
import type { AgentAction } from '../../../preload/agent-types'
import type { AccountMode } from '../../../preload/mt5-types'

export function formatNum(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNum(value, digits)}`
}

export function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(digits)}%`
}

export function formatPct(prob: number | null | undefined): string {
  if (prob == null || !Number.isFinite(prob)) return '—'
  const pct = prob * 100
  if (Math.abs(pct - Math.round(pct)) < 0.05) return `${Math.round(pct)}%`
  return `${pct.toFixed(1)}%`
}

export function formatPp(change: number | null | undefined): string | null {
  if (change == null || !Number.isFinite(change)) return null
  const pp = change * 100
  const sign = pp > 0 ? '+' : ''
  return `${sign}${pp.toFixed(1)}百分点`
}

export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

export function formatMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${formatNum(value, digits)}`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '尚未成功'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('zh-CN')
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return formatTime(iso)
  if (ms < 0) return formatTime(iso)
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return formatTime(iso)
}

export function formatEventWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatTokenCost(prompt: number, completion: number): string {
  const cost = (prompt / 1_000_000) * 0.28 + (completion / 1_000_000) * 0.42
  if (cost < 0.0005) return '<$0.001'
  if (cost < 0.01) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

export function pnlTone(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-muted-foreground'
  return value > 0 ? 'text-emerald-400' : 'text-red-400'
}

export function actionLabel(action: AgentAction): string {
  if (action === 'open_buy') return '开多'
  if (action === 'open_sell') return '开空'
  if (action === 'close_position') return '平仓'
  if (action === 'adjust_sltp') return '改止损止盈'
  return '观望'
}

export function trendLabel(trend: MarketTrend | null | undefined): string {
  if (trend === 'up') return '多头'
  if (trend === 'down') return '空头'
  if (trend === 'range') return '震荡'
  return '—'
}

export function timeframeLabel(id: MarketTimeframeId): string {
  if (id === 'M15') return '15分钟'
  if (id === 'H1') return '1小时'
  if (id === 'H4') return '4小时'
  return '日线'
}

export function levelLabel(id: MarketLevelId | string): string {
  if (id === 'h4') return '近4小时'
  if (id === 'prevDay') return '昨高昨低'
  if (id === 'd5') return '5日'
  if (id === 'd20') return '20日'
  return String(id)
}

export function headlineImpact(tags: string[]): NewsImpact {
  if (tags.some((t) => t === 'nfp' || t === 'cpi' || t === 'fed' || t === 'geo')) return 'high'
  if (tags.some((t) => t === 'gold' || t === 'usd')) return 'medium'
  return 'low'
}

export function tagLabel(tag: string): string {
  if (tag === 'fed') return '美联储'
  if (tag === 'cpi') return '通胀'
  if (tag === 'nfp') return '非农'
  if (tag === 'gold') return '黄金'
  if (tag === 'geo') return '地缘'
  if (tag === 'usd') return '美元'
  return tag
}

export function roleLabel(role: string): string {
  if (role === 'price_target') return '价格目标'
  if (role === 'macro') return '宏观'
  if (role === 'geopolitics') return '地缘'
  return role
}

export function staleReasonZh(reason: string): string {
  const map: Record<string, string> = {
    'event closed': '事件已关闭',
    'market closed': '市场已关闭',
    'discover failed': '发现失败',
    'no markets': '没有盘口',
    'no geopolitics markets': '没有地缘盘'
  }
  return map[reason] ?? reason
}

export function impactMeta(impact: NewsImpact): { label: string; className: string } {
  if (impact === 'high') return { label: '高', className: 'bg-red-500/15 text-red-400' }
  if (impact === 'medium') return { label: '中', className: 'bg-amber-500/15 text-amber-400' }
  return { label: '低', className: 'bg-muted text-muted-foreground' }
}

export function accountModeLabel(mode: AccountMode): string {
  if (mode === 'demo') return 'DEMO'
  if (mode === 'real') return 'REAL'
  return '未知'
}

export function isWeekend(now = new Date()): boolean {
  const day = now.getDay()
  return day === 0 || day === 6
}
