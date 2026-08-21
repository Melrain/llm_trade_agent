import { useEffect, useRef, useState, type JSX } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts'

import { chartTheme, CHART_SERIES, LineStyle } from './theme'

export type ChartBar = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export type ChartPoint = {
  time: number
  value: number
}

export type ChartMarker = {
  id: string
  time: number
  position: 'aboveBar' | 'belowBar'
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'
  color: string
  text?: string
}

export type ChartPriceLine = {
  price: number
  color: string
  title: string
  dashed?: boolean
}

export type ChartOverlay = {
  id: string
  color: string
  data: ChartPoint[]
}

type PriceChartProps = {
  kind: 'candlestick' | 'area'
  bars?: ChartBar[]
  area?: ChartPoint[]
  overlays?: ChartOverlay[]
  markers?: ChartMarker[]
  priceLines?: ChartPriceLine[]
  rsi?: ChartPoint[] | null
  precision?: number
  onMarkerClick?: (id: string) => void
  onLoadMore?: () => void
  className?: string
}

/** lightweight-charts 要 Unix 秒。K 线/成交经 bridge 后是毫秒；误 *1000 的 closedAt 会到 1e12+。 */
function toTime(t: number): UTCTimestamp {
  if (!Number.isFinite(t) || t <= 0) return 0 as UTCTimestamp
  let sec = t
  while (sec > 10_000_000_000) sec = Math.floor(sec / 1000)
  return Math.floor(sec) as UTCTimestamp
}

export function PriceChart({
  kind,
  bars = [],
  area = [],
  overlays = [],
  markers = [],
  priceLines = [],
  rsi = null,
  precision = 2,
  onMarkerClick,
  onLoadMore,
  className
}: PriceChartProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const overlayRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const rsiRef = useRef<ISeriesApi<'Line'> | null>(null)
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const fitOnce = useRef(true)
  const sigRef = useRef('')
  const onClickRef = useRef(onMarkerClick)
  const onLoadMoreRef = useRef(onLoadMore)
  const [chartGen, setChartGen] = useState(0)
  onClickRef.current = onMarkerClick
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    let chart: IChartApi | null = null
    let disposed = false

    const mount = (): void => {
      if (disposed || chartRef.current || el.clientWidth < 8 || el.clientHeight < 8) return
      try {
        chart = createChart(el, chartTheme())
      } catch (error) {
        console.error('[chart] createChart failed', error)
        return
      }
      chartRef.current = chart
      fitOnce.current = true
      sigRef.current = ''

      if (kind === 'candlestick') {
        candleRef.current = chart.addSeries(CandlestickSeries, {
          upColor: CHART_SERIES.up,
          downColor: CHART_SERIES.down,
          borderUpColor: CHART_SERIES.up,
          borderDownColor: CHART_SERIES.down,
          wickUpColor: CHART_SERIES.up,
          wickDownColor: CHART_SERIES.down
        })
        markersApi.current = createSeriesMarkers(candleRef.current, [])
      } else {
        areaRef.current = chart.addSeries(AreaSeries, {
          lineColor: CHART_SERIES.area,
          topColor: 'rgba(56, 189, 248, 0.28)',
          bottomColor: 'rgba(56, 189, 248, 0.02)',
          lineWidth: 2
        })
      }

      if (rsi) {
        rsiRef.current = chart.addSeries(LineSeries, { color: CHART_SERIES.rsi, lineWidth: 1 }, 1)
      }

      chart.subscribeClick((param) => {
        const id = param.hoveredObjectId
        if (typeof id === 'string') onClickRef.current?.(id)
      })
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from < 8) onLoadMoreRef.current?.()
      })
      setChartGen((n) => n + 1)
    }

    mount()
    const ro = new ResizeObserver(() => mount())
    ro.observe(el)

    return () => {
      disposed = true
      ro.disconnect()
      try {
        chartRef.current?.remove()
      } catch {
        /* already gone */
      }
      chartRef.current = null
      candleRef.current = null
      areaRef.current = null
      rsiRef.current = null
      markersApi.current = null
      overlayRefs.current.clear()
      linesRef.current = []
    }
  }, [kind, Boolean(rsi)])

  useEffect(() => {
    const candle = candleRef.current
    const areaSeries = areaRef.current
    const minMove = Number((10 ** -Math.max(0, precision)).toFixed(Math.max(0, precision))) || 0.01
    try {
      if (kind === 'candlestick' && candle) {
        candle.applyOptions({
          priceFormat: { type: 'price', precision, minMove }
        })
        const sig = bars[0] ? `${bars[0].time}:${bars.length}` : ''
        if (sig === sigRef.current && bars.length > 0) {
          const last = bars[bars.length - 1]
          candle.update({ ...last, time: toTime(last.time) })
        } else {
          sigRef.current = sig
          candle.setData(bars.map((b) => ({ ...b, time: toTime(b.time) })))
        }
      }
      if (kind === 'area' && areaSeries) {
        areaSeries.setData(area.map((p) => ({ time: toTime(p.time), value: p.value })))
      }
      if (fitOnce.current && kind === 'area' && area.length > 1) {
        chartRef.current?.timeScale().fitContent()
        fitOnce.current = false
      }
    } catch (error) {
      console.error('[chart] setData failed', error)
    }
  }, [kind, bars, area, precision, chartGen])

  useEffect(() => {
    const chart = chartRef.current
    const candle = candleRef.current
    if (!chart || kind !== 'candlestick' || !candle) return
    const keep = new Set(overlays.map((o) => o.id))
    for (const [id, series] of overlayRefs.current) {
      if (!keep.has(id)) {
        chart.removeSeries(series)
        overlayRefs.current.delete(id)
      }
    }
    for (const overlay of overlays) {
      let series = overlayRefs.current.get(overlay.id)
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: overlay.color,
          lineWidth: 1,
          priceLineVisible: false
        })
        overlayRefs.current.set(overlay.id, series)
      }
      series.setData(overlay.data.map((p) => ({ time: toTime(p.time), value: p.value })))
    }
  }, [kind, overlays, chartGen])

  useEffect(() => {
    if (!markersApi.current) return
    const next: SeriesMarker<Time>[] = markers.map((m) => ({
      id: m.id,
      time: toTime(m.time),
      position: m.position,
      shape: m.shape,
      color: m.color,
      text: m.text
    }))
    markersApi.current.setMarkers(next)
  }, [markers, chartGen])

  useEffect(() => {
    const series = candleRef.current
    if (!series) return
    for (const line of linesRef.current) series.removePriceLine(line)
    linesRef.current = priceLines.map((line) =>
      series.createPriceLine({
        price: line.price,
        color: line.color,
        title: line.title,
        lineWidth: 1,
        lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true
      })
    )
  }, [priceLines, chartGen])

  useEffect(() => {
    rsiRef.current?.setData((rsi ?? []).map((p) => ({ time: toTime(p.time), value: p.value })))
  }, [rsi, chartGen])

  return <div ref={hostRef} className={className ?? 'h-full w-full'} />
}
