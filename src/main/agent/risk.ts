import type { AgentDecision, AgentRecord, AgentRiskVerdict } from '../../preload/agent-types'
import type { DecisionSnapshot, SnapshotPosition } from '../../preload/snapshot-types'

export const RISK_PCT = 0.01
export const DAILY_LOSS_PCT = 0.03
export const MAX_OPENS_PER_DAY = 6
export const MAX_CONSECUTIVE_LOSSES = 3

export type RiskContext = {
  records: AgentRecord[]
  intervalMs: number
  now?: number
}

export type RiskResult = {
  verdict: AgentRiskVerdict
  reason: string | null
  sizedVolume: number | null
}

function pass(sizedVolume: number | null = null): RiskResult {
  return { verdict: 'pass', reason: null, sizedVolume }
}

function reject(reason: string): RiskResult {
  return { verdict: 'reject', reason, sizedVolume: null }
}

function alignVolume(raw: number, step: number): number {
  const steps = Math.floor((raw + 1e-9) / step)
  return Math.round(steps * step * 1e8) / 1e8
}

export function sizeOpenVolume(params: {
  equity: number
  slDistance: number
  contractSize: number
  volumeMin: number
  volumeStep: number
  maxVolume: number
  riskPct?: number
  preferredVolume?: number | null
}): { volume: number } | { error: string } {
  const { equity, slDistance, contractSize, volumeMin, volumeStep, maxVolume } = params
  const riskPct = params.riskPct != null && params.riskPct > 0 ? params.riskPct : RISK_PCT
  if (!(equity > 0)) return { error: '净值无效' }
  if (!(slDistance > 0)) return { error: '止损距离无效' }
  if (!(contractSize > 0)) return { error: '缺少合约规格' }
  if (!(volumeMin > 0) || !(volumeStep > 0)) return { error: '缺少手数规格' }
  if (!(maxVolume > 0)) return { error: '手数上限无效' }

  const budget = equity * riskPct
  const minRisk = volumeMin * contractSize * slDistance
  if (minRisk > budget + 1e-9) {
    return {
      error: `最小手数风险 ${minRisk.toFixed(2)} 超过净值 ${(riskPct * 100).toFixed(1)}%（${budget.toFixed(2)}）`
    }
  }

  const riskCap = budget / (contractSize * slDistance)
  const preferred =
    params.preferredVolume != null && params.preferredVolume > 0 ? params.preferredVolume : null
  const raw = preferred == null ? riskCap : Math.min(preferred, riskCap)
  let volume = alignVolume(raw, volumeStep)
  if (volume < volumeMin) volume = volumeMin
  if (volume > maxVolume) volume = alignVolume(maxVolume, volumeStep)
  if (volume > maxVolume) volume = maxVolume
  if (volume < volumeMin) {
    return { error: `覆盖后手数 ${volume} 低于最小手数 ${volumeMin}` }
  }
  const risk = volume * contractSize * slDistance
  if (risk > budget + 1e-6) {
    return {
      error: `覆盖后风险 ${risk.toFixed(2)} 超过净值 ${(riskPct * 100).toFixed(1)}%（${budget.toFixed(2)}）`
    }
  }
  return { volume }
}

function startOfLocalDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function sentOpensToday(records: AgentRecord[], symbol: string, now: number): number {
  const dayStart = startOfLocalDay(now)
  let count = 0
  for (const row of records) {
    if (row.symbol !== symbol) continue
    if (row.decision.action !== 'open_buy' && row.decision.action !== 'open_sell') continue
    if (row.execution?.status !== 'sent') continue
    const t = Date.parse(row.createdAt)
    if (Number.isFinite(t) && t >= dayStart) count += 1
  }
  return count
}

/** 今日已平仓单的尾部连亏笔数（closedAt 为经纪商时间，按本地日近似即可） */
export function consecutiveLossesToday(records: AgentRecord[], now: number): number {
  const dayStart = startOfLocalDay(now)
  const closed = records
    .filter(
      (row) =>
        row.outcome?.status === 'closed' &&
        row.outcome.pnl != null &&
        Number.isFinite(Date.parse(row.outcome.closedAt ?? '')) &&
        Date.parse(row.outcome.closedAt ?? '') >= dayStart
    )
    .sort(
      (a, b) =>
        Date.parse(a.outcome?.closedAt ?? a.createdAt) -
        Date.parse(b.outcome?.closedAt ?? b.createdAt)
    )
  let streak = 0
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    if ((closed[i].outcome?.pnl ?? 0) < 0) streak += 1
    else break
  }
  return streak
}

export function lastPassedOpenAt(records: AgentRecord[], symbol: string): number | null {
  let latest: number | null = null
  for (const row of records) {
    if (row.symbol !== symbol) continue
    if (row.decision.action !== 'open_buy' && row.decision.action !== 'open_sell') continue
    if (row.execution?.status !== 'sent') continue
    const t = Date.parse(row.createdAt)
    if (!Number.isFinite(t)) continue
    if (latest == null || t > latest) latest = t
  }
  return latest
}

function findPosition(
  snapshot: DecisionSnapshot,
  ticket: number | undefined
): SnapshotPosition | null {
  const rows = snapshot.account?.positions ?? []
  if (ticket == null) return rows.length === 1 ? rows[0] : null
  return rows.find((row) => row.ticket === ticket) ?? null
}

export function evaluateRisk(
  decision: AgentDecision,
  snapshot: DecisionSnapshot,
  ctx: RiskContext
): RiskResult {
  const { action } = decision
  if (action === 'hold') {
    return pass()
  }

  if (action === 'close_position' || action === 'adjust_sltp') {
    if (decision.ticket == null) {
      return reject('平仓或改止损必须带 ticket')
    }
    const pos = findPosition(snapshot, decision.ticket)
    if (!pos) {
      return reject('找不到对应持仓')
    }
    if (action === 'adjust_sltp') {
      if (decision.sl == null && decision.tp == null) {
        return reject('改止损必须带 sl 或 tp')
      }
      const bid = snapshot.technical?.price.bid
      const ask = snapshot.technical?.price.ask
      if (bid != null && ask != null) {
        if (decision.sl != null) {
          if (pos.type === 'buy' && decision.sl >= bid) return reject('多单止损必须低于买价 bid')
          if (pos.type === 'sell' && decision.sl <= ask) return reject('空单止损必须高于卖价 ask')
        }
        if (decision.tp != null) {
          if (pos.type === 'buy' && decision.tp <= ask) return reject('多单止盈必须高于卖价 ask')
          if (pos.type === 'sell' && decision.tp >= bid) return reject('空单止盈必须低于买价 bid')
        }
      }
    }
    return pass(pos.volume)
  }

  if (action !== 'open_buy' && action !== 'open_sell') {
    return reject(`未知动作 ${action}`)
  }

  if (snapshot.constraints.tradingHalted) {
    return reject(snapshot.constraints.haltReason ?? '暂停开仓')
  }

  if (snapshot.account?.tradeAllowed === false) {
    return reject('终端禁止交易')
  }

  if ((snapshot.account?.positions.length ?? 0) > 0) {
    return reject('同品种已有持仓')
  }

  if (decision.confidence < 0.6) {
    return reject(`confidence ${decision.confidence} < 0.6`)
  }

  if (decision.sl == null) {
    return reject('开仓必须带止损')
  }

  const atr = snapshot.technical?.timeframes.H1?.atr14
  const bid = snapshot.technical?.price.bid
  const ask = snapshot.technical?.price.ask
  if (atr == null || atr <= 0 || bid == null || ask == null) {
    return reject('缺少 H1 ATR 或现价')
  }

  // 多单按 ask 成交、SL 由 bid 触发；空单反之。按触发侧校验，避免 SL 落在点差内一进场就触发
  const buy = action === 'open_buy'
  if (buy && decision.sl >= bid) {
    return reject('多单止损必须低于买价 bid')
  }
  if (!buy && decision.sl <= ask) {
    return reject('空单止损必须高于卖价 ask')
  }

  if (decision.tp != null) {
    if (buy && decision.tp <= ask) {
      return reject('多单止盈必须高于卖价 ask')
    }
    if (!buy && decision.tp >= bid) {
      return reject('空单止盈必须低于买价 bid')
    }
  }

  const entry = buy ? ask : bid
  const dist = Math.abs(entry - decision.sl)
  const min = 0.3 * atr
  const max = 5 * atr
  if (dist < min || dist > max) {
    return {
      verdict: 'reject',
      reason: `止损距离 ${dist.toFixed(2)} 不在 [${min.toFixed(2)}, ${max.toFixed(2)}]（0.3–5×H1 ATR）`,
      sizedVolume: null
    }
  }

  const equity = snapshot.account?.equity
  if (equity == null || !(equity > 0)) {
    return reject('账户净值不可用')
  }

  const dailyPnl = snapshot.account?.dailyPnl
  if (dailyPnl != null && dailyPnl <= -equity * DAILY_LOSS_PCT) {
    return reject(
      `当日亏损 ${dailyPnl.toFixed(2)} 达到净值 ${(DAILY_LOSS_PCT * 100).toFixed(0)}%（${(equity * DAILY_LOSS_PCT).toFixed(2)}）`
    )
  }

  const now = ctx.now ?? Date.now()
  const lastOpen = lastPassedOpenAt(ctx.records, snapshot.meta.symbol)
  if (lastOpen != null && now - lastOpen < ctx.intervalMs) {
    const waitMin = Math.ceil((ctx.intervalMs - (now - lastOpen)) / 60_000)
    return reject(`距上次开仓不足一个决策周期（约 ${waitMin} 分钟）`)
  }

  if (sentOpensToday(ctx.records, snapshot.meta.symbol, now) >= MAX_OPENS_PER_DAY) {
    return reject(`今日开仓已达上限 ${MAX_OPENS_PER_DAY} 笔`)
  }

  if (consecutiveLossesToday(ctx.records, now) >= MAX_CONSECUTIVE_LOSSES) {
    return reject(`今日已连续亏损 ${MAX_CONSECUTIVE_LOSSES} 笔，暂停开仓`)
  }

  const sized = sizeOpenVolume({
    equity,
    slDistance: dist,
    contractSize: snapshot.constraints.contractSize ?? 0,
    volumeMin: snapshot.constraints.volumeMin ?? 0,
    volumeStep: snapshot.constraints.volumeStep ?? 0,
    maxVolume: snapshot.constraints.maxVolume,
    riskPct: snapshot.constraints.riskPct,
    preferredVolume: snapshot.constraints.fixedVolume
  })
  if ('error' in sized) {
    return reject(sized.error)
  }
  return pass(sized.volume)
}
