import type { JSX } from 'react'

import { cn } from '@/lib/utils'

export type HealthStatus = 'ok' | 'degraded' | 'error' | 'idle'

export function healthClass(status: HealthStatus): string {
  if (status === 'ok') return 'bg-emerald-400'
  if (status === 'degraded') return 'bg-amber-400'
  if (status === 'error') return 'bg-red-500'
  return 'bg-muted-foreground/50'
}

export function healthLabel(status: HealthStatus): string {
  if (status === 'ok') return '正常'
  if (status === 'degraded') return '降级'
  if (status === 'error') return '失败'
  return '待命'
}

export function HealthDot({
  status,
  pulse = false,
  className
}: {
  status: HealthStatus
  pulse?: boolean
  className?: string
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        healthClass(status),
        pulse && status === 'ok' && 'animate-pulse',
        className
      )}
    />
  )
}
