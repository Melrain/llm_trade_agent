import type { JSX } from 'react'

import { formatNum, formatSignedPct, pnlTone, timeframeLabel, trendLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MarketTimeframeId, MarketTimeframePack } from '../../../../preload/market-types'

const TFS: MarketTimeframeId[] = ['M15', 'H1', 'H4', 'D1']

export function TimeframeGrid({
  packs,
  active,
  onSelect
}: {
  packs: Record<MarketTimeframeId, MarketTimeframePack | null>
  active?: MarketTimeframeId
  onSelect?: (id: MarketTimeframeId) => void
}): JSX.Element {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium text-muted-foreground">多周期概览</h3>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-muted-foreground">
        <span>周期</span>
        <span>趋势</span>
        <span>RSI</span>
        <span>ATR</span>
      </div>
      <ul>
        {TFS.map((id) => {
          const pack = packs[id]
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect?.(id)}
                className={cn(
                  'grid w-full grid-cols-4 items-center gap-2 rounded-md py-1.5 text-left text-[13px]',
                  active === id ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <span>{timeframeLabel(id)}</span>
                <span
                  className={pnlTone(pack?.trend === 'up' ? 1 : pack?.trend === 'down' ? -1 : 0)}
                >
                  {trendLabel(pack?.trend)}
                </span>
                <span className="tabular-nums">{formatNum(pack?.rsi14, 1)}</span>
                <span className="tabular-nums">{formatNum(pack?.atr14)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {active && packs[active] && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          24h {formatSignedPct(packs[active]?.pctChange24h)} · EMA{' '}
          {formatNum(packs[active]?.ema20, 1)} / {formatNum(packs[active]?.ema50, 1)} /{' '}
          {formatNum(packs[active]?.ema200, 1)}
        </p>
      )}
    </section>
  )
}
