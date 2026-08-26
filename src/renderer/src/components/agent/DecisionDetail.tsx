import { useEffect, useState, type JSX, type ReactNode } from 'react'

import { ConfidenceRing } from '@/components/agent/ConfidenceRing'
import { ActionBadge, RiskVerdictBadge } from '@/components/agent/RiskVerdictBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { PnlText } from '@/components/common/PnlText'
import { formatNum, formatTime } from '@/lib/format'
import { isTradeSuccess } from '../../../../preload/mt5-types'
import type { AgentRecord } from '../../../../preload/agent-types'
import type { DecisionSnapshot } from '../../../../preload/snapshot-types'
import { useSnapshotStore } from '@/stores'

export function DecisionDetail({ row }: { row: AgentRecord | null }): JSX.Element {
  const current = useSnapshotStore((s) => s.current)
  const loadById = useSnapshotStore((s) => s.loadById)
  const [snapshot, setSnapshot] = useState<DecisionSnapshot | null>(null)

  useEffect(() => {
    if (!row) {
      setSnapshot(null)
      return
    }
    const ids = [row.promptSnapshotId, row.snapshotId].filter(Boolean)
    if (current && ids.includes(current.meta.snapshotId)) {
      setSnapshot(current)
      return
    }
    setSnapshot(null)
    let cancelled = false
    void loadById(row.promptSnapshotId ?? row.snapshotId).then((found) => {
      if (!cancelled) setSnapshot(found)
    })
    return () => {
      cancelled = true
    }
  }, [row, current, loadById])

  if (!row) {
    return (
      <EmptyState
        title="选择一条决策"
        hint="左侧时间线点击任意记录查看叙事详情"
        className="h-full"
      />
    )
  }

  const sendOk = row.send ? isTradeSuccess(row.send.retcode) : false
  const checkOk = row.check ? row.check.retcode === 0 || isTradeSuccess(row.check.retcode) : null
  const action = row.decision?.action ?? 'hold'
  const confidence = row.decision?.confidence ?? 0
  const reasoning = row.decision?.reasoning ?? row.parseError ?? '—'
  const factors = row.decision?.keyFactors ?? []

  return (
    <div className="flex h-full w-full flex-col overflow-auto p-5">
      <div className="flex items-start gap-3">
        <ActionBadge action={action} />
        <ConfidenceRing value={confidence} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-muted-foreground">
            {formatTime(row.createdAt)} · {row.model}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {row.promptVersion}
            {row.tokens ? ` · ${row.tokens.total} tokens` : ''}
          </p>
        </div>
      </div>

      <Section title="① 它看到了什么">
        {snapshot ? (
          <div className="space-y-1.5 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              价格 {formatNum(snapshot.technical?.price.mid)} · 点差{' '}
              {formatNum(snapshot.technical?.price.spread)} · 新闻 {snapshot.news.length} · 日历{' '}
              {snapshot.calendar.length}
            </p>
            <p>
              趋势 H1 {snapshot.technical?.timeframes.H1?.trend ?? '—'} · H4{' '}
              {snapshot.technical?.timeframes.H4?.trend ?? '—'} · D1{' '}
              {snapshot.technical?.timeframes.D1?.trend ?? '—'}
            </p>
            <details>
              <summary className="cursor-pointer text-[13px] hover:text-foreground">
                查看完整快照 JSON
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-background p-2 text-[13px] leading-relaxed">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <p className="text-[15px] text-muted-foreground">
            快照 #{row.snapshotId.slice(0, 8)} 已不在内存中，仅保留决策记录。
          </p>
        )}
      </Section>

      <Section title="② 它怎么想">
        <p className="text-[15px] leading-relaxed text-foreground">{reasoning}</p>
        {factors.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {factors.map((factor) => (
              <span
                key={factor}
                className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[13px] text-amber-400/90"
              >
                {factor}
              </span>
            ))}
          </div>
        )}
        {row.parseError && <p className="mt-2 text-[13px] text-red-400">解析：{row.parseError}</p>}
      </Section>

      <Section title="③ 风控裁决">
        <RiskVerdictBadge verdict={row.riskVerdict} reason={row.riskReason} />
        {row.sizedVolume != null && (
          <p className="mt-2 text-[15px] text-muted-foreground">
            模型数量 {row.decision?.volume ?? '—'} → 风控覆盖 {row.sizedVolume}
          </p>
        )}
      </Section>

      <Section title="④ 执行结果">
        {row.check && (
          <p className={checkOk ? 'text-[15px] text-emerald-400' : 'text-[15px] text-red-400'}>
            order_check {checkOk ? '通过' : `${row.check.retcode} ${row.check.comment}`}
          </p>
        )}
        {row.send && (
          <p className={sendOk ? 'text-[15px] text-emerald-400' : 'text-[15px] text-red-400'}>
            order_send {row.send.retcode}
            {row.send.price != null ? ` @ ${row.send.price}` : ''}
            {row.send.order != null ? ` · 单 ${row.send.order}` : ''}
            {row.send.deal != null ? ` · 成交 ${row.send.deal}` : ''}
          </p>
        )}
        {row.execution && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {row.execution.status}
            {row.execution.reason ? ` · ${row.execution.reason}` : ''}
          </p>
        )}
        {!row.check && !row.send && !row.execution && (
          <p className="text-[15px] text-muted-foreground">未进入发单流程</p>
        )}
      </Section>

      <Section title="⑤ 后续">
        {row.outcome ? (
          row.outcome.status === 'open' ? (
            <p className="text-[15px] text-sky-400">持仓中 #{row.outcome.positionId ?? '—'}</p>
          ) : (
            <p className="text-[15px]">
              已平仓 {row.outcome.closePrice != null ? `@ ${row.outcome.closePrice}` : ''}{' '}
              <PnlText value={row.outcome.pnl} />
              {row.outcome.closedAt ? ` · ${formatTime(row.outcome.closedAt)}` : ''}
            </p>
          )
        ) : (
          <p className="text-[15px] text-muted-foreground">尚无后续结果</p>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="mt-4 border-t border-border pt-3">
      <h3 className="mb-2 text-[14px] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}
