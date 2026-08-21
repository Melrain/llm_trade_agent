import type { JSX } from 'react'

import { HealthDot, type HealthStatus } from '@/components/common/HealthDot'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatRelative, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMarketStore, useNewsStore, usePmStore, useSnapshotStore } from '@/stores'

type SourceItem = {
  id: string
  label: string
  status: HealthStatus
  detail: string | null
  asOf: string | null
  extra?: string
  onRefresh: () => void
}

export function StatusBar(): JSX.Element {
  const market = useMarketStore()
  const news = useNewsStore()
  const pm = usePmStore()
  const snapshot = useSnapshotStore((s) => s.current)
  const refreshSnapshot = useSnapshotStore((s) => s.refresh)

  const staleQuotes = pm.quotes.filter((q) => q.stale).length
  const pmStatus: HealthStatus =
    pm.health.status === 'ok'
      ? staleQuotes > 0
        ? 'degraded'
        : 'ok'
      : pm.health.status === 'degraded'
        ? 'degraded'
        : pm.health.status === 'error'
          ? 'error'
          : 'idle'

  const marketStatus: HealthStatus = market.lastError ? 'error' : market.ready ? 'ok' : 'idle'
  const newsStatus: HealthStatus = news.lastError ? 'error' : news.asOf ? 'ok' : 'idle'
  const calStatus: HealthStatus = news.lastError
    ? 'error'
    : news.calendar.length > 0 || news.asOf
      ? 'ok'
      : 'idle'
  const snapStatus: HealthStatus = snapshot
    ? Object.values(snapshot.sources).some((s) => s === 'error')
      ? 'error'
      : Object.values(snapshot.sources).some((s) => s === 'degraded' || s === 'unavailable')
        ? 'degraded'
        : 'ok'
    : 'idle'

  const items: SourceItem[] = [
    {
      id: 'mt5',
      label: 'MT5',
      status: marketStatus,
      detail: market.lastError,
      asOf: market.asOf,
      onRefresh: () => void market.refresh()
    },
    {
      id: 'quote',
      label: '行情',
      status: marketStatus,
      detail: market.lastError,
      asOf: market.asOf,
      onRefresh: () => void market.refresh()
    },
    {
      id: 'news',
      label: '新闻',
      status: newsStatus,
      detail: news.lastError,
      asOf: news.asOf,
      extra: news.asOf ? formatRelative(news.asOf) : undefined,
      onRefresh: () => void news.refresh()
    },
    {
      id: 'pm',
      label: 'Polymarket',
      status: pmStatus,
      detail: pm.health.lastError,
      asOf: pm.health.lastSuccessAt,
      extra: staleQuotes > 0 ? `降级: ${staleQuotes}/${pm.quotes.length} 市场失效` : undefined,
      onRefresh: () => void pm.refresh()
    },
    {
      id: 'cal',
      label: '日历',
      status: calStatus,
      detail: news.lastError,
      asOf: news.asOf,
      onRefresh: () => void news.refresh()
    }
  ]

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-sidebar px-3 text-[13px] text-muted-foreground">
      {items.map((item) => (
        <Popover key={item.id}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
            >
              <span>{item.label}</span>
              <HealthDot status={item.status} />
              {item.extra && <span className="max-w-[180px] truncate">({item.extra})</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <p className="text-[13px] font-medium text-foreground">{item.label}</p>
            <p
              className={cn('mt-1 text-xs', item.detail ? 'text-red-400' : 'text-muted-foreground')}
            >
              {item.detail ?? (item.asOf ? `更新于 ${formatTime(item.asOf)}` : '暂无数据')}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-xs"
              onClick={item.onRefresh}
            >
              立即刷新
            </Button>
          </PopoverContent>
        </Popover>
      ))}
      <span className="ml-auto truncate">
        {snapshot
          ? `快照 #${snapshot.meta.snapshotId.slice(0, 4)} ${formatClockish(snapshot.meta.generatedAt)}`
          : '快照 —'}
        <button
          type="button"
          className="ml-2 hover:text-foreground"
          onClick={() => void refreshSnapshot()}
        >
          <HealthDot status={snapStatus} className="align-middle" />
        </button>
      </span>
    </footer>
  )
}

function formatClockish(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}
