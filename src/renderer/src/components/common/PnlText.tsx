import type { JSX } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatSigned, pnlTone } from '@/lib/format'

export function PnlText({
  value,
  digits = 2,
  suffix = '',
  className,
  withIcon = false
}: {
  value: number | null | undefined
  digits?: number
  suffix?: string
  className?: string
  withIcon?: boolean
}): JSX.Element {
  const Icon = value == null || value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 tabular-nums', pnlTone(value), className)}
    >
      {withIcon && <Icon className="size-3" />}
      {formatSigned(value, digits)}
      {suffix}
    </span>
  )
}
