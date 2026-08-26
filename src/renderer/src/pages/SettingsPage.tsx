import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'

import { Segmented } from '@/components/common/Segmented'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toastAppliedSwitch } from '@/lib/notify'
import { useAgentStore, useNewsStore, usePmStore } from '@/stores'
import { TRADE_ASSETS, type TradeAsset, type TradeVenue } from '../../../preload/okx-types'
import type { UpdaterStatus } from '../../../preload/updater-types'

const INTERVALS = [
  { value: String(15 * 60 * 1000), label: '15 分钟' },
  { value: String(30 * 60 * 1000), label: '30 分钟' },
  { value: String(60 * 60 * 1000), label: '1 小时' }
]

export function SettingsPage(): JSX.Element {
  const config = useAgentStore((s) => s.config)
  const saving = useAgentStore((s) => s.saving)
  const error = useAgentStore((s) => s.error)
  const saveConfig = useAgentStore((s) => s.saveConfig)
  const quotes = usePmStore((s) => s.quotes)
  const refreshPm = usePmStore((s) => s.refresh)
  const feeds = useNewsStore((s) => s.feeds)
  const loadFeeds = useNewsStore((s) => s.loadFeeds)
  const refreshNews = useNewsStore((s) => s.refresh)

  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState('0.2')
  const [intervalMs, setIntervalMs] = useState(String(15 * 60 * 1000))
  const [enabled, setEnabled] = useState(false)
  const [maxVolume, setMaxVolume] = useState('0.1')
  const [riskPct, setRiskPct] = useState('1')
  const [fixedVolume, setFixedVolume] = useState('')
  const [section, setSection] = useState<'llm' | 'decision' | 'risk' | 'venue' | 'data' | 'about'>(
    () => {
      if (sessionStorage.getItem('settings-section') !== 'about') return 'llm'
      sessionStorage.removeItem('settings-section')
      return 'about'
    }
  )
  const [venue, setVenue] = useState<TradeVenue>('mt5')
  const [okxLeverage, setOkxLeverage] = useState('5')
  const [okxTdMode, setOkxTdMode] = useState<'cross' | 'isolated'>('cross')
  const [okxApiKey, setOkxApiKey] = useState('')
  const [okxSecret, setOkxSecret] = useState('')
  const [okxPassphrase, setOkxPassphrase] = useState('')
  const [okxTest, setOkxTest] = useState<string | null>(null)
  const [okxTesting, setOkxTesting] = useState(false)
  const [liveConfirm, setLiveConfirm] = useState(false)
  const [update, setUpdate] = useState<UpdaterStatus | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)

  useEffect(() => {
    void loadFeeds()
  }, [loadFeeds])

  useEffect(() => {
    void window.api.updater.getStatus().then(setUpdate)
    return window.api.updater.onStatus(setUpdate)
  }, [])

  useEffect(() => {
    const openAbout = (): void => {
      sessionStorage.removeItem('settings-section')
      setSection('about')
    }
    window.addEventListener('lla-open-about', openAbout)
    return () => window.removeEventListener('lla-open-about', openAbout)
  }, [])

  useEffect(() => {
    if (!config) return
    /* eslint-disable react-hooks/set-state-in-effect -- 用已保存配置回填受控表单 */
    setBaseUrl(config.baseUrl)
    setModel(config.model)
    setTemperature(String(config.temperature))
    setIntervalMs(String(config.intervalMs))
    setEnabled(config.enabled)
    setMaxVolume(String(config.maxVolume))
    setRiskPct(String(Math.round(config.riskPct * 1000) / 10))
    setFixedVolume(config.fixedVolume == null ? '' : String(config.fixedVolume))
    setVenue(config.venue ?? 'mt5')
    setOkxLeverage(String(config.okx?.leverage ?? 5))
    setOkxTdMode(config.okx?.tdMode === 'isolated' ? 'isolated' : 'cross')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [config])

  const asset = config?.asset === 'ETH' ? 'ETH' : 'BTC'
  const okxDemo = config?.okx?.demo !== false
  const hasDemoKeys = Boolean(config?.okx?.hasDemoKeys)
  const hasLiveKeys = Boolean(config?.okx?.hasLiveKeys)
  const currentSlotSaved = okxDemo ? hasDemoKeys : hasLiveKeys

  const dirty = useMemo(() => {
    if (!config) return false
    const fixed = fixedVolume.trim() === '' ? null : Number(fixedVolume)
    return (
      baseUrl !== config.baseUrl ||
      model !== config.model ||
      apiKey.trim() !== '' ||
      Number(temperature) !== config.temperature ||
      Number(intervalMs) !== config.intervalMs ||
      enabled !== config.enabled ||
      Number(maxVolume) !== config.maxVolume ||
      Number(riskPct) / 100 !== config.riskPct ||
      (fixed ?? null) !== (config.fixedVolume ?? null) ||
      Number(okxLeverage) !== (config.okx?.leverage ?? 5) ||
      okxTdMode !== (config.okx?.tdMode ?? 'cross') ||
      okxApiKey.trim() !== '' ||
      okxSecret.trim() !== '' ||
      okxPassphrase.trim() !== ''
    )
  }, [
    config,
    baseUrl,
    model,
    apiKey,
    temperature,
    intervalMs,
    enabled,
    maxVolume,
    riskPct,
    fixedVolume,
    okxLeverage,
    okxTdMode,
    okxApiKey,
    okxSecret,
    okxPassphrase
  ])

  function clearOkxKeyInputs(): void {
    setOkxApiKey('')
    setOkxSecret('')
    setOkxPassphrase('')
    setOkxTest(null)
  }

  function switchAsset(next: TradeAsset): void {
    if (next === asset) return
    void saveConfig({ asset: next })
    toastAppliedSwitch(next)
  }

  function switchOkxDemo(next: boolean): void {
    if (next === okxDemo) return
    if (!next) {
      setLiveConfirm(true)
      return
    }
    clearOkxKeyInputs()
    void saveConfig({ okxDemo: true })
    toastAppliedSwitch('模拟盘')
  }

  function switchVenue(next: TradeVenue): void {
    setVenue(next)
    if (next === (config?.venue ?? 'mt5')) return
    void saveConfig({ venue: next })
    toastAppliedSwitch(next === 'okx' ? 'OKX' : 'MT5')
  }

  function save(): void {
    const max = Number(maxVolume)
    const pct = Number(riskPct)
    const temp = Number(temperature)
    const interval = Number(intervalMs)
    const fixed = fixedVolume.trim() === '' ? null : Number(fixedVolume)
    void saveConfig({
      baseUrl,
      model,
      temperature: Number.isFinite(temp) ? temp : undefined,
      intervalMs: Number.isFinite(interval) ? interval : undefined,
      enabled,
      okxTdMode,
      ...(Number.isFinite(Number(okxLeverage)) ? { okxLeverage: Number(okxLeverage) } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(okxApiKey.trim() ? { okxApiKey: okxApiKey.trim() } : {}),
      ...(okxSecret.trim() ? { okxSecret: okxSecret.trim() } : {}),
      ...(okxPassphrase.trim() ? { okxPassphrase: okxPassphrase.trim() } : {}),
      ...(Number.isFinite(max) ? { maxVolume: max } : {}),
      ...(Number.isFinite(pct) ? { riskPct: pct / 100 } : {}),
      fixedVolume: fixed != null && Number.isFinite(fixed) ? fixed : null
    }).then(() => {
      setApiKey('')
      clearOkxKeyInputs()
    })
  }

  return (
    <div className="flex h-full">
      <aside className="w-40 shrink-0 border-r border-border p-3">
        {(
          [
            ['llm', 'LLM'],
            ['venue', '交易场所'],
            ['decision', '决策周期'],
            ['risk', '风控'],
            ['data', '数据源'],
            ['about', '关于']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`mb-1 block w-full rounded-md px-2 py-1.5 text-left text-[13px] ${
              section === id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </aside>
      <div className="relative min-w-0 flex-1 overflow-auto p-6">
        {section === 'llm' && (
          <div className="grid max-w-xl gap-4">
            <Field label="Base URL">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </Field>
            <Field label="模型">
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <Field label="API Key" hint={config?.hasApiKey ? '已保存，留空不改' : '尚未配置'}>
              <Input
                type="password"
                value={apiKey}
                placeholder={config?.hasApiKey ? '已保存' : 'sk-…'}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
            <Field label="Temperature" hint="0–0.5，越低越稳定">
              <Input
                type="number"
                min={0}
                max={0.5}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </Field>
          </div>
        )}

        {section === 'venue' && (
          <div className="grid max-w-xl gap-4">
            <Field label="交易场所" hint="立刻生效，并会关闭自动交易总闸。" applied>
              <Select value={venue} onValueChange={(v) => switchVenue(v as TradeVenue)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mt5">MT5 · BTC / ETH</SelectItem>
                  <SelectItem value="okx">OKX · USDT 永续</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="交易品种"
              hint={
                venue === 'okx'
                  ? 'OKX 合约由品种自动对应：BTC-USDT-SWAP / ETH-USDT-SWAP。立刻生效。'
                  : 'MT5 会按经纪商品名探测 BTCUSD / ETHUSD 一类报价。立刻生效。'
              }
              applied
            >
              <Segmented
                size="md"
                value={asset}
                disabled={saving}
                options={TRADE_ASSETS.map((id) => ({ value: id, label: id }))}
                onChange={switchAsset}
              />
            </Field>
            {venue === 'okx' && (
              <>
                <Field
                  label="盘口"
                  hint="模拟盘和实盘密钥分开保存。切换立刻生效，并会关闭自动交易总闸。"
                  applied
                >
                  <Segmented
                    size="md"
                    value={okxDemo ? 'demo' : 'live'}
                    disabled={saving}
                    options={[
                      { value: 'demo', label: '模拟盘' },
                      { value: 'live', label: '实盘', danger: true }
                    ]}
                    onChange={(v) => switchOkxDemo(v === 'demo')}
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    模拟盘密钥 {hasDemoKeys ? '已保存' : '未配置'} · 实盘密钥{' '}
                    {hasLiveKeys ? '已保存' : '未配置'}
                  </p>
                </Field>
                <Field label="杠杆" hint="下单前会按此杠杆设置。建议先用 3–10x。">
                  <Input
                    type="number"
                    min={1}
                    max={125}
                    step={1}
                    value={okxLeverage}
                    onChange={(e) => setOkxLeverage(e.target.value)}
                  />
                </Field>
                <Field label="保证金模式">
                  <Select
                    value={okxTdMode}
                    onValueChange={(v) => setOkxTdMode(v === 'isolated' ? 'isolated' : 'cross')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cross">全仓 cross</SelectItem>
                      <SelectItem value="isolated">逐仓 isolated</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={okxDemo ? '模拟盘 API Key' : '实盘 API Key'}
                  hint={
                    currentSlotSaved
                      ? `当前${okxDemo ? '模拟盘' : '实盘'}密钥已保存，留空不改`
                      : `请填写当前${okxDemo ? '模拟盘' : '实盘'}的 API Key / Secret / Passphrase`
                  }
                >
                  <Input
                    type="password"
                    value={okxApiKey}
                    placeholder={currentSlotSaved ? '已保存' : 'API Key'}
                    onChange={(e) => setOkxApiKey(e.target.value)}
                  />
                </Field>
                <Field label={okxDemo ? '模拟盘 Secret' : '实盘 Secret'}>
                  <Input
                    type="password"
                    value={okxSecret}
                    placeholder={currentSlotSaved ? '已保存' : 'Secret'}
                    onChange={(e) => setOkxSecret(e.target.value)}
                  />
                </Field>
                <Field label={okxDemo ? '模拟盘 Passphrase' : '实盘 Passphrase'}>
                  <Input
                    type="password"
                    value={okxPassphrase}
                    placeholder={currentSlotSaved ? '已保存' : 'Passphrase'}
                    onChange={(e) => setOkxPassphrase(e.target.value)}
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={okxTesting}
                    onClick={() => {
                      setOkxTesting(true)
                      setOkxTest(null)
                      void window.api.okx
                        .test()
                        .then((res) => {
                          setOkxTest(
                            res.ok
                              ? `连接成功 · uid ${res.uid ?? '—'} · ${res.posMode} · ${res.demo ? '模拟盘' : '实盘'}`
                              : `连接失败：${res.error}`
                          )
                        })
                        .catch((err) => {
                          setOkxTest(err instanceof Error ? err.message : String(err))
                        })
                        .finally(() => setOkxTesting(false))
                    }}
                  >
                    {okxTesting ? '测试中…' : '测试当前盘口连接'}
                  </Button>
                  {okxTest && <p className="text-[11px] text-muted-foreground">{okxTest}</p>}
                </div>
              </>
            )}
          </div>
        )}

        {section === 'decision' && (
          <div className="grid max-w-xl gap-4">
            <Field label="决策周期">
              <Select value={intervalMs} onValueChange={setIntervalMs}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-[13px]">自动决策</p>
                <p className="text-[11px] text-muted-foreground">
                  关闭后不再按周期调用模型，实弹总闸也会一起关掉。顶栏打开自动交易时会一并开启
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        )}

        {section === 'risk' && (
          <div className="grid max-w-xl gap-4">
            <Field
              label={venue === 'okx' ? '张数上限' : '手数上限'}
              hint={
                venue === 'okx'
                  ? '单笔最大合约张数。风控覆盖 LLM 给出的 volume 时也不会超过此值'
                  : '单笔最大手数，风控覆盖 LLM 给出的 volume 时也不会超过此值'
              }
            >
              <Input
                type="number"
                min={0.01}
                max={venue === 'okx' ? 100 : 1}
                step={0.01}
                value={maxVolume}
                onChange={(e) => setMaxVolume(e.target.value)}
              />
            </Field>
            <Field
              label="单笔风险 %"
              hint={
                venue === 'okx'
                  ? '单笔风险占净值百分比，将由 SL 距离反推张数并覆盖 LLM 给的值'
                  : '单笔风险占净值百分比，将由 SL 距离反推手数并覆盖 LLM 给的值'
              }
            >
              <Input
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
              />
            </Field>
            <Field
              label={venue === 'okx' ? '固定张数' : '固定手数'}
              hint="留空则按风险自动计算。填写后仍不会超过上限和单笔风险"
            >
              <Input
                type="number"
                min={0.01}
                max={venue === 'okx' ? 100 : 1}
                step={0.01}
                value={fixedVolume}
                placeholder="自动"
                onChange={(e) => setFixedVolume(e.target.value)}
              />
            </Field>
            <p className="text-[11px] text-muted-foreground">
              日亏熔断仍为净值 3%，在驾驶舱风险水位条可见。
            </p>
          </div>
        )}

        {section === 'data' && (
          <div className="grid max-w-xl gap-8">
            <div>
              <h2 className="text-[13px] font-semibold">新闻源</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">只读展示当前已加载的新闻源。</p>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {feeds.map((feed) => (
                  <li key={feed.source} className="px-3 py-2 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <p>{feed.sourceZh}</p>
                      <span
                        className={
                          feed.enabled
                            ? 'text-[11px] text-emerald-400'
                            : 'text-[11px] text-muted-foreground'
                        }
                      >
                        {feed.enabled ? '启用' : '关闭'}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{feed.url}</p>
                  </li>
                ))}
                {feeds.length === 0 && (
                  <li className="px-3 py-4 text-[13px] text-muted-foreground">暂无新闻源</li>
                )}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void refreshNews()
                    void loadFeeds()
                  }}
                >
                  刷新
                </Button>
              </div>
            </div>

            <div>
              <h2 className="text-[13px] font-semibold">宏观参考</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Polymarket 事件概率，不是 BTC / ETH 价格盘。只读展示当前已加载的市场。
              </p>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {quotes.map((q) => (
                  <li key={q.id} className="px-3 py-2 text-[13px]">
                    <p>{q.eventTitle}</p>
                    <p className="text-[11px] text-muted-foreground">{q.slug}</p>
                  </li>
                ))}
                {quotes.length === 0 && (
                  <li className="px-3 py-4 text-[13px] text-muted-foreground">
                    暂无宏观盘口。这里不是现货行情。
                  </li>
                )}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => void refreshPm()}>
                  刷新
                </Button>
              </div>
            </div>
          </div>
        )}

        {section === 'about' && (
          <AboutSection
            update={update}
            busy={updateBusy}
            onCheck={() => {
              setUpdateBusy(true)
              void window.api.updater
                .check()
                .then(setUpdate)
                .finally(() => setUpdateBusy(false))
            }}
            onInstall={() => {
              setUpdateBusy(true)
              void window.api.updater
                .downloadAndInstall()
                .then(setUpdate)
                .finally(() => setUpdateBusy(false))
            }}
          />
        )}

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        {section !== 'about' && dirty && (
          <div className="pointer-events-none sticky bottom-0 mt-8 flex justify-end bg-gradient-to-t from-background via-background to-transparent pt-6">
            <Button className="pointer-events-auto" disabled={saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={liveConfirm} onOpenChange={setLiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>切换到 OKX 实盘？</AlertDialogTitle>
            <AlertDialogDescription>
              之后下单和自动交易都会打到真实资金账户。模拟盘和实盘密钥是分开的
              {hasLiveKeys ? '；当前实盘密钥已保存。' : '；当前还没有实盘密钥，切换后请先填写。'}
              切换会关闭自动交易总闸。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-400"
              onClick={() => {
                clearOkxKeyInputs()
                void saveConfig({ okxDemo: false })
                toastAppliedSwitch('实盘')
              }}
            >
              确认切到实盘
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function updateLabel(status: UpdaterStatus | null): string {
  if (!status) return '正在读取版本…'
  if (status.state === 'dev') return '开发版不检查更新'
  if (status.state === 'checking') return '正在检查…'
  if (status.state === 'available') {
    return `发现新版本 ${status.availableVersion ?? ''}`
  }
  if (status.state === 'not-available') return '已是最新版本'
  if (status.state === 'downloading') {
    return `下载中 ${status.percent ?? 0}%`
  }
  if (status.state === 'ready') return '已下载，可以重启安装'
  if (status.state === 'error') return status.error ?? '检查失败'
  return '尚未检查'
}

function AboutSection({
  update,
  busy,
  onCheck,
  onInstall
}: {
  update: UpdaterStatus | null
  busy: boolean
  onCheck: () => void
  onInstall: () => void
}): JSX.Element {
  const state = update?.state
  const canInstall = state === 'available' || state === 'ready'
  const checking = busy || state === 'checking' || state === 'downloading'
  const percent = update?.percent ?? 0

  return (
    <div className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-[13px] font-semibold">LLMTradeAgent</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          当前版本 {update?.currentVersion ?? '—'}
        </p>
        <p className="mt-2 text-[13px]">{updateLabel(update)}</p>
        {update?.releaseNotes && (state === 'available' || state === 'ready') && (
          <p className="mt-2 text-[11px] text-muted-foreground">{update.releaseNotes}</p>
        )}
        {state === 'downloading' && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
        )}
        {state === 'error' && update?.error && (
          <p className="mt-2 text-xs text-red-400">{update.error}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={checking || state === 'dev'}
          onClick={onCheck}
        >
          检查更新
        </Button>
        {canInstall && (
          <Button type="button" size="sm" disabled={checking} onClick={onInstall}>
            {state === 'ready' ? '重启安装' : '下载并重启'}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        更新会先关闭自动交易再下载安装包。未签名时 Windows 可能弹出 SmartScreen
        拦截，选择仍要运行即可。
      </p>
    </div>
  )
}

function Field({
  label,
  hint,
  applied,
  children
}: {
  label: string
  hint?: string
  applied?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-[13px]">{label}</Label>
        {applied && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            已应用
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
