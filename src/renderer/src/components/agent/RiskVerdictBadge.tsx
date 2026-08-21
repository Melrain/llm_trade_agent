import type { JSX } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentRiskVerdict } from '../../../../preload/agent-types'

export function RiskVerdictBadge({
  verdict,
  reason
}: {
  verdict: AgentRiskVerdict
  reason?: string | null
}): JSX.Element {
  if (verdict === 'pass') {
    return (
      <Badge className="rounded-md border-transparent bg-emerald-500/15 text-[11px] text-emerald-400">
        风控通过
      </Badge>
    )
  }
  return (
    <Badge className="rounded-md border-transparent bg-red-500 text-[11px] text-white">
      风控拒绝{reason ? ` · ${reason}` : ''}
    </Badge>
  )
}

export function ActionBadge({ action }: { action: string }): JSX.Element {
  const meta =
    action === 'open_buy'
      ? { label: '开多', className: 'bg-emerald-500/15 text-emerald-400' }
      : action === 'open_sell'
        ? { label: '开空', className: 'bg-red-500/15 text-red-400' }
        : action === 'close_position'
          ? { label: '平仓', className: 'bg-muted text-muted-foreground' }
          : action === 'adjust_sltp'
            ? { label: '改止损止盈', className: 'bg-amber-500/15 text-amber-400' }
            : { label: '观望', className: 'bg-muted text-muted-foreground' }
  return (
    <Badge className={cn('rounded-md border-transparent text-[11px]', meta.className)}>
      {meta.label}
    </Badge>
  )
}
