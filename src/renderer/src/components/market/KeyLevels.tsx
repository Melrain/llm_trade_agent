import type { JSX } from 'react'

import { formatPrice, levelLabel } from '@/lib/format'
import type { MarketLevel } from '../../../../preload/market-types'

export function KeyLevels({
  levels,
  digits
}: {
  levels: MarketLevel[]
  digits?: number | null
}): JSX.Element {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium text-muted-foreground">关键价位</h3>
      {levels.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">暂无</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {levels.map((level) => (
            <li key={level.id} className="grid grid-cols-4 items-center gap-2 py-1.5 text-[13px]">
              <span>{levelLabel(level.id)}</span>
              <span className="tabular-nums">{formatPrice(level.high, digits)}</span>
              <span className="tabular-nums">{formatPrice(level.low, digits)}</span>
              <span className="text-right tabular-nums text-primary">
                {level.pos == null ? '—' : `${(level.pos * 100).toFixed(0)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
