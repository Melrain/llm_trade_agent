import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

import { DecisionDetail } from '@/components/agent/DecisionDetail'
import {
  PriceChart,
  type ChartBar,
  type ChartMarker,
  type ChartOverlay,
  type ChartPriceLine
} from '@/components/chart/PriceChart'
import { CHART_SERIES } from '@/components/chart/theme'
import { ChartPositions } from '@/components/market/ChartPositions'
import { KeyLevels } from '@/components/market/KeyLevels'
import { ManualOrderSheet } from '@/components/market/ManualOrderSheet'
import { QuoteCard } from '@/components/market/QuoteCard'
import { TimeframeGrid } from '@/components/market/TimeframeGrid'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { emaSeries, rsiSeries } from '@/lib/indicators'
import { cn } from '@/lib/utils'
import { assetShortName } from '@/lib/venue-ui'
import { isTradeSuccess } from '../../../preload/mt5-types'
import type { MarketTimeframeId } from '../../../preload/market-types'
import type { OkxCandleBar } from '../../../preload/okx-types'
import { useAgentStore, useMarketStore } from '@/stores'

const OKX_BARS: Record<MarketTimeframeId, OkxCandleBar> = {
  M15: '15m',
  H1: '1H',
  H4: '4H',
  D1: '1Dutc'
}

export function ChartPage(): JSX.Element {
  const symbol = useMarketStore((s) => s.symbol)
  const price = useMarketStore((s) => s.price)
  const swap = useMarketStore((s) => s.swap)
  const timeframes = useMarketStore((s) => s.timeframes)
  const levels = useMarketStore((s) => s.levels)
  const positions = useMarketStore((s) => s.positions)
  const digits = useMarketStore((s) => s.specs?.digits ?? 2)
  const records = useAgentStore((s) => s.records)
  const venue = useAgentStore((s) => s.config?.venue ?? 'mt5')
  const instId = useAgentStore((s) => s.config?.okx?.instId ?? symbol)

  const [tf, setTf] = useState<MarketTimeframeId>('H1')
  const [showEma, setShowEma] = useState({ ema20: true, ema50: true, ema200: true })
  const [showMarkers, setShowMarkers] = useState(true)
  const [showRsi, setShowRsi] = useState(true)
  const [bars, setBars] = useState<ChartBar[]>([])
  const [error, setError] = useState<string | null>(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const loadingMore = useRef(false)
  const exhausted = useRef(false)
  const barsRef = useRef<ChartBar[]>([])
  barsRef.current = bars

  const load = useCallback(
    async (start = 0, append = false) => {
      try {
        let next: ChartBar[] = []
        if (venue === 'okx') {
          const oldest = append ? barsRef.current[0]?.time : undefined
          const after =
            oldest != null ? (oldest > 10_000_000_000 ? oldest : oldest * 1000) : undefined
          const candles = await window.api.okx.candles(instId, OKX_BARS[tf], 300, after)
          if (!Array.isArray(candles) || candles.length === 0) {
            if (!append) setBars([])
            exhausted.current = true
            return
          }
          exhausted.current = candles.length < 300
          next = candles.map((c) => ({
            time: Math.floor(c.ts / 1000),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
          }))
        } else {
          const rates = await window.api.mt5.copy_rates_from_pos(symbol, tf, start, 300)
          if (!Array.isArray(rates) || rates.length === 0) {
            if (!append) setBars([])
            exhausted.current = true
            return
          }
          exhausted.current = rates.length < 300
          next = rates.map((r) => ({
            time: r.time,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close
          }))
        }
        setBars((prev) => {
          if (!append) return next
          const first = prev[0]?.time
          const older = first != null ? next.filter((b) => b.time < first) : next
          return [...older, ...prev]
        })
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [symbol, tf, venue, instId]
  )

  useEffect(() => {
    exhausted.current = false
    void load(0, false)
  }, [load])

  const mid = price?.mid ?? null
  useEffect(() => {
    if (mid == null) return
    setBars((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last.close === mid) return prev
      return [
        ...prev.slice(0, -1),
        { ...last, close: mid, high: Math.max(last.high, mid), low: Math.min(last.low, mid) }
      ]
    })
  }, [mid])

  const closes = useMemo(() => bars.map((b) => b.close), [bars])
  const overlays = useMemo<ChartOverlay[]>(() => {
    const out: ChartOverlay[] = []
    const push = (id: 'ema20' | 'ema50' | 'ema200', period: number, color: string): void => {
      if (!showEma[id]) return
      const series = emaSeries(closes, period)
      out.push({
        id,
        color,
        data: bars.flatMap((b, i) =>
          series[i] == null ? [] : [{ time: b.time, value: series[i] as number }]
        )
      })
    }
    push('ema20', 20, CHART_SERIES.ema20)
    push('ema50', 50, CHART_SERIES.ema50)
    push('ema200', 200, CHART_SERIES.ema200)
    return out
  }, [bars, closes, showEma])

  const rsi = useMemo(() => {
    if (!showRsi || bars.length === 0) return null
    const series = rsiSeries(closes, 14)
    return bars.flatMap((b, i) =>
      series[i] == null ? [] : [{ time: b.time, value: series[i] as number }]
    )
  }, [bars, closes, showRsi])

  const markers = useMemo<ChartMarker[]>(() => {
    if (!showMarkers || bars.length === 0) return []
    const out: ChartMarker[] = []
    for (const row of records) {
      const sent = row.send ? isTradeSuccess(row.send.retcode) : row.execution?.status === 'sent'
      if (!sent) continue
      const t = Math.floor(Date.parse(row.createdAt) / 1000)
      if (!Number.isFinite(t)) continue
      const barTime = alignBar(bars, t)
      if (barTime == null) continue
      const action = row.decision?.action
      if (action === 'open_buy') {
        out.push({
          id: row.id,
          time: barTime,
          position: 'belowBar',
          shape: 'arrowUp',
          color: CHART_SERIES.up,
          text: '买'
        })
      } else if (action === 'open_sell') {
        out.push({
          id: row.id,
          time: barTime,
          position: 'aboveBar',
          shape: 'arrowDown',
          color: CHART_SERIES.down,
          text: '卖'
        })
      } else if (action === 'close_position') {
        out.push({
          id: row.id,
          time: barTime,
          position: 'aboveBar',
          shape: 'square',
          color: '#94a3b8',
          text: '✕'
        })
      }
    }
    return out
  }, [bars, records, showMarkers])

  const priceLines = useMemo(() => {
    const lines: ChartPriceLine[] = []
    for (const pos of positions) {
      lines.push({ price: pos.priceOpen, color: CHART_SERIES.open, title: `#${pos.ticket} 开仓` })
      if (pos.sl) lines.push({ price: pos.sl, color: CHART_SERIES.sl, title: 'SL', dashed: true })
      if (pos.tp) lines.push({ price: pos.tp, color: CHART_SERIES.tp, title: 'TP', dashed: true })
    }
    return lines
  }, [positions])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
        <span className="text-[13px] font-medium">{assetShortName(symbol)}</span>
        {venue === 'okx' && (
          <span className="text-[11px] text-muted-foreground">{symbol}</span>
        )}
        <div className="flex rounded-md bg-muted p-0.5">
          {(['M15', 'H1', 'H4', 'D1'] as MarketTimeframeId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTf(id)}
              className={cn(
                'rounded px-2 py-0.5 text-xs',
                tf === id ? 'bg-background text-foreground' : 'text-muted-foreground'
              )}
            >
              {id}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showEma.ema20}
            onChange={(e) => setShowEma((s) => ({ ...s, ema20: e.target.checked }))}
          />
          EMA20
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showEma.ema50}
            onChange={(e) => setShowEma((s) => ({ ...s, ema50: e.target.checked }))}
          />
          EMA50
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showEma.ema200}
            onChange={(e) => setShowEma((s) => ({ ...s, ema200: e.target.checked }))}
          />
          EMA200
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => setShowMarkers(e.target.checked)}
          />
          决策标记
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
          RSI
        </label>
        {error && <span className="ml-auto text-xs text-red-400">{error}</span>}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 p-2">
          <PriceChart
            kind="candlestick"
            bars={bars}
            overlays={overlays}
            markers={markers}
            priceLines={priceLines}
            rsi={rsi}
            precision={digits || 2}
            onMarkerClick={setDrawerId}
            onLoadMore={() => {
              if (loadingMore.current || exhausted.current || bars.length === 0) return
              loadingMore.current = true
              void load(bars.length, true).finally(() => {
                loadingMore.current = false
              })
            }}
          />
        </div>
        <aside className="flex w-[280px] shrink-0 flex-col gap-3 overflow-auto border-l border-border p-3">
          <QuoteCard
            bid={price?.bid ?? null}
            ask={price?.ask ?? null}
            spread={price?.spread ?? null}
            swapLong={swap?.long ?? null}
            swapShort={swap?.short ?? null}
            digits={digits}
            venue={venue}
          />
          <TimeframeGrid packs={timeframes} active={tf} onSelect={setTf} digits={digits} />
          <KeyLevels levels={levels} digits={digits} />
          <ChartPositions />
          <Button variant="outline" className="mt-auto" onClick={() => setOrderOpen(true)}>
            手动下单
          </Button>
        </aside>
      </div>
      <ManualOrderSheet open={orderOpen} onOpenChange={setOrderOpen} />
      <Sheet open={drawerId != null} onOpenChange={(open) => !open && setDrawerId(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>决策详情</SheetTitle>
          </SheetHeader>
          <DecisionDetail row={records.find((r) => r.id === drawerId) ?? null} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

function barUnix(time: number): number {
  let sec = time
  while (sec > 10_000_000_000) sec = Math.floor(sec / 1000)
  return Math.floor(sec)
}

function alignBar(bars: ChartBar[], unix: number): number | null {
  for (let i = bars.length - 1; i >= 0; i--) {
    if (barUnix(bars[i].time) <= unix) return bars[i].time
  }
  return null
}
