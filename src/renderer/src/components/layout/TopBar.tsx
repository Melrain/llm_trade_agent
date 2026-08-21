import { useEffect, useRef, useState, type JSX } from 'react'
import { Lock } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HealthDot } from '@/components/common/HealthDot'
import { PnlText } from '@/components/common/PnlText'
import { formatCountdown, formatNum, formatSignedPct, isWeekend, pnlTone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAgentStore, useAppStore, useMarketStore, useNewsStore } from '@/stores'
import { HOLDING_INTERVAL_MS } from '../../../../preload/agent-types'
import { accountModeFromTradeMode } from '../../../../preload/mt5-types'

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function mt5Status(
  ready: boolean,
  lastError: string | null,
  priceChangedAt: number | null,
  now: number
): 'ok' | 'degraded' | 'error' | 'idle' {
  if (lastError) return 'error'
  if (!ready) return 'idle'
  if (priceChangedAt != null && now - priceChangedAt < 10_000) return 'ok'
  if (isWeekend()) return 'idle'
  return 'degraded'
}

export function TopBar(): JSX.Element {
  const now = useNow()
  const setActivePage = useAppStore((s) => s.setActivePage)
  const symbol = useMarketStore((s) => s.symbol)
  const price = useMarketStore((s) => s.price)
  const account = useMarketStore((s) => s.account)
  const positions = useMarketStore((s) => s.positions)
  const ready = useMarketStore((s) => s.ready)
  const lastError = useMarketStore((s) => s.lastError)
  const priceChangedAt = useMarketStore((s) => s.priceChangedAt)
  const h1 = useMarketStore((s) => s.timeframes.H1)
  const config = useAgentStore((s) => s.config)
  const records = useAgentStore((s) => s.records)
  const saving = useAgentStore((s) => s.saving)
  const running = useAgentStore((s) => s.running)
  const saveConfig = useAgentStore((s) => s.saveConfig)
  const calendar = useNewsStore((s) => s.calendar)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [needKeyOpen, setNeedKeyOpen] = useState(false)
  const [needAccountOpen, setNeedAccountOpen] = useState(false)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prevMid = useRef<number | null>(null)

  const mid = price?.mid ?? null
  const change24h = h1?.pctChange24h ?? null
  const liveMode = accountModeFromTradeMode(account?.tradeMode)
  const accountMode = liveMode !== 'unknown' ? liveMode : (config?.accountMode ?? 'unknown')
  const enabled = config?.enabled ?? false
  const tradingEnabled = config?.tradingEnabled ?? false
  const lastDecision = records[0] ?? null
  const intervalMs = config?.intervalMs ?? 15 * 60 * 1000
  const effectiveMs = positions.length > 0 ? Math.min(HOLDING_INTERVAL_MS, intervalMs) : intervalMs
  const remainMs =
    enabled && lastDecision ? Date.parse(lastDecision.createdAt) + effectiveMs - now : 0
  const haltWindow = calendar.some((ev) => ev.impact === 'high' && ev.soon)
  const mt5 = mt5Status(ready, lastError, priceChangedAt, now)
  const equity = account?.equity ?? null
  const profit = account?.profit ?? null

  useEffect(() => {
    if (mid == null) return
    const prev = prevMid.current
    prevMid.current = mid
    if (prev == null || prev === mid) return
    setFlash(mid > prev ? 'up' : 'down')
    const t = window.setTimeout(() => setFlash(null), 300)
    return () => window.clearTimeout(t)
  }, [mid])

  const tradingSwitch = (
    <Switch
      size="sm"
      checked={tradingEnabled}
      disabled={saving || !config}
      className={cn(tradingEnabled && 'data-[state=checked]:bg-amber-500')}
      onCheckedChange={(on) => {
        if (!on) {
          void saveConfig({ tradingEnabled: false })
          return
        }
        if (!config?.hasApiKey) {
          setNeedKeyOpen(true)
          return
        }
        if (accountMode === 'unknown') {
          setNeedAccountOpen(true)
          return
        }
        setConfirmOpen(true)
      }}
    />
  )

  return (
    <header className="flex h-16 shrink-0 items-center gap-3.5 border-b border-border bg-card px-4">
      <button
        type="button"
        onClick={() => setActivePage('chart')}
        className="flex min-w-[196px] items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
      >
        <span className="text-[15px] font-medium text-muted-foreground">{symbol}</span>
        <span
          className={cn(
            'font-mono text-[20px] font-semibold tabular-nums',
            flash === 'up' && 'text-emerald-400',
            flash === 'down' && 'text-red-400'
          )}
        >
          {formatNum(mid)}
        </span>
        <span className={cn('text-[15px] tabular-nums', pnlTone(change24h))}>
          {change24h != null && change24h > 0 ? '▲' : change24h != null && change24h < 0 ? '▼' : ''}
          {formatSignedPct(change24h)}
        </span>
      </button>

      <div className="h-6 w-px bg-border" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <HealthDot status={enabled ? 'ok' : 'idle'} pulse={enabled} className="size-2.5" />
        <span className="text-[17px] text-foreground">
          {running ? '决策中' : enabled ? 'Agent 运行中' : 'Agent 已停止'}
        </span>
        {enabled && lastDecision && (
          <span className="text-[15px] text-muted-foreground">
            · 下次决策 {remainMs > 0 ? formatCountdown(remainMs) : '即将'}
          </span>
        )}
        {enabled && !lastDecision && (
          <span className="text-[15px] text-muted-foreground">· 等待首次决策</span>
        )}
        {haltWindow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex text-amber-400">
                <Lock className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent>高影响事件窗口，暂停开仓</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-[15px] font-medium',
            tradingEnabled ? 'text-amber-400' : 'text-muted-foreground'
          )}
        >
          {tradingEnabled ? '实弹' : '自动交易'}
        </span>
        {tradingSwitch}
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-2">
        <span className="text-[15px] text-muted-foreground">净值</span>
        <span className="font-mono text-[17px] font-medium tabular-nums">
          {formatMoneyish(equity)}
        </span>
        <PnlText value={profit} withIcon className="text-[15px]" />
      </div>

      <AccountBadge mode={accountMode} />

      <div className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
        <span>MT5</span>
        <HealthDot status={mt5} />
      </div>

      <AlertDialog open={needKeyOpen} onOpenChange={setNeedKeyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>尚未配置 API Key</AlertDialogTitle>
            <AlertDialogDescription>
              没有 API Key 无法调用模型，自动交易无法启动。请先到设置中填写。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNeedKeyOpen(false)
                setActivePage('settings')
              }}
            >
              去配置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={needAccountOpen} onOpenChange={setNeedAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>尚未识别账户类型</AlertDialogTitle>
            <AlertDialogDescription>
              请先打开并登录 MetaTrader 5，等顶栏出现 DEMO 或 REAL
              后再打开自动交易。账户切换后总闸也会自动关闭，需要重新确认。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNeedAccountOpen(false)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>打开自动交易总闸？</AlertDialogTitle>
            <AlertDialogDescription>
              {accountMode === 'real'
                ? '当前是 REAL 实盘账户。打开后将用真实资金自动下单，可能造成本金亏损。请确认手数与风险上限已经设好。'
                : '将同时启动 Agent 决策循环，并允许在当前 Demo 账户自动下单。这是高危操作。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-black hover:bg-amber-400"
              onClick={() => void saveConfig({ tradingEnabled: true, enabled: true })}
            >
              确认开启
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}

function formatMoneyish(value: number | null): string {
  if (value == null) return '—'
  return `$${formatNum(value)}`
}

function AccountBadge({ mode }: { mode: 'demo' | 'real' | 'unknown' }): JSX.Element {
  if (mode === 'real') {
    return (
      <Badge className="rounded-md border-transparent bg-red-500 px-2 text-[14px] text-white">
        REAL
      </Badge>
    )
  }
  if (mode === 'demo') {
    return (
      <Badge
        variant="outline"
        className="rounded-md border-cyan-400/80 px-2 text-[14px] text-cyan-300"
      >
        DEMO
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="rounded-md px-2 text-[14px] text-muted-foreground">
      未知
    </Badge>
  )
}
