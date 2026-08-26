import { useState, type JSX, type ReactNode } from 'react'

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
import { formatPrice } from '@/lib/format'
import { volumeUnit } from '@/lib/venue-ui'
import {
  fillingFromMode,
  ORDER_TYPE_BUY,
  ORDER_TYPE_SELL,
  TRADE_ACTION_DEAL,
  isTradeSuccess,
  type Mt5TradeRequest
} from '../../../../preload/mt5-types'
import { useAgentStore, useMarketStore } from '@/stores'

type Pending = {
  side: 'buy' | 'sell'
  request: Mt5TradeRequest
  comment: string
}

export function ManualOrderSheet({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const symbol = useMarketStore((s) => s.symbol)
  const price = useMarketStore((s) => s.price)
  const specs = useMarketStore((s) => s.specs)
  const venue = useAgentStore((s) => s.config?.venue ?? 'mt5')
  const okx = useAgentStore((s) => s.config?.okx)
  const digits = specs?.digits ?? 2
  const unit = volumeUnit(venue)
  const contractName = venue === 'okx' ? (okx?.instId || symbol) : symbol
  const [volume, setVolume] = useState('0.01')
  const [sl, setSl] = useState('')
  const [tp, setTp] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  function buildRequest(side: 'buy' | 'sell'): Mt5TradeRequest | null {
    if (!price) return null
    const vol = Number(volume)
    const sln = sl.trim() ? Number(sl) : 0
    const tpn = tp.trim() ? Number(tp) : 0
    if (!Number.isFinite(vol) || vol <= 0) return null
    return {
      action: TRADE_ACTION_DEAL,
      symbol,
      volume: vol,
      type: side === 'buy' ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,
      price: side === 'buy' ? price.ask : price.bid,
      sl: Number.isFinite(sln) ? sln : 0,
      tp: Number.isFinite(tpn) ? tpn : 0,
      deviation: 20,
      type_filling: fillingFromMode(specs?.fillingMode ?? undefined),
      comment: 'manual'
    }
  }

  async function preview(side: 'buy' | 'sell'): Promise<void> {
    const request = buildRequest(side)
    if (!request) {
      setLog(`${unit}或价格无效`)
      return
    }
    setBusy(true)
    setLog(null)
    setPending(null)
    try {
      if (venue === 'okx') {
        if (!okx?.hasKeys) {
          setLog('尚未配置 OKX API Key')
          return
        }
        setPending({ side, request, comment: 'OKX 市价单预览' })
        setLog(
          `预览：${side === 'buy' ? '买' : '卖'} ${volume} ${unit} @ ${formatPrice(side === 'buy' ? price?.ask : price?.bid, digits)} · 确认后发到 OKX`
        )
        return
      }
      const check = await window.api.mt5.order_check(request)
      const ok = check.retcode === 0 || isTradeSuccess(check.retcode)
      if (!ok) {
        setLog(`检查失败 ${check.retcode} ${check.comment}`)
        return
      }
      setPending({ side, request, comment: check.comment || '检查通过' })
      setLog(
        `预览通过：${side === 'buy' ? '买' : '卖'} ${volume} ${unit} @ ${formatPrice(Number(request.price), digits)} · ${check.comment || '可发单'}`
      )
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(): Promise<void> {
    if (!pending) return
    setBusy(true)
    try {
      if (venue === 'okx') {
        const result = await window.api.okx.placeOrder({
          instId: symbol,
          side: pending.side,
          sz: String(pending.request.volume),
          ordType: 'market',
          tdMode: okx?.tdMode ?? 'cross',
          lever: String(okx?.leverage ?? 5),
          sl: pending.request.sl || undefined,
          tp: pending.request.tp || undefined
        })
        setLog(
          result.code === '0'
            ? `已发单 ${result.ordId ?? ''} @ ${result.avgPx ?? ''}`
            : `发单失败 ${result.sCode ?? result.code} ${result.sMsg || result.msg}`
        )
      } else {
        const send = await window.api.mt5.order_send(pending.request)
        setLog(
          isTradeSuccess(send.retcode)
            ? `已发单 ${send.order} @ ${send.price}`
            : `发单失败 ${send.retcode} ${send.comment}`
        )
      }
      setPending(null)
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPending(null)
          setLog(null)
        }
        onOpenChange(next)
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>手动下单</SheetTitle>
          <SheetDescription>
            逃生门 · {contractName} · 单位 {unit}。买 {formatPrice(price?.ask, digits)} / 卖{' '}
            {formatPrice(price?.bid, digits)}
            {venue === 'okx' ? ' · 发到 OKX' : ' · 发到 MT5'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <Field label={`${venue === 'okx' ? '张数' : '手数'}（默认 0.01 ${unit}）`}>
            <Input
              value={volume}
              placeholder={`0.01 ${unit}`}
              onChange={(e) => setVolume(e.target.value)}
            />
          </Field>
          <Field label="止损（空=无）">
            <Input value={sl} onChange={(e) => setSl(e.target.value)} />
          </Field>
          <Field label="止盈（空=无）">
            <Input value={tp} onChange={(e) => setTp(e.target.value)} />
          </Field>
          {log && <p className="text-xs text-muted-foreground">{log}</p>}
        </div>
        <SheetFooter>
          {pending ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
                返回修改
              </Button>
              <Button
                className={
                  pending.side === 'buy'
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                    : 'bg-red-500 text-white hover:bg-red-400'
                }
                disabled={busy}
                onClick={() => void confirm()}
              >
                确认发单
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="text-emerald-400"
                disabled={busy || !price}
                onClick={() => void preview('buy')}
              >
                预览买入
              </Button>
              <Button
                variant="outline"
                className="text-red-400"
                disabled={busy || !price}
                onClick={() => void preview('sell')}
              >
                预览卖出
              </Button>
            </>
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
