import { useEffect, useRef, useState, type JSX } from 'react'
import { ChevronDown, Lock } from 'lucide-react'
import { toast } from 'sonner'

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HealthDot } from '@/components/common/HealthDot'
import { PnlText } from '@/components/common/PnlText'
import { Segmented } from '@/components/common/Segmented'
import { formatCountdown, formatPrice, formatSignedPct, pnlTone } from '@/lib/format'
import { toastAppliedSwitch } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { assetShortName, feedStatusHint, venueFeedStatus } from '@/lib/venue-ui'
import { useAgentStore, useAppStore, useMarketStore, useNewsStore } from '@/stores'
import { HOLDING_INTERVAL_MS } from '../../../../preload/agent-types'
import { accountModeFromTradeMode } from '../../../../preload/mt5-types'
import { TRADE_ASSETS, type TradeAsset } from '../../../../preload/okx-types'

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
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
  const digits = useMarketStore((s) => s.specs?.digits ?? 2)
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
  const [needOkxKeysOpen, setNeedOkxKeysOpen] = useState(false)
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false)
  const [deskOpen, setDeskOpen] = useState(false)
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
  const venue = config?.venue ?? 'mt5'
  const asset = config?.asset === 'ETH' ? 'ETH' : 'BTC'
  const okxDemo = config?.okx?.demo !== false
  const feed = venueFeedStatus(ready, lastError, priceChangedAt, now)
  const equity = account?.equity ?? null
  const profit = account?.profit ?? null
  const shortSymbol = assetShortName(symbol) === '—' ? asset : assetShortName(symbol)

  useEffect(() => {
    if (mid == null) return
    const prev = prevMid.current
    prevMid.current = mid
    if (prev == null || prev === mid) return
    setFlash(mid > prev ? 'up' : 'down')
    const t = window.setTimeout(() => setFlash(null), 300)
    return () => window.clearTimeout(t)
  }, [mid])

  function applyAsset(next: TradeAsset): void {
    if (next === asset) return
    void saveConfig({ asset: next })
    toastAppliedSwitch(next)
    setDeskOpen(false)
  }

  function applyOkxDemo(next: boolean): void {
    if (next === okxDemo) return
    if (!next) {
      if (!config?.okx?.hasLiveKeys) {
        setNeedOkxKeysOpen(true)
        setDeskOpen(false)
        return
      }
      setLiveConfirmOpen(true)
      setDeskOpen(false)
      return
    }
    void saveConfig({ okxDemo: true })
    toastAppliedSwitch('模拟盘')
    setDeskOpen(false)
  }

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
        if (venue === 'okx' && !config?.okx?.hasKeys) {
          setNeedAccountOpen(true)
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
        className="flex min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
      >
        <span className="text-[15px] font-medium text-muted-foreground">{shortSymbol}</span>
        <span
          className={cn(
            'font-mono text-[20px] font-semibold tabular-nums',
            flash === 'up' && 'text-emerald-400',
            flash === 'down' && 'text-red-400'
          )}
        >
          {formatPrice(mid, digits)}
        </span>
        <span className={cn('text-[15px] tabular-nums', pnlTone(change24h))}>
          {change24h != null && change24h > 0 ? '▲' : change24h != null && change24h < 0 ? '▼' : ''}
          {formatSignedPct(change24h)}
        </span>
      </button>

      <div className="h-6 w-px bg-border" />

      <Popover open={deskOpen} onOpenChange={setDeskOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={saving || !config}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[13px] hover:bg-accent disabled:opacity-50"
          >
            <span className="font-medium">{asset}</span>
            {venue === 'okx' && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className={okxDemo ? 'text-cyan-300' : 'text-red-400'}>
                  {okxDemo ? '模拟' : '实盘'}
                </span>
              </>
            )}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <p className="mb-1.5 text-[11px] text-muted-foreground">交易品种</p>
          <Segmented
            value={asset}
            disabled={saving || !config}
            options={TRADE_ASSETS.map((id) => ({ value: id, label: id }))}
            onChange={applyAsset}
          />
          {venue === 'okx' ? (
            <>
              <p className="mb-1.5 mt-3 text-[11px] text-muted-foreground">盘口</p>
              <Segmented
                value={okxDemo ? 'demo' : 'live'}
                disabled={saving || !config}
                options={[
                  { value: 'demo', label: '模拟盘' },
                  { value: 'live', label: '实盘', danger: true }
                ]}
                onChange={(next) => applyOkxDemo(next === 'demo')}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                切换立刻生效，并会关闭自动交易。
              </p>
            </>
          ) : (
            <p className="mt-3 text-[11px] text-muted-foreground">
              模拟 / 实盘由 MT5 终端登录账户决定。
            </p>
          )}
        </PopoverContent>
      </Popover>

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

      {venue === 'mt5' && <AccountBadge mode={accountMode} />}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[15px] text-muted-foreground"
          >
            <span>{venue === 'okx' ? 'OKX' : 'MT5'}</span>
            <HealthDot status={feed} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{feedStatusHint(feed, lastError)}</TooltipContent>
      </Tooltip>

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

      <AlertDialog open={needOkxKeysOpen} onOpenChange={setNeedOkxKeysOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>尚未配置实盘密钥</AlertDialogTitle>
            <AlertDialogDescription>
              实盘和模拟盘的 API Key 是分开保存的。请先到设置里填写实盘 Key / Secret / Passphrase。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNeedOkxKeysOpen(false)
                setActivePage('settings')
              }}
            >
              去配置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={liveConfirmOpen} onOpenChange={setLiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>切换到 OKX 实盘？</AlertDialogTitle>
            <AlertDialogDescription>
              行情、持仓和下单都会切到真实资金账户。自动交易总闸会关闭，需要重新确认后再打开。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-400"
              onClick={() => {
                void saveConfig({ okxDemo: false })
                toastAppliedSwitch('实盘')
              }}
            >
              确认切到实盘
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={needAccountOpen} onOpenChange={setNeedAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>尚未识别账户类型</AlertDialogTitle>
            <AlertDialogDescription>
              {venue === 'okx'
                ? `请先在设置里填写当前${okxDemo ? '模拟盘' : '实盘'}的 OKX API Key / Secret / Passphrase，并点「测试连接」。等连接成功后再打开自动交易。`
                : '请先打开并登录 MetaTrader 5，等顶栏出现 DEMO 或 REAL 后再打开自动交易。账户切换后总闸也会自动关闭，需要重新确认。'}
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
                ? venue === 'okx'
                  ? '当前是 OKX 实盘。打开后将用真实资金自动下单，可能造成本金亏损。请确认张数、杠杆与风险上限已经设好。'
                  : '当前是 REAL 实盘账户。打开后将用真实资金自动下单，可能造成本金亏损。请确认手数与风险上限已经设好。'
                : venue === 'okx'
                  ? '将同时启动 Agent 决策循环，并允许在当前 OKX 模拟盘自动下单。这是高危操作。'
                  : '将同时启动 Agent 决策循环，并允许在当前 Demo 账户自动下单。这是高危操作。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-black hover:bg-amber-400"
              onClick={() => {
                void saveConfig({ tradingEnabled: true, enabled: true })
                toast.success('自动交易已开启')
              }}
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
  return `$${formatPrice(value, 2)}`
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
