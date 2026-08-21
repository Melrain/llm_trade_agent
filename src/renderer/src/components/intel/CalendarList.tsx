import { useEffect, useMemo, useState, type JSX } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCountdown, formatEventWhen, impactMeta } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '../../../../preload/news-types'

export function CalendarList({
  events,
  loading
}: {
  events: CalendarEvent[]
  loading: boolean
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    const from = now - 2 * 60 * 60 * 1000
    const to = now + 24 * 60 * 60 * 1000
    return events.filter((ev) => {
      const t = Date.parse(ev.when)
      return Number.isFinite(t) && t >= from && t <= to
    })
  }, [events, now])

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-4">
      <h2 className="text-[13px] font-semibold">财经日历</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">过去 2 小时 · 未来 24 小时</p>
      <ScrollArea className="mt-3 min-h-0 flex-1">
        {loading && events.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">正在拉取日历…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="窗口内暂无相关事件" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((event) => {
              const impact = impactMeta(event.impact)
              const whenMs = Date.parse(event.when)
              const released = whenMs < now
              const highlight = event.impact === 'high' && event.soon
              const remain = whenMs - now
              return (
                <li
                  key={event.id}
                  className={cn(
                    'py-2.5',
                    highlight && 'rounded-md bg-amber-500/10 px-1.5',
                    released && !highlight && 'opacity-70'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug">{event.titleZh}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatEventWhen(event.when)}
                        {released ? ' · 已公布' : ''}
                        {highlight && !released && remain > 0
                          ? ` · 倒计时 ${formatCountdown(remain)}`
                          : ''}
                      </p>
                    </div>
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px]', impact.className)}>
                      {impact.label}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <dt>前值</dt>
                      <dd className="text-[13px] text-foreground">{event.previous ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>预期</dt>
                      <dd className="text-[13px] text-foreground">{event.forecast ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>实际</dt>
                      <dd className="text-[13px] text-foreground">{event.actual ?? '—'}</dd>
                    </div>
                  </dl>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  )
}
