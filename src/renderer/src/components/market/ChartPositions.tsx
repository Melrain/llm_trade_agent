import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { toast } from 'sonner'

import { PnlText } from '@/components/common/PnlText'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { formatNum } from '@/lib/format'
import { AGENT_MAGIC } from '../../../../preload/agent-types'
import type { MarketPositionRow } from '../../../../preload/market-types'
import {
  fillingFromMode,
  isTradeSuccess,
  ORDER_TIME_GTC,
  ORDER_TYPE_BUY,
  ORDER_TYPE_SELL,
  TRADE_ACTION_DEAL,
  TRADE_ACTION_SLTP,
  type Mt5TradeRequest
} from '../../../../preload/mt5-types'
import { useAgentStore, useMarketStore } from '@/stores'

function okxPosSide(type: MarketPositionRow['type']): 'long' | 'short' {
  return type === 'buy' ? 'long' : 'short'
}

export function ChartPositions(): JSX.Element {
  const positions = useMarketStore((s) => s.positions)
  const [closeTarget, setCloseTarget] = useState<MarketPositionRow | null>(null)
  const [sltpTarget, setSltpTarget] = useState<MarketPositionRow | null>(null)

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium text-muted-foreground">持仓（逃生门）</h3>
      {positions.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">当前无持仓</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {positions.map((pos) => (
            <li key={pos.ticket} className="rounded-md border border-border px-2 py-2">
              <div className="flex items-center gap-1.5 text-[13px]">
                <span className="font-mono text-xs text-muted-foreground">#{pos.ticket}</span>
                {pos.magic === AGENT_MAGIC && <Bot className="size-3 text-primary" />}
                <span className={pos.type === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                  {pos.type === 'buy' ? '多' : '空'}
                </span>
                <span className="font-mono tabular-nums">{formatNum(pos.volume, 2)}</span>
                <span className="ml-auto">
                  <PnlText value={pos.profit} />
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                开 {formatNum(pos.priceOpen)} · SL {pos.sl ? formatNum(pos.sl) : '—'} · TP{' '}
                {pos.tp ? formatNum(pos.tp) : '—'}
              </p>
              <div className="mt-2 flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setSltpTarget(pos)}
                >
                  止盈止损
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="text-red-400"
                  onClick={() => setCloseTarget(pos)}
                >
                  平仓
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ClosePositionDialog position={closeTarget} onDone={() => setCloseTarget(null)} />
      <ModifySltpSheet position={sltpTarget} onDone={() => setSltpTarget(null)} />
    </section>
  )
}

function ClosePositionDialog({
  position,
  onDone
}: {
  position: MarketPositionRow | null
  onDone: () => void
}): JSX.Element {
  const symbol = useMarketStore((s) => s.symbol)
  const price = useMarketStore((s) => s.price)
  const specs = useMarketStore((s) => s.specs)
  const tradingEnabled = useAgentStore((s) => s.config?.tradingEnabled ?? false)
  const venue = useAgentStore((s) => s.config?.venue ?? 'mt5')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)

  useEffect(() => {
    setLog(null)
    setBusy(false)
  }, [position?.ticket])

  async function confirm(): Promise<void> {
    if (!position) {
      setLog('没有持仓')
      return
    }
    if (venue !== 'okx' && !price) {
      setLog('没有可用报价')
      return
    }
    setBusy(true)
    setLog(null)
    try {
      if (venue === 'okx') {
        const result = await window.api.okx.closePosition(symbol, okxPosSide(position.type))
        if (result.code !== '0') {
          setLog(`平仓失败 ${result.sCode ?? result.code} ${result.sMsg || result.msg}`)
          return
        }
        toast.success(`已平仓 ${symbol}`, { description: result.ordId ?? 'close-position' })
        onDone()
        return
      }
      const buy = position.type === 'buy'
      const request: Mt5TradeRequest = {
        action: TRADE_ACTION_DEAL,
        symbol,
        volume: position.volume,
        price: buy ? price.bid : price.ask,
        deviation: 20,
        type: buy ? ORDER_TYPE_SELL : ORDER_TYPE_BUY,
        type_filling: fillingFromMode(specs?.fillingMode ?? undefined),
        type_time: ORDER_TIME_GTC,
        position: position.ticket,
        comment: 'manual-close'
      }
      const check = await window.api.mt5.order_check(request)
      const checkOk = check.retcode === 0 || isTradeSuccess(check.retcode)
      if (!checkOk) {
        setLog(`检查失败 ${check.retcode} ${check.comment}`)
        return
      }
      const send = await window.api.mt5.order_send(request)
      if (!isTradeSuccess(send.retcode)) {
        setLog(`发单失败 ${send.retcode} ${send.comment}`)
        return
      }
      toast.success(`已平仓 #${position.ticket}`, { description: `@ ${send.price}` })
      onDone()
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const agentPos = position?.magic === AGENT_MAGIC

  return (
    <AlertDialog open={position != null} onOpenChange={(open) => !open && !busy && onDone()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认平仓 #{position?.ticket}</AlertDialogTitle>
          <AlertDialogDescription>
            {position
              ? `${position.type === 'buy' ? '多' : '空'} ${formatNum(position.volume, 2)} ${venue === 'okx' ? '张' : '手'}，浮盈 ${formatNum(position.profit)}。这是手动逃生门，不会走 Agent 风控。`
              : ''}
            {tradingEnabled && agentPos
              ? ' 自动交易总闸仍开着，下个周期 Agent 可能把仓再开回来。'
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {log && <p className="text-xs text-red-400">{log}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy || (venue !== 'okx' && !price)}
            onClick={() => void confirm()}
          >
            {busy ? '平仓中…' : '确认平仓'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ModifySltpSheet({
  position,
  onDone
}: {
  position: MarketPositionRow | null
  onDone: () => void
}): JSX.Element {
  const symbol = useMarketStore((s) => s.symbol)
  const specs = useMarketStore((s) => s.specs)
  const venue = useAgentStore((s) => s.config?.venue ?? 'mt5')
  const [sl, setSl] = useState('')
  const [tp, setTp] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [pending, setPending] = useState<Mt5TradeRequest | null>(null)

  useEffect(() => {
    if (!position) return
    setSl(position.sl ? String(position.sl) : '')
    setTp(position.tp ? String(position.tp) : '')
    setLog(null)
    setPending(null)
    setBusy(false)
  }, [position])

  function parsePrice(raw: string): number {
    const n = raw.trim() ? Number(raw) : 0
    return Number.isFinite(n) ? roundDigits(n, specs?.digits ?? 2) : 0
  }

  function buildRequest(): Mt5TradeRequest | null {
    if (!position) return null
    return {
      action: TRADE_ACTION_SLTP,
      symbol,
      sl: parsePrice(sl),
      tp: parsePrice(tp),
      position: position.ticket,
      comment: 'manual-sltp'
    }
  }

  async function preview(): Promise<void> {
    if (venue === 'okx') {
      if (!position) return
      setBusy(true)
      setLog(null)
      setPending(null)
      const nextSl = parsePrice(sl)
      const nextTp = parsePrice(tp)
      setLog(
        `预览：SL ${nextSl ? formatNum(nextSl) : '清除'} / TP ${nextTp ? formatNum(nextTp) : '清除'} · 确认后改 OKX 条件单`
      )
      setPending({
        action: TRADE_ACTION_SLTP,
        symbol,
        sl: nextSl,
        tp: nextTp,
        position: position.ticket,
        comment: 'manual-sltp'
      })
      setBusy(false)
      return
    }
    const request = buildRequest()
    if (!request) return
    setBusy(true)
    setLog(null)
    setPending(null)
    try {
      const check = await window.api.mt5.order_check(request)
      const ok = check.retcode === 0 || isTradeSuccess(check.retcode)
      if (!ok) {
        setLog(`检查失败 ${check.retcode} ${check.comment}`)
        return
      }
      setPending(request)
      setLog(`预览通过：SL ${formatNum(request.sl || null)} / TP ${formatNum(request.tp || null)}`)
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(): Promise<void> {
    if (!pending || !position) return
    setBusy(true)
    try {
      if (venue === 'okx') {
        const result = await window.api.okx.amendSlTp({
          instId: symbol,
          sl: pending.sl || undefined,
          tp: pending.tp || undefined,
          sz: String(position.volume),
          side: position.type === 'buy' ? 'sell' : 'buy',
          posSide: okxPosSide(position.type)
        })
        if (result.code !== '0') {
          setLog(`修改失败 ${result.sCode ?? result.code} ${result.sMsg || result.msg}`)
          return
        }
        toast.success(`已改 ${symbol} 止盈止损`)
        onDone()
        return
      }
      const send = await window.api.mt5.order_send(pending)
      if (!isTradeSuccess(send.retcode)) {
        setLog(`修改失败 ${send.retcode} ${send.comment}`)
        return
      }
      toast.success(`已改 #${position.ticket} 止盈止损`)
      onDone()
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={position != null} onOpenChange={(open) => !open && !busy && onDone()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>改止盈止损 #{position?.ticket}</SheetTitle>
          <SheetDescription>空表示清除该价位。先检查再提交。</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <Field label="止损">
            <Input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="无" />
          </Field>
          <Field label="止盈">
            <Input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="无" />
          </Field>
          {log && <p className="text-xs text-muted-foreground">{log}</p>}
        </div>
        <SheetFooter>
          {pending ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
                返回修改
              </Button>
              <Button disabled={busy} onClick={() => void confirm()}>
                {busy ? '提交中…' : '确认修改'}
              </Button>
            </>
          ) : (
            <Button disabled={busy || !position} onClick={() => void preview()}>
              {busy ? '检查中…' : '预览修改'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </label>
  )
}

function roundDigits(value: number, digits: number): number {
  const p = 10 ** Math.max(0, Math.round(digits))
  return Math.round(value * p) / p
}
