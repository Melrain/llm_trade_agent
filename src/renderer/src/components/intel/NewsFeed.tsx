import { useMemo, useState, type JSX, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

import { EmptyState } from '@/components/common/EmptyState'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatRelative, headlineImpact, impactMeta, tagLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NewsHeadline } from '../../../../preload/news-types'

export function NewsFeed({
  headlines,
  loading,
  onOpen
}: {
  headlines: NewsHeadline[]
  loading: boolean
  onOpen: (url: string) => void
}): JSX.Element {
  const [tag, setTag] = useState<string | null>(null)
  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const item of headlines) for (const t of item.tags) set.add(t)
    return [...set]
  }, [headlines])
  const rows = tag ? headlines.filter((h) => h.tags.includes(tag)) : headlines

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-4">
      <h2 className="text-[13px] font-semibold">新闻流</h2>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <TagChip active={tag == null} onClick={() => setTag(null)}>
            全部
          </TagChip>
          {tags.map((t) => (
            <TagChip key={t} active={tag === t} onClick={() => setTag(t)}>
              {tagLabel(t)}
            </TagChip>
          ))}
        </div>
      )}
      <ScrollArea className="mt-3 min-h-0 flex-1">
        {loading && headlines.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">正在拉取标题…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="近 12 小时暂无相关新闻" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((item) => {
              const impact = impactMeta(headlineImpact(item.tags))
              const tone =
                impact.label === '高'
                  ? 'text-red-400'
                  : impact.label === '中'
                    ? 'text-amber-400'
                    : 'text-foreground'
              return (
                <li key={item.id} className="py-2.5">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (item.url.startsWith('http')) onOpen(item.url)
                    }}
                  >
                    <p className={cn('text-[13px] leading-snug hover:text-primary', tone)}>
                      {item.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{item.sourceZh}</span>
                      <span>{formatRelative(item.publishedAt)}</span>
                      <span className={cn('rounded-md px-1.5 py-0.5', impact.className)}>
                        {impact.label}
                      </span>
                      {item.tags.map((t) => (
                        <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                          {tagLabel(t)}
                        </span>
                      ))}
                      {item.url.startsWith('http') && <ExternalLink className="size-3" />}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  )
}

function TagChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[11px]',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
