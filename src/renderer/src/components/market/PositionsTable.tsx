import type { JSX } from 'react'
import { Bot } from 'lucide-react'

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
import { formatNum, formatPrice } from '@/lib/format'
import { volumeLabel, volumeUnit } from '@/lib/venue-ui'
import { useAgentStore, useMarketStore } from '@/stores'
import { AGENT_MAGIC } from '../../../../preload/agent-types'
import type { MarketPositionRow } from '../../../../preload/market-types'

export function PositionsTable({ positions }: { positions: MarketPositionRow[] }): JSX.Element {
  const venue = useAgentStore((s) => s.config?.venue ?? 'mt5')
  const digits = useMarketStore((s) => s.specs?.digits ?? 2)
  const unit = volumeUnit(venue)

  if (positions.length === 0) {
    return <EmptyState title="当前无持仓" hint="Agent 待命中" />
  }

  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className="h-8">单号</TableHead>
          <TableHead className="h-8">方向</TableHead>
          <TableHead className="h-8">{volumeLabel(venue)}</TableHead>
          <TableHead className="h-8">开仓价</TableHead>
          <TableHead className="h-8">浮盈</TableHead>
          <TableHead className="h-8">SL</TableHead>
          <TableHead className="h-8">TP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((pos) => (
          <TableRow key={pos.ticket}>
            <TableCell className="py-1.5 font-mono">
              <span className="inline-flex items-center gap-1">
                {pos.ticket}
                {pos.magic === AGENT_MAGIC && <Bot className="size-3 text-primary" />}
              </span>
            </TableCell>
            <TableCell className={pos.type === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
              {pos.type === 'buy' ? '多' : '空'}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatNum(pos.volume, 2)} {unit}
            </TableCell>
            <TableCell className="tabular-nums">{formatPrice(pos.priceOpen, digits)}</TableCell>
            <TableCell>
              <PnlText value={pos.profit} />
            </TableCell>
            <TableCell className="tabular-nums">
              {pos.sl ? formatPrice(pos.sl, digits) : '—'}
            </TableCell>
            <TableCell className="tabular-nums">
              {pos.tp ? formatPrice(pos.tp, digits) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
