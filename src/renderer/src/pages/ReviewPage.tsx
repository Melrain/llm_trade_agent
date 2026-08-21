import { useMemo, type JSX, type ReactNode } from 'react'

import { PriceChart } from '@/components/chart/PriceChart'
import { EmptyState } from '@/components/common/EmptyState'
import { PnlText } from '@/components/common/PnlText'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatNum, formatTime } from '@/lib/format'
import { useAgentStore } from '@/stores'

export function ReviewPage(): JSX.Element {
  const stats = useAgentStore((s) => s.stats)
  const records = useAgentStore((s) => s.records)

  const closed = useMemo(
    () =>
      records
        .filter((r) => r.outcome?.status === 'closed' && r.outcome.pnl != null)
        .slice()
        .reverse(),
    [records]
  )

  const curve = useMemo(() => {
    let acc = 0
    return closed.map((r) => {
      acc += r.outcome?.pnl ?? 0
      return { time: Math.floor(Date.parse(r.outcome?.closedAt ?? r.createdAt) / 1000), value: acc }
    })
  }, [closed])

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="grid grid-cols-5 gap-3">
        <Kpi label="总决策" value={String(stats?.totalDecisions ?? 0)} />
        <Kpi
          label="胜率"
          value={stats?.winRate == null ? '—' : `${Math.round(stats.winRate * 100)}%`}
        />
        <Kpi
          label="盈亏比"
          value={stats?.profitFactor == null ? '—' : String(stats.profitFactor)}
        />
        <Kpi label="总盈亏" value={<PnlText value={stats?.totalPnl} className="text-[15px]" />} />
        <Kpi label="Token" value={(stats?.totalTokens ?? 0).toLocaleString()} />
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-[13px] font-semibold">累计盈亏</h2>
        <div className="mt-2 h-48">
          {curve.length >= 2 ? (
            <PriceChart kind="area" area={curve} />
          ) : (
            <EmptyState title="平仓后才会出现盈亏曲线" className="h-full" />
          )}
        </div>
      </section>

      <section className="min-h-0 flex-1 rounded-lg border border-border bg-card p-4">
        <Tabs defaultValue="closed">
          <TabsList>
            <TabsTrigger value="closed">已平仓</TabsTrigger>
            <TabsTrigger value="prompt" disabled>
              按 Prompt（预留）
            </TabsTrigger>
            <TabsTrigger value="scatter" disabled>
              置信度散点（预留）
            </TabsTrigger>
          </TabsList>
          <TabsContent value="closed" className="mt-3">
            {closed.length === 0 ? (
              <EmptyState title="还没有已平仓交易" />
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8">时间</TableHead>
                    <TableHead className="h-8">方向</TableHead>
                    <TableHead className="h-8">手数</TableHead>
                    <TableHead className="h-8">开仓</TableHead>
                    <TableHead className="h-8">平仓</TableHead>
                    <TableHead className="h-8">盈亏</TableHead>
                    <TableHead className="h-8">置信度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closed.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="py-1.5">
                        {formatTime(row.outcome?.closedAt ?? row.createdAt)}
                      </TableCell>
                      <TableCell
                        className={
                          row.decision?.action === 'open_buy' ? 'text-emerald-400' : 'text-red-400'
                        }
                      >
                        {row.decision?.action === 'open_buy' ? '多' : '空'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatNum(row.sizedVolume ?? row.decision?.volume)}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNum(row.send?.price)}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatNum(row.outcome?.closePrice)}
                      </TableCell>
                      <TableCell>
                        <PnlText value={row.outcome?.pnl} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {(row.decision?.confidence ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1 font-mono text-[15px] font-medium">{value}</div>
    </div>
  )
}
