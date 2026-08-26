import type { JSX } from 'react'

import { formatFunding, formatPrice, formatSpread } from '@/lib/format'
import { cn } from '@/lib/utils'

export function QuoteCard({
  bid,
  ask,
  spread,
  swapLong,
  swapShort,
  digits,
  venue
}: {
  bid: number | null
  ask: number | null
  spread: number | null
  swapLong: number | null
  swapShort: number | null
  digits?: number | null
  venue?: 'mt5' | 'okx'
}): JSX.Element {
  const rateLabel = venue === 'okx' ? '资金费率 多/空' : '过夜费 多/空'
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium text-muted-foreground">报价</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
        <Row label="买价" value={formatPrice(bid, digits)} />
        <Row label="卖价" value={formatPrice(ask, digits)} />
        <Row label="点差" value={formatSpread(spread, digits)} />
        <Row
          label={rateLabel}
          value={`${formatFunding(swapLong)} / ${formatFunding(swapShort)}`}
          className="col-span-2"
        />
      </dl>
    </section>
  )
}

function Row({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}): JSX.Element {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  )
}
