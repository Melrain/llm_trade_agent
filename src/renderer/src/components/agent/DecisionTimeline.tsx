import { useMemo, useState, type JSX } from 'react'

import { DecisionCard } from '@/components/agent/DecisionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ScrollArea } from '@/components/ui/scroll-area'
import { matchesFilter, type TimelineFilter } from '@/lib/record-status'
import { cn } from '@/lib/utils'
import type { AgentRecord } from '../../../../preload/agent-types'

const FILTERS: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'open', label: '开仓' },
  { id: 'hold', label: 'hold' },
  { id: 'reject', label: '拒绝' }
]

export function DecisionTimeline({
  records,
  selectedId,
  onSelect
}: {
  records: AgentRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const rows = useMemo(() => records.filter((r) => matchesFilter(r, filter)), [records, filter])

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              'rounded-md px-2 py-1 text-xs',
              filter === item.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <EmptyState title="暂无决策" hint="填入 API key 后在右上角立即决策一次" className="m-3" />
        ) : (
          <div className="space-y-1 p-2">
            {rows.map((row, i) => (
              <div
                key={row.id}
                className={i === 0 ? 'animate-in fade-in slide-in-from-top-2' : undefined}
              >
                <DecisionCard
                  row={row}
                  selected={row.id === selectedId}
                  onClick={() => onSelect(row.id)}
                />
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
