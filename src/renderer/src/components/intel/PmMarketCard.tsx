import type { JSX } from 'react'
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from 'lucide-react'

import { formatPct, formatPp, formatUsdCompact, roleLabel, staleReasonZh } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PmQuote } from '../../../../preload/pm-types'

export function PmMarketCard({
  quote,
  onOpen
}: {
  quote: PmQuote
  onOpen: (slug: string) => void
}): JSX.Element {
  const up = quote.probChange24h != null && quote.probChange24h > 0
  const down = quote.probChange24h != null && quote.probChange24h < 0
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus
  const pp = formatPp(quote.probChange24h)

  return (
    <article
      className={cn('rounded-lg border border-border bg-card p-4', quote.stale && 'opacity-60')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-400">
              {quote.primary ? '主盘' : '相关'} · {roleLabel(quote.role)}
            </span>
            {quote.stale && (
              <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-400">
                {quote.staleReason ? staleReasonZh(quote.staleReason) : '已失效'}
              </span>
            )}
          </div>
          <h3 className="text-[13px] font-medium leading-snug">{quote.eventTitle}</h3>
        </div>
        <button
          type="button"
          onClick={() => onOpen(quote.slug)}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="在浏览器打开"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-primary">
          {formatPct(quote.impliedProb)}
        </span>
        {pp && (
          <span
            className={cn(
              'inline-flex items-center text-xs',
              up && 'text-emerald-400',
              down && 'text-red-400'
            )}
          >
            <Icon className="size-3" />
            {pp}
          </span>
        )}
      </div>
      {quote.ladder.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {quote.ladder.map((row) => (
            <li
              key={`${row.label}-${row.strike ?? row.label}`}
              className="flex items-center gap-2 py-1.5 text-[13px]"
            >
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <span className="w-14 text-right font-mono tabular-nums">
                {formatPct(row.impliedProb)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        24h 成交 {formatUsdCompact(quote.volume24h)}
      </p>
    </article>
  )
}
