import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'

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
import { useAgentStore, useNewsStore, usePmStore } from '@/stores'

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
  const [section, setSection] = useState<'llm' | 'decision' | 'risk' | 'data'>('llm')

  useEffect(() => {
    void loadFeeds()
  }, [loadFeeds])

  useEffect(() => {
    if (!config) return
    setBaseUrl(config.baseUrl)
    setModel(config.model)
    setTemperature(String(config.temperature))
    setIntervalMs(String(config.intervalMs))
    setEnabled(config.enabled)
    setMaxVolume(String(config.maxVolume))
    setRiskPct(String(Math.round(config.riskPct * 1000) / 10))
    setFixedVolume(config.fixedVolume == null ? '' : String(config.fixedVolume))
  }, [config])

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
      (fixed ?? null) !== (config.fixedVolume ?? null)
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
    fixedVolume
  ])

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
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(Number.isFinite(max) ? { maxVolume: max } : {}),
      ...(Number.isFinite(pct) ? { riskPct: pct / 100 } : {}),
      fixedVolume: fixed != null && Number.isFinite(fixed) ? fixed : null
    }).then(() => setApiKey(''))
  }

  return (
    <div className="flex h-full">
      <aside className="w-40 shrink-0 border-r border-border p-3">
        {(
          [
            ['llm', 'LLM'],
            ['decision', '决策周期'],
            ['risk', '风控'],
            ['data', '数据源']
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
              label="手数上限"
              hint="单笔最大手数，风控覆盖 LLM 给出的 volume 时也不会超过此值"
            >
              <Input
                type="number"
                min={0.01}
                max={1}
                step={0.01}
                value={maxVolume}
                onChange={(e) => setMaxVolume(e.target.value)}
              />
            </Field>
            <Field
              label="单笔风险 %"
              hint="单笔风险占净值百分比，将由 SL 距离反推手数并覆盖 LLM 给的值"
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
            <Field label="固定手数" hint="留空则按风险自动计算。填写后仍不会超过上限和单笔风险">
              <Input
                type="number"
                min={0.01}
                max={1}
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
              <h2 className="text-[13px] font-semibold">Polymarket watch</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">只读展示当前已加载的市场。</p>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {quotes.map((q) => (
                  <li key={q.id} className="px-3 py-2 text-[13px]">
                    <p>{q.eventTitle}</p>
                    <p className="text-[11px] text-muted-foreground">{q.slug}</p>
                  </li>
                ))}
                {quotes.length === 0 && (
                  <li className="px-3 py-4 text-[13px] text-muted-foreground">暂无市场</li>
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

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        <div className="pointer-events-none sticky bottom-0 mt-8 flex justify-end bg-gradient-to-t from-background via-background to-transparent pt-6">
          <Button className="pointer-events-auto" disabled={!dirty || saving} onClick={save}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <label className="grid gap-1.5">
      <Label className="text-[13px]">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  )
}
