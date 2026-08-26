import type { JSX } from 'react'

import { cn } from '@/lib/utils'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  danger?: boolean
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  size = 'sm'
}: {
  value: T
  options: Array<SegmentedOption<T>>
  onChange: (value: T) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}): JSX.Element {
  return (
    <div className="flex rounded-md bg-muted p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (opt.value !== value) onChange(opt.value)
          }}
          className={cn(
            'rounded px-2 font-medium disabled:opacity-50',
            size === 'sm' ? 'py-0.5 text-[12px]' : 'px-3 py-1 text-[13px]',
            value === opt.value
              ? opt.danger
                ? 'bg-red-500 text-white shadow-sm'
                : 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
