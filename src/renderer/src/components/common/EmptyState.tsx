import type { JSX } from 'react'

import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  hint,
  className
}: {
  title: string
  hint?: string
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-4 py-10 text-center',
        className
      )}
    >
      <p className="text-[13px] text-muted-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  )
}
