import { randomUUID } from 'crypto'

import {
  AGENT_MAGIC,
  HOLDING_INTERVAL_MS,
  type AgentDecision,
  type AgentExecution,
  type AgentOrderCheck,
  type AgentOrderSend,
  type AgentRecord
} from '../../preload/agent-types'
import {
  accountModeFromTradeMode,
  fillingCandidates,
  isTradeSuccess,
  TRADE_ACTION_SLTP,
  TRADE_RETCODE_INVALID_FILL,
  type Mt5Deal,
  type Mt5OrderCheckResult,
  type Mt5OrderSendResult,
  type Mt5TradeRequest
} from '../../preload/mt5-types'
import type { DecisionSnapshot } from '../../preload/snapshot-types'
import type { OkxOrderResult, OkxTradeIntent } from '../../preload/okx-types'
import type { Mt5Client } from '../mt5/client'
import type { OkxClient } from '../okx/client'
import { buildOkxIntent } from '../okx/order-builder'
import type { SnapshotService } from '../snapshot/service'
import { chatCompletions } from './client'
import { disarmIfAccountDrift, getApiKey, getPublicConfig, getVenue } from './config'
import { decideSendGate, isCheckOk } from './gate'
import { notify } from './notify'
import { buildTradeRequest, withFilling } from './order-builder'
import {
  loadSystemPrompt,
  promptVersion,
  renderRecentDecisions,
  renderSnapshotMarkdown
} from './prompt'
import { closedAtLooksWrong, reconcileOutcomes } from './reconcile'
import { evaluateRisk } from './risk'
import { DecisionParseError, parseDecision, retryHint } from './schema'
import { appendSnapshotLog } from './snapshot-store'
import { appendRecord, loadRecords, updateStoredRecords } from './store'

type Listener = (records: AgentRecord[]) => void
type ConfigListener = () => void

const CHECK_TIMEOUT_MS = 20_000
const SEND_TIMEOUT_MS = 60_000
/** 决策调度器每 30s 检查一次是否到期 */
const SCHEDULER_TICK_MS = 30_000
const RECONCILE_MS = 60_000
/** 盈利超过 1×H1 ATR 后把止损移到入场价 */
const BREAKEVEN_ATR = 1

/** MT5 桥无响应时不能让引擎永远挂起，否则之后每轮都报「上一轮决策仍在进行」 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${ms / 1000}s）`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function holdDecision(symbol: string, reasoning: string): AgentDecision {
  return {
    action: 'hold',
    symbol,
    confidence: 0,
    reasoning,
    keyFactors: []
  }
}

function asSend(raw: unknown): AgentOrderSend {
  if (!raw || typeof raw !== 'object') {
    return {
      retcode: -1,
      deal: null,
      order: null,
      volume: null,
      price: null,
      comment: 'order_send 无返回'
    }
  }
  const row = raw as Mt5OrderSendResult
  return {
    retcode: typeof row.retcode === 'number' ? row.retcode : -1,
    deal: Number.isFinite(row.deal) ? row.deal : null,
    order: Number.isFinite(row.order) ? row.order : null,
    volume: Number.isFinite(row.volume) ? row.volume : null,
    price: Number.isFinite(row.price) ? row.price : null,
    comment: typeof row.comment === 'string' ? row.comment : ''
  }
}

function asCheck(raw: unknown): AgentOrderCheck {
  if (!raw || typeof raw !== 'object') {
    return { retcode: -1, comment: 'order_check 无返回', margin: null, marginFree: null }
  }
  const row = raw as Mt5OrderCheckResult
  return {
    retcode: typeof row.retcode === 'number' ? row.retcode : -1,
    comment: typeof row.comment === 'string' ? row.comment : '',
    margin: Number.isFinite(row.margin) ? row.margin : null,
    marginFree: Number.isFinite(row.margin_free) ? row.margin_free : null
  }
}

export class AgentEngine {
  private records: AgentRecord[] = []
  private readonly listeners = new Set<Listener>()
  private readonly configListeners = new Set<ConfigListener>()
  private offSnapshot: (() => void) | null = null
  private timer: NodeJS.Timeout | null = null
  private reconcileTimer: NodeJS.Timeout | null = null
  private running = false
  private reconciling = false
  private started = false
  private lastRunAt = 0
  private lastTimerLog: string | null = null

  constructor(
    private readonly snapshots: SnapshotService,
    private readonly mt5: Mt5Client,
    private readonly okx?: OkxClient
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.records = loadRecords()
    this.offSnapshot = this.snapshots.onUpdated((snapshot) => this.guardArmedAccount(snapshot))
    this.syncTimer('start')
    this.reconcileTimer = setInterval(() => {
      void this.reconcileTick()
    }, RECONCILE_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.reconcileTimer) clearInterval(this.reconcileTimer)
    this.reconcileTimer = null
    this.offSnapshot?.()
    this.offSnapshot = null
    this.started = false
  }

  list(): AgentRecord[] {
    return this.records
  }

  onConfig(listener: ConfigListener): () => void {
    this.configListeners.add(listener)
    return () => {
      this.configListeners.delete(listener)
    }
  }

  onUpdated(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  syncTimer(source: 'start' | 'config' = 'config'): void {
    const wasArmed = this.timer != null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const cfg = getPublicConfig()
    if (!cfg.enabled || !cfg.hasApiKey) {
      const reason = !cfg.enabled ? 'enabled=off' : 'no-api-key'
      this.logTimer(`scheduler idle (${reason})`)
      return
    }
    if (!wasArmed) {
      if (source === 'start') {
        const last = this.records[this.records.length - 1]
        const lastTs = last ? Date.parse(last.createdAt) : NaN
        this.lastRunAt = Number.isFinite(lastTs) ? lastTs : 0
      } else {
        // 用户刚打开开关：下一个 30s tick 就跑，不要再空等一个完整周期
        this.lastRunAt = 0
      }
    }
    this.timer = setInterval(() => {
      const current = getPublicConfig()
      if (!current.enabled || !current.hasApiKey) return
      const holding = (this.snapshots.getSnapshot().account?.positions.length ?? 0) > 0
      const effective = holding
        ? Math.min(HOLDING_INTERVAL_MS, current.intervalMs)
        : current.intervalMs
      if (Date.now() - this.lastRunAt < effective) return
      void this.runOnce().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[agent]', message)
      })
    }, SCHEDULER_TICK_MS)
    const when =
      this.lastRunAt === 0 ? 'due-soon' : `last=${new Date(this.lastRunAt).toISOString()}`
    this.logTimer(`scheduler on interval=${Math.round(cfg.intervalMs / 60_000)}m ${when}`)
  }

  private logTimer(message: string): void {
    if (this.lastTimerLog === message) return
    this.lastTimerLog = message
    console.log(`[agent] ${message}`)
  }

  async runOnce(): Promise<AgentRecord> {
    if (this.running) {
      throw new Error('上一轮决策仍在进行')
    }
    this.running = true
    this.lastRunAt = Date.now()
    try {
      const record = await this.execute()
      this.records = appendRecord(record, this.records)
      this.emit()
      console.log(
        '[agent]',
        record.decision.action,
        record.riskVerdict,
        record.execution?.reason ?? record.skipped ?? record.parseError ?? record.riskReason ?? '',
        record.check ? `check ${record.check.retcode}` : '',
        record.send ? `send ${record.send.retcode}` : '',
        record.tokens ? `tokens ${record.tokens.total}` : '',
        record.promptVersion
      )
      return record
    } finally {
      this.running = false
    }
  }

  private async execute(): Promise<AgentRecord> {
    const snapshot = await this.snapshots.refresh()
    const cfg = getPublicConfig()
    const venue = getVenue()
    const symbol = snapshot.meta.symbol
    const base = {
      id: randomUUID(),
      snapshotId: snapshot.meta.snapshotId,
      symbol,
      createdAt: new Date().toISOString(),
      promptVersion: promptVersion(venue),
      model: cfg.model,
      tokens: null as AgentRecord['tokens']
    }

    if (snapshot.sources.market !== 'ok') {
      const decision = holdDecision(symbol, '技术面未就绪，跳过本轮')
      return this.withPreview(
        {
          ...base,
          decision,
          parseError: null,
          riskVerdict: 'reject',
          riskReason: '技术面未就绪',
          skipped: '技术面未就绪'
        },
        snapshot,
        null
      )
    }

    // 疑似休市且空仓：不烧 token；有持仓时仍照常跑，可能需要管理仓位
    const haltReason = snapshot.constraints.haltReason ?? ''
    if (
      snapshot.constraints.tradingHalted &&
      haltReason.includes('休市') &&
      (snapshot.account?.positions.length ?? 0) === 0
    ) {
      const decision = holdDecision(symbol, `${haltReason}，空仓跳过本轮`)
      return this.withPreview(
        {
          ...base,
          decision,
          parseError: null,
          riskVerdict: 'reject',
          riskReason: haltReason,
          skipped: '疑似休市'
        },
        snapshot,
        null
      )
    }

    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('未配置 API key')
    }

    appendSnapshotLog(snapshot)
    const system = loadSystemPrompt(venue)
    const history = renderRecentDecisions(this.records)
    const user = history
      ? `${renderSnapshotMarkdown(snapshot)}\n\n${history}`
      : renderSnapshotMarkdown(snapshot)

    try {
      const first = await chatCompletions({
        baseUrl: cfg.baseUrl,
        apiKey,
        model: cfg.model,
        temperature: cfg.temperature,
        system,
        user
      })
      try {
        return await this.decide(base, cfg.intervalMs, first.content, first.tokens)
      } catch (error) {
        const hint = error instanceof DecisionParseError ? error.message : 'JSON 校验失败'
        const second = await chatCompletions({
          baseUrl: cfg.baseUrl,
          apiKey,
          model: cfg.model,
          temperature: cfg.temperature,
          system,
          user: `${user}\n\n${retryHint(hint)}`
        })
        try {
          return await this.decide(base, cfg.intervalMs, second.content, second.tokens)
        } catch (retryError) {
          const parseError =
            retryError instanceof DecisionParseError ? retryError.message : 'JSON 校验失败'
          const decision = holdDecision(symbol, `模型输出无法校验：${parseError}`)
          return this.withPreview(
            {
              ...base,
              tokens: second.tokens,
              decision,
              parseError,
              riskVerdict: 'reject',
              riskReason: parseError,
              skipped: null
            },
            snapshot,
            null
          )
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
      throw new Error(message)
    }
  }

  private async decide(
    base: Pick<
      AgentRecord,
      'id' | 'snapshotId' | 'symbol' | 'createdAt' | 'promptVersion' | 'model' | 'tokens'
    >,
    intervalMs: number,
    content: string,
    tokens: AgentRecord['tokens']
  ): Promise<AgentRecord> {
    const decision = parseDecision(content, base.symbol)
    // 模型可能跑几十秒，发单前重拉行情/持仓，避免用过期价或漏掉已有仓
    const snapshot = await this.snapshots.refresh()
    if (snapshot.meta.snapshotId !== base.snapshotId) {
      appendSnapshotLog(snapshot)
    }
    const risk = evaluateRisk(decision, snapshot, {
      records: this.records,
      intervalMs
    })
    return this.withPreview(
      {
        ...base,
        snapshotId: snapshot.meta.snapshotId,
        promptSnapshotId: base.snapshotId,
        tokens,
        decision,
        parseError: null,
        riskVerdict: risk.verdict,
        riskReason: risk.reason,
        skipped: null
      },
      snapshot,
      risk.sizedVolume
    )
  }

  private async withPreview(
    record: Omit<AgentRecord, 'sizedVolume' | 'intendedRequest' | 'check' | 'send' | 'execution'> &
      Partial<AgentRecord>,
    snapshot: DecisionSnapshot,
    sizedVolume: number | null
  ): Promise<AgentRecord> {
    if (getVenue() === 'okx') {
      return this.withOkxPreview(record, snapshot, sizedVolume)
    }

    let intendedRequest: Mt5TradeRequest | null = null
    let check: AgentOrderCheck | null = null
    let send: AgentOrderSend | null = null
    let execution: AgentExecution = { status: 'preview', reason: '总闸关闭' }

    this.guardArmedAccount(snapshot)
    const cfg = getPublicConfig(accountModeFromTradeMode(snapshot.account?.tradeMode))

    if (record.riskVerdict === 'pass' && record.decision.action !== 'hold' && !record.skipped) {
      intendedRequest = buildTradeRequest(
        record.decision,
        snapshot,
        sizedVolume,
        record.promptVersion
      )
      if (intendedRequest) {
        const checked = await this.checkWithFillFallback(intendedRequest, snapshot)
        intendedRequest = checked.request
        check = checked.check
        this.guardArmedAccount(snapshot)
        const liveCfg = getPublicConfig(accountModeFromTradeMode(snapshot.account?.tradeMode))
        const gate = decideSendGate({
          tradingEnabled: liveCfg.tradingEnabled,
          accountMode: liveCfg.accountMode,
          checkRetcode: check.retcode
        })
        if (gate.send) {
          try {
            send = asSend(
              await withTimeout(
                this.mt5.request('order_send', intendedRequest),
                SEND_TIMEOUT_MS,
                'order_send'
              )
            )
            if (isTradeSuccess(send.retcode)) {
              execution = {
                status: 'sent',
                reason: `已成交 ${send.volume ?? ''} @ ${send.price ?? ''}`.trim()
              }
            } else {
              execution = {
                status: 'rejected',
                reason: `发单失败 ${send.retcode} ${send.comment}`.trim()
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
            send = {
              retcode: -1,
              deal: null,
              order: null,
              volume: null,
              price: null,
              comment: message
            }
            execution = {
              status: 'rejected',
              reason: `发单异常：${message}（订单状态未知，请核对 MT5 持仓）`
            }
          }
          // 无论成败都刷新一次持仓，超时的单也可能已经成交
          await this.snapshots.refresh().catch(() => undefined)
        } else {
          execution = { status: gate.status, reason: gate.reason }
        }
      } else {
        execution = { status: 'skipped', reason: '无法组单' }
      }
    } else if (record.decision.action === 'hold' && record.riskVerdict === 'pass') {
      execution = { status: 'preview', reason: '观望，不组单' }
    } else {
      execution = {
        status: 'preview',
        reason: record.riskReason ?? record.skipped ?? '风控拒绝'
      }
    }

    if (execution.status === 'sent') {
      notify(
        'order-sent',
        '已发单',
        `${record.decision.action} ${send?.volume ?? sizedVolume ?? ''} 手 @ ${send?.price ?? ''}`.trim()
      )
    } else if (execution.status === 'rejected') {
      notify('order-failed', '发单失败', execution.reason)
    } else if (
      cfg.tradingEnabled &&
      record.riskReason &&
      /当日亏损|今日开仓|连续亏损/.test(record.riskReason)
    ) {
      notify(`halt:${record.riskReason}`, '风控熔断', record.riskReason, 30 * 60_000)
    }

    return {
      ...record,
      sizedVolume,
      intendedRequest,
      check,
      send,
      execution
    }
  }

  private async checkWithFillFallback(
    request: Mt5TradeRequest,
    snapshot: DecisionSnapshot
  ): Promise<{ request: Mt5TradeRequest; check: AgentOrderCheck }> {
    const fills = fillingCandidates(snapshot.constraints.fillingMode ?? undefined)
    let current = request
    let check = await this.runCheck(current)
    if (isCheckOk(check.retcode)) return { request: current, check }
    if (check.retcode !== TRADE_RETCODE_INVALID_FILL && !/fill/i.test(check.comment)) {
      return { request: current, check }
    }
    for (const fill of fills) {
      if (fill === current.type_filling) continue
      current = withFilling(request, fill)
      check = await this.runCheck(current)
      if (isCheckOk(check.retcode)) return { request: current, check }
    }
    return { request: current, check }
  }

  private async withOkxPreview(
    record: Omit<AgentRecord, 'sizedVolume' | 'intendedRequest' | 'check' | 'send' | 'execution'> &
      Partial<AgentRecord>,
    snapshot: DecisionSnapshot,
    sizedVolume: number | null
  ): Promise<AgentRecord> {
    let intendedOkxRequest: OkxTradeIntent | null = null
    let check: AgentOrderCheck | null = null
    let send: AgentOrderSend | null = null
    let execution: AgentExecution = { status: 'preview', reason: '总闸关闭' }

    this.guardArmedAccount(snapshot)
    const cfg = getPublicConfig(accountModeFromTradeMode(snapshot.account?.tradeMode))

    if (record.riskVerdict === 'pass' && record.decision.action !== 'hold' && !record.skipped) {
      intendedOkxRequest = buildOkxIntent(record.decision, snapshot, sizedVolume, {
        tdMode: cfg.okx.tdMode,
        leverage: cfg.okx.leverage,
        promptVersion: record.promptVersion
      })
      if (intendedOkxRequest) {
        check = this.checkOkx(intendedOkxRequest, snapshot)
        this.guardArmedAccount(snapshot)
        const liveCfg = getPublicConfig(accountModeFromTradeMode(snapshot.account?.tradeMode))
        const gate = decideSendGate({
          tradingEnabled: liveCfg.tradingEnabled,
          accountMode: liveCfg.accountMode,
          checkRetcode: check.retcode
        })
        if (gate.send) {
          try {
            send = await this.sendOkx(intendedOkxRequest)
            if (isTradeSuccess(send.retcode)) {
              execution = {
                status: 'sent',
                reason: `已成交 ${send.volume ?? ''} @ ${send.price ?? ''}`.trim()
              }
            } else {
              execution = {
                status: 'rejected',
                reason: `发单失败 ${send.retcode} ${send.comment}`.trim()
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
            send = {
              retcode: -1,
              deal: null,
              order: null,
              volume: null,
              price: null,
              comment: message
            }
            execution = {
              status: 'rejected',
              reason: `发单异常：${message}（订单状态未知，请核对 OKX 持仓）`
            }
          }
          await this.snapshots.refresh().catch(() => undefined)
        } else {
          execution = { status: gate.status, reason: gate.reason }
        }
      } else {
        execution = { status: 'skipped', reason: '无法组单' }
      }
    } else if (record.decision.action === 'hold' && record.riskVerdict === 'pass') {
      execution = { status: 'preview', reason: '观望，不组单' }
    } else {
      execution = {
        status: 'preview',
        reason: record.riskReason ?? record.skipped ?? '风控拒绝'
      }
    }

    if (execution.status === 'sent') {
      notify(
        'order-sent',
        '已发单',
        `${record.decision.action} ${send?.volume ?? sizedVolume ?? ''} @ ${send?.price ?? ''}`.trim()
      )
    } else if (execution.status === 'rejected') {
      notify('order-failed', '发单失败', execution.reason)
    } else if (
      cfg.tradingEnabled &&
      record.riskReason &&
      /当日亏损|今日开仓|连续亏损/.test(record.riskReason)
    ) {
      notify(`halt:${record.riskReason}`, '风控熔断', record.riskReason, 30 * 60_000)
    }

    return {
      ...record,
      sizedVolume,
      intendedRequest: null,
      intendedOkxRequest,
      check,
      send,
      execution
    }
  }

  private checkOkx(intent: OkxTradeIntent, snapshot: DecisionSnapshot): AgentOrderCheck {
    if (!this.okx?.hasKeys()) {
      return { retcode: -1, comment: '尚未配置 OKX API Key', margin: null, marginFree: null }
    }
    if (intent.kind === 'place' && (!intent.sz || Number(intent.sz) <= 0)) {
      return { retcode: -1, comment: '张数无效', margin: null, marginFree: null }
    }
    return {
      retcode: 0,
      comment: 'OKX 本地预检通过',
      margin: null,
      marginFree: snapshot.account?.marginFree ?? null
    }
  }

  private async sendOkx(intent: OkxTradeIntent): Promise<AgentOrderSend> {
    if (!this.okx) throw new Error('OKX 客户端未初始化')
    let result: OkxOrderResult
    if (intent.kind === 'place') {
      result = await withTimeout(
        this.okx.placeOrder({
          instId: intent.instId,
          side: intent.side ?? 'buy',
          sz: intent.sz ?? '0',
          ordType: 'market',
          tdMode: intent.tdMode,
          posSide: intent.posSide,
          clOrdId: intent.clOrdId,
          lever: intent.lever,
          sl: intent.sl,
          tp: intent.tp
        }),
        SEND_TIMEOUT_MS,
        'okx.placeOrder'
      )
    } else if (intent.kind === 'close') {
      result = await withTimeout(
        this.okx.closePosition(intent.instId, intent.tdMode, intent.posSide),
        SEND_TIMEOUT_MS,
        'okx.closePosition'
      )
    } else {
      result = await withTimeout(
        this.okx.replaceAlgoSlTp({
          instId: intent.instId,
          tdMode: intent.tdMode,
          side: intent.side ?? 'sell',
          sz: intent.sz ?? '0',
          sl: intent.sl,
          tp: intent.tp,
          posSide: intent.posSide
        }),
        SEND_TIMEOUT_MS,
        'okx.replaceAlgoSlTp'
      )
    }
    const ord = result.ordId ? Number(result.ordId) : NaN
    return {
      retcode: result.code === '0' ? 0 : Number(result.sCode ?? result.code) || -1,
      deal: Number.isFinite(ord) ? ord : null,
      order: Number.isFinite(ord) ? ord : null,
      volume: intent.sz != null ? Number(intent.sz) : null,
      price: result.avgPx,
      comment: result.sMsg || result.msg || 'OKX'
    }
  }

  private async reconcileTick(): Promise<void> {
    if (this.reconciling) return
    this.reconciling = true
    try {
      if (getVenue() === 'okx') {
        await this.reconcileOkxOnce()
        await this.manageOkxBreakeven()
      } else {
        await this.reconcileOutcomesOnce()
        await this.manageBreakeven()
      }
    } catch (error) {
      console.warn('[agent] 对账失败', error instanceof Error ? error.message : error)
    } finally {
      this.reconciling = false
    }
  }

  /** 用 history_deals 把已发单开仓的平仓结果回写到决策记录 */
  private async reconcileOutcomesOnce(): Promise<void> {
    const pending = this.records.filter((row) => {
      if (row.execution?.status !== 'sent') return false
      const { action } = row.decision
      if (action !== 'open_buy' && action !== 'open_sell') return false
      return row.outcome?.status !== 'closed' || closedAtLooksWrong(row.outcome.closedAt)
    })
    if (pending.length === 0) return

    const earliest = Math.min(...pending.map((row) => Date.parse(row.createdAt)))
    if (!Number.isFinite(earliest)) return
    // 经纪商服务器时间与本地可能差几小时，range 两侧都放宽一天
    const fromSec = Math.floor(earliest / 1000) - 86_400
    const toSec = Math.floor(Date.now() / 1000) + 86_400
    const raw = await withTimeout(
      this.mt5.request('history_deals_get', { date_from: fromSec, date_to: toSec }),
      CHECK_TIMEOUT_MS,
      'history_deals_get'
    )
    const deals = Array.isArray(raw) ? (raw as Mt5Deal[]) : []
    const updated = reconcileOutcomes(this.records, deals)
    if (updated.length === 0) return

    const byId = new Map(updated.map((row) => [row.id, row]))
    this.records = this.records.map((row) => byId.get(row.id) ?? row)
    updateStoredRecords(byId)
    this.emit()
    for (const row of updated) {
      if (row.outcome?.status === 'closed') {
        const pnl = row.outcome.pnl ?? 0
        notify(
          `closed:${row.id}`,
          '仓位已平',
          `${row.decision.action === 'open_buy' ? '多' : '空'}单已平，盈亏 ${pnl > 0 ? '+' : ''}${pnl}`
        )
      }
    }
  }

  /** 盈利超过 1×H1 ATR 后把 SL 移到入场价（只动本引擎的仓，且总闸开；账户类型未知时不改仓） */
  private async manageBreakeven(): Promise<void> {
    const snapshot = this.snapshots.getSnapshot()
    this.guardArmedAccount(snapshot)
    const cfg = getPublicConfig(accountModeFromTradeMode(snapshot.account?.tradeMode))
    if (!cfg.tradingEnabled || cfg.accountMode === 'unknown') return

    const atr = snapshot.technical?.timeframes.H1?.atr14
    const bid = snapshot.technical?.price.bid
    const ask = snapshot.technical?.price.ask
    if (atr == null || atr <= 0 || bid == null || ask == null) return

    for (const pos of snapshot.account?.positions ?? []) {
      if (pos.magic !== AGENT_MAGIC) continue
      const buy = pos.type === 'buy'
      const gain = buy ? bid - pos.priceOpen : pos.priceOpen - ask
      if (gain < BREAKEVEN_ATR * atr) continue
      const alreadySafe = buy
        ? pos.sl > 0 && pos.sl >= pos.priceOpen
        : pos.sl > 0 && pos.sl <= pos.priceOpen
      if (alreadySafe) continue
      // SL 移到入场价后必须仍在触发侧的正确方向
      if (buy && pos.priceOpen >= bid) continue
      if (!buy && pos.priceOpen <= ask) continue

      const request: Mt5TradeRequest = {
        action: TRADE_ACTION_SLTP,
        magic: AGENT_MAGIC,
        symbol: snapshot.meta.symbol,
        position: pos.ticket,
        sl: pos.priceOpen,
        tp: pos.tp
      }
      const check = await this.runCheck(request)
      if (!isCheckOk(check.retcode)) continue
      try {
        const send = asSend(
          await withTimeout(this.mt5.request('order_send', request), SEND_TIMEOUT_MS, 'order_send')
        )
        if (isTradeSuccess(send.retcode)) {
          console.log('[agent] 保本止损', pos.ticket, '→', pos.priceOpen)
          notify(
            `breakeven:${pos.ticket}`,
            '已移动止损保本',
            `#${pos.ticket} SL → ${pos.priceOpen}`
          )
          await this.snapshots.refresh().catch(() => undefined)
        }
      } catch (error) {
        console.warn('[agent] 保本失败', error instanceof Error ? error.message : error)
      }
    }
  }

  private async runCheck(request: Mt5TradeRequest): Promise<AgentOrderCheck> {
    try {
      return asCheck(
        await withTimeout(this.mt5.request('order_check', request), CHECK_TIMEOUT_MS, 'order_check')
      )
    } catch (error) {
      return {
        retcode: -1,
        comment: error instanceof Error ? error.message.split('\n')[0] : String(error),
        margin: null,
        marginFree: null
      }
    }
  }

  private async reconcileOkxOnce(): Promise<void> {
    if (!this.okx?.hasKeys()) return
    const pending = this.records.filter((row) => {
      if (row.execution?.status !== 'sent') return false
      const { action } = row.decision
      if (action !== 'open_buy' && action !== 'open_sell') return false
      return row.outcome?.status !== 'closed'
    })
    if (pending.length === 0) return

    const positions = await withTimeout(this.okx.getPositions(), CHECK_TIMEOUT_MS, 'okx.positions')
    const earliest = Math.min(...pending.map((row) => Date.parse(row.createdAt)))
    const bills = await withTimeout(
      this.okx.getBills(Math.max(0, earliest - 3_600_000)),
      CHECK_TIMEOUT_MS,
      'okx.bills'
    )
    const updated: AgentRecord[] = []
    for (const row of pending) {
      const want = row.decision.action === 'open_buy' ? 'buy' : 'sell'
      const stillOpen = positions.some((pos) => {
        if (pos.instId && pos.instId !== row.symbol) return false
        const type = pos.posSide === 'short' || pos.pos < 0 ? 'sell' : 'buy'
        return type === want
      })
      if (stillOpen) continue
      const created = Date.parse(row.createdAt)
      const related = bills.filter(
        (bill) => bill.ts >= created - 60_000 && (!bill.instId || bill.instId === row.symbol)
      )
      const pnl = related.reduce((sum, bill) => sum + bill.pnl + bill.fee, 0)
      const lastTs = related.reduce((max, bill) => Math.max(max, bill.ts), created)
      updated.push({
        ...row,
        outcome: {
          status: 'closed',
          positionId: row.send?.order ?? null,
          closedAt: new Date(lastTs).toISOString(),
          closePrice: null,
          pnl
        }
      })
    }
    if (updated.length === 0) return
    const byId = new Map(updated.map((row) => [row.id, row]))
    this.records = this.records.map((row) => byId.get(row.id) ?? row)
    updateStoredRecords(byId)
    this.emit()
    for (const row of updated) {
      const pnl = row.outcome?.pnl ?? 0
      notify(
        `closed:${row.id}`,
        '仓位已平',
        `${row.decision.action === 'open_buy' ? '多' : '空'}单已平，盈亏 ${pnl > 0 ? '+' : ''}${pnl}`
      )
    }
  }

  private async manageOkxBreakeven(): Promise<void> {
    if (!this.okx?.hasKeys()) return
    const snapshot = this.snapshots.getSnapshot()
    this.guardArmedAccount(snapshot)
    const cfg = getPublicConfig(accountModeFromTradeMode(snapshot.account?.tradeMode))
    if (!cfg.tradingEnabled || cfg.accountMode === 'unknown') return

    const atr = snapshot.technical?.timeframes.H1?.atr14
    const bid = snapshot.technical?.price.bid
    const ask = snapshot.technical?.price.ask
    if (atr == null || atr <= 0 || bid == null || ask == null) return

    for (const pos of snapshot.account?.positions ?? []) {
      const buy = pos.type === 'buy'
      const gain = buy ? bid - pos.priceOpen : pos.priceOpen - ask
      if (gain < BREAKEVEN_ATR * atr) continue
      const alreadySafe = buy
        ? pos.sl > 0 && pos.sl >= pos.priceOpen
        : pos.sl > 0 && pos.sl <= pos.priceOpen
      if (alreadySafe) continue
      if (buy && pos.priceOpen >= bid) continue
      if (!buy && pos.priceOpen <= ask) continue
      try {
        const send = await this.okx.replaceAlgoSlTp({
          instId: snapshot.meta.symbol,
          tdMode: cfg.okx.tdMode,
          side: buy ? 'sell' : 'buy',
          sz: String(pos.volume),
          sl: pos.priceOpen,
          tp: pos.tp > 0 ? pos.tp : undefined,
          posSide: buy ? 'long' : 'short'
        })
        if (send.code === '0') {
          console.log('[agent] OKX 保本止损', pos.ticket, '→', pos.priceOpen)
          notify(
            `breakeven:${pos.ticket}`,
            '已移动止损保本',
            `#${pos.ticket} SL → ${pos.priceOpen}`
          )
          await this.snapshots.refresh().catch(() => undefined)
        }
      } catch (error) {
        console.warn('[agent] OKX 保本失败', error instanceof Error ? error.message : error)
      }
    }
  }

  private guardArmedAccount(snapshot: DecisionSnapshot): boolean {
    const changed = disarmIfAccountDrift({
      login: snapshot.account?.login ?? null,
      mode: accountModeFromTradeMode(snapshot.account?.tradeMode)
    })
    if (!changed) return false
    notify('account-drift', '自动交易已关闭', '检测到账户切换，请重新确认后再打开自动交易')
    this.syncTimer()
    this.emitConfig()
    return true
  }

  private emitConfig(): void {
    for (const listener of this.configListeners) {
      listener()
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.records)
    }
  }
}
