import type { JSX } from 'react'

export function ConfidenceRing({
  value,
  size = 36
}: {
  value: number
  size?: number
}): JSX.Element {
  const stroke = 3
  const r = (size - stroke * 2) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  const ok = value >= 0.6
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          className={ok ? 'text-emerald-400' : 'text-muted-foreground'}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] tabular-nums text-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  )
}
