import type { JSX } from 'react'

import { ActionBadge } from '@/components/agent/RiskVerdictBadge'
import { formatClock, formatNum } from '@/lib/format'
import { kindIcon, recordKind } from '@/lib/record-status'
import { cn } from '@/lib/utils'
import { volumeUnit } from '@/lib/venue-ui'
import { useAgentStore } from '@/stores'
import type { AgentRecord } from '../../../../preload/agent-types'

export function DecisionCard({
  row,
  selected = false,
  onClick
}: {
  row: AgentRecord
  selected?: boolean
  onClick?: () => void
}): JSX.Element {
  const venue = useAgentStore((s) => s.config?.venue ?? 'mt5')
  const kind = recordKind(row)
  const volume = row.sizedVolume ?? row.decision?.volume ?? null
  const reasoning = row.decision?.reasoning ?? row.parseError ?? row.riskReason ?? ''
  const unit = volumeUnit(venue)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected ? 'border-primary/60 bg-accent' : 'border-transparent hover:bg-accent/60'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-muted-foreground">
          {formatClock(row.createdAt)}
        </span>
        <ActionBadge action={row.decision?.action ?? 'hold'} />
        {volume != null && (
          <span className="font-mono text-[13px] tabular-nums">
            {formatNum(volume, 2)} {unit}
          </span>
        )}
        <span className="ml-auto text-[15px]">{kindIcon(kind)}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        置信度 {(row.decision?.confidence ?? 0).toFixed(2)}
        {kind === 'sent' ? ' · 已成交' : kind === 'reject' ? ' · 被拒绝' : ''}
      </p>
      <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-foreground/90">{reasoning}</p>
    </button>
  )
}
