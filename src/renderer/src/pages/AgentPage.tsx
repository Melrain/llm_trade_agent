import { useEffect, useMemo, useState, type JSX } from 'react'
import { RefreshCw } from 'lucide-react'

import { DecisionDetail } from '@/components/agent/DecisionDetail'
import { DecisionTimeline } from '@/components/agent/DecisionTimeline'
import { Button } from '@/components/ui/button'
import { useAgentStore, useAppStore } from '@/stores'

export function AgentPage(): JSX.Element {
  const records = useAgentStore((s) => s.records)
  const running = useAgentStore((s) => s.running)
  const error = useAgentStore((s) => s.error)
  const config = useAgentStore((s) => s.config)
  const run = useAgentStore((s) => s.run)
  const focusRecordId = useAppStore((s) => s.focusRecordId)
  const clearFocusRecord = useAppStore((s) => s.clearFocusRecord)

  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id ?? null)

  useEffect(() => {
    if (focusRecordId) {
      setSelectedId(focusRecordId)
      clearFocusRecord()
    }
  }, [focusRecordId, clearFocusRecord])

  useEffect(() => {
    if (selectedId && records.some((r) => r.id === selectedId)) return
    setSelectedId(records[0]?.id ?? null)
  }, [records, selectedId])

  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <h1 className="text-[15px] font-semibold">决策时间线</h1>
        <div className="flex items-center gap-2">
          {error && <span className="max-w-xs truncate text-sm text-red-400">{error}</span>}
          {!config?.hasApiKey && (
            <span className="text-[13px] text-amber-400">请先在设置中配置 API Key</span>
          )}
          <Button
            size="sm"
            className="h-8 text-[13px]"
            disabled={running || !config?.hasApiKey}
            onClick={() => void run()}
          >
            <RefreshCw className={running ? 'size-4 animate-spin' : 'size-4'} />
            {running ? '决策中…' : '立即决策一次'}
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.618fr_1fr]">
        <div className="flex h-full min-h-0 min-w-0 flex-col border-r border-border">
          <DecisionTimeline records={records} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <DecisionDetail row={selected} />
        </div>
      </div>
    </div>
  )
}
