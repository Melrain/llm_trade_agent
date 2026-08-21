import { useMemo, type JSX, type ReactNode } from 'react'

import { DecisionCard } from '@/components/agent/DecisionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { PnlText } from '@/components/common/PnlText'
import { PriceChart } from '@/components/chart/PriceChart'
import { PositionsTable } from '@/components/market/PositionsTable'
import { formatCountdown, formatMoney, formatNum, formatTokenCost } from '@/lib/format'
import { isToday, recordKind } from '@/lib/record-status'
import { cn } from '@/lib/utils'
import { useAgentStore, useAppStore, useMarketStore, useSnapshotStore } from '@/stores'

const DAILY_LOSS_LIMIT = 0.03

export function DashboardPage(): JSX.Element {
  const equitySamples = useMarketStore((s) => s.equitySamples)
  const account = useMarketStore((s) => s.account)
  const positions = useMarketStore((s) => s.positions)
  const records = useAgentStore((s) => s.records)
  const stats = useAgentStore((s) => s.stats)
  const config = useAgentStore((s) => s.config)
  const snapshot = useSnapshotStore((s) => s.current)
  const openAgentRecord = useAppStore((s) => s.openAgentRecord)

  const latest = records[0] ?? null
  const today = useMemo(() => records.filter((r) => isToday(r.createdAt)), [records])
  const todayOpen = today.filter(
    (r) => r.decision?.action === 'open_buy' || r.decision?.action === 'open_sell'
  )
  const todayHold = today.filter((r) => r.decision?.action === 'hold')
  const todayReject = today.filter((r) => recordKind(r) === 'reject')
  const promptTokens = today.reduce((s, r) => s + (r.tokens?.prompt ?? 0), 0)
  const completionTokens = today.reduce((s, r) => s + (r.tokens?.completion ?? 0), 0)
  const totalTokens = today.reduce((s, r) => s + (r.tokens?.total ?? 0), 0)

  const dailyPnl = snapshot?.account?.dailyPnl ?? null
  const equity = account?.equity ?? 0
  const usedLoss = dailyPnl != null && dailyPnl < 0 ? Math.abs(dailyPnl) : 0
  const limit = equity * DAILY_LOSS_LIMIT
  const usedPct = equity > 0 ? (usedLoss / equity) * 100 : 0
  const barPct = limit > 0 ? Math.min(100, (usedLoss / limit) * 100) : 0

  const tradingLive = config?.tradingEnabled ?? false
  const remainMs =
    config?.enabled && latest
      ? Date.parse(latest.createdAt) + (config.intervalMs ?? 0) - Date.now()
      : null

  const area = equitySamples.map((s) => ({ time: Math.floor(s.t / 1000), value: s.v }))

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-cols-12 grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4',
        tradingLive && 'dashboard-live'
      )}
    >
      <section className="col-span-7 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4">
        <div className="flex h-5 shrink-0 items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold">净值</h2>
          {tradingLive && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="dashboard-live-dot size-1.5 rounded-full bg-amber-400" />
              自动交易中
            </div>
          )}
        </div>
        <div className="mt-3 grid shrink-0 grid-cols-4 gap-3">
          <Metric label="余额" value={formatMoney(account?.balance)} />
          <Metric label="净值" value={formatMoney(account?.equity)} />
          <Metric label="浮盈" value={<PnlText value={account?.profit} />} />
          <Metric label="今日盈亏" value={<PnlText value={dailyPnl} />} />
        </div>
        <div className="mt-3 min-h-0 flex-1">
          {area.length >= 2 ? (
            <PriceChart kind="area" area={area} />
          ) : (
            <EmptyState
              title="净值曲线将在运行后出现"
              hint="MVP 用当日净值采样，打开应用后会自动记录"
              className="h-full"
            />
          )}
        </div>
      </section>

      <section className="col-span-5 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4">
        <h2 className="h-5 shrink-0 text-[13px] font-semibold">最新决策</h2>
        <div className="mt-2 min-h-0 flex-1 overflow-auto">
          {latest ? (
            <DecisionCard row={latest} onClick={() => openAgentRecord(latest.id)} />
          ) : (
            <EmptyState
              title="Agent 待命中"
              hint={
                remainMs != null && remainMs > 0
                  ? `下个周期 ${formatCountdown(remainMs)}`
                  : '还没有决策记录'
              }
              className="h-full"
            />
          )}
        </div>
      </section>

      <section className="col-span-7 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 h-5 shrink-0 text-[13px] font-semibold">当前持仓</h2>
        <div className="min-h-0 flex-1 overflow-auto">
          <PositionsTable positions={positions} />
        </div>
      </section>

      <section className="col-span-5 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4">
        <h2 className="h-5 shrink-0 text-[13px] font-semibold">今日概览</h2>
        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <Stat label="决策次数" value={String(today.length)} />
            <Stat label="开仓" value={String(todayOpen.length)} />
            <Stat label="hold" value={String(todayHold.length)} />
            <Stat label="拒绝" value={String(todayReject.length)} />
            <Stat label="Token" value={totalTokens.toLocaleString()} />
            <Stat label="估算成本" value={formatTokenCost(promptTokens, completionTokens)} />
          </dl>
          {stats && stats.totalDecisions > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              累计 {stats.totalDecisions} 次 · 已发单 {stats.sentCount}
            </p>
          )}
        </div>
      </section>

      <section className="col-span-12 shrink-0 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between text-[13px]">
          <h2 className="font-semibold">风险水位</h2>
          <span className="tabular-nums text-muted-foreground">
            {usedPct.toFixed(1)}% / {(DAILY_LOSS_LIMIT * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-amber-500" style={{ width: `${barPct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          当日已用风险 {formatNum(usedLoss)} / 日亏上限 {formatNum(limit)}（净值 3%）
        </p>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-mono text-[15px] font-medium">{value}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  )
}
