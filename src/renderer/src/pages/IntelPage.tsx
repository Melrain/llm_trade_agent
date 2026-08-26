import type { JSX } from 'react'

import { CalendarList } from '@/components/intel/CalendarList'
import { NewsFeed } from '@/components/intel/NewsFeed'
import { PmMarketCard } from '@/components/intel/PmMarketCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNewsStore, usePmStore } from '@/stores'

export function IntelPage(): JSX.Element {
  const headlines = useNewsStore((s) => s.headlines)
  const calendar = useNewsStore((s) => s.calendar)
  const newsLoading = useNewsStore((s) => s.loading)
  const openUrl = useNewsStore((s) => s.openUrl)
  const quotes = usePmStore((s) => s.quotes)
  const pmLoading = usePmStore((s) => s.loading)
  const openEvent = usePmStore((s) => s.openEvent)

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-3 overflow-hidden p-3">
      <NewsFeed headlines={headlines} loading={newsLoading} onOpen={(url) => void openUrl(url)} />
      <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-4">
        <h2 className="text-[13px] font-semibold">宏观参考</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Polymarket 事件概率，不是 BTC / ETH 价格盘。
        </p>
        <ScrollArea className="mt-3 min-h-0 flex-1">
          {pmLoading && quotes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">正在解析市场…</p>
          ) : quotes.length === 0 ? (
            <EmptyState title="暂无宏观盘口" hint="这里不是现货行情。检查 watch 配置或网络。" />
          ) : (
            <div className="space-y-3">
              {quotes.map((quote) => (
                <PmMarketCard
                  key={quote.id}
                  quote={quote}
                  onOpen={(slug) => void openEvent(slug)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </section>
      <CalendarList events={calendar} loading={newsLoading} />
    </div>
  )
}
