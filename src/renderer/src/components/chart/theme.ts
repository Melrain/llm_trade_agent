import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type ChartOptions,
  type DeepPartial
} from 'lightweight-charts'

export const CHART_SERIES = {
  ema20: '#38bdf8',
  ema50: '#fbbf24',
  ema200: '#c084fc',
  up: '#34d399',
  down: '#f87171',
  rsi: '#94a3b8',
  area: '#38bdf8',
  sl: '#f87171',
  tp: '#34d399',
  open: '#e2e8f0'
} as const

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (
    !value ||
    value.startsWith('oklch') ||
    value.startsWith('lab') ||
    value.startsWith('color(')
  ) {
    return fallback
  }
  return value
}

export function chartTheme(): DeepPartial<ChartOptions> {
  const background = cssVar('--background', '#1a1c24')
  const text = cssVar('--muted-foreground', '#8b90a0')
  const border = cssVar('--border', '#2c3040')
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: background },
      textColor: text,
      fontSize: 12,
      fontFamily: 'system-ui, "Segoe UI", "Microsoft YaHei", sans-serif',
      attributionLogo: false
    },
    grid: {
      vertLines: { color: border },
      horzLines: { color: border }
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border, timeVisible: true, secondsVisible: false }
  }
}

export { LineStyle }
