import type { AgentAction, AgentDecision } from '../../preload/agent-types'

const ACTIONS = new Set<AgentAction>([
  'open_buy',
  'open_sell',
  'close_position',
  'adjust_sltp',
  'hold'
])

export class DecisionParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecisionParseError'
  }
}

function asNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) {
      return JSON.parse(fenced[1].trim())
    }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new DecisionParseError('模型没有返回 JSON')
  }
}

export function parseDecision(raw: string, fallbackSymbol: string): AgentDecision {
  let parsed: unknown
  try {
    parsed = extractJson(raw)
  } catch (error) {
    if (error instanceof DecisionParseError) throw error
    throw new DecisionParseError('JSON 无法解析')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new DecisionParseError('JSON 根节点必须是对象')
  }
  const row = parsed as Record<string, unknown>
  const action = String(row.action ?? '') as AgentAction
  if (!ACTIONS.has(action)) {
    throw new DecisionParseError(`非法 action: ${String(row.action)}`)
  }
  const confidence = asNumber(row.confidence)
  if (confidence == null || confidence < 0 || confidence > 1) {
    throw new DecisionParseError('confidence 必须是 0 到 1')
  }
  const reasoning = typeof row.reasoning === 'string' ? row.reasoning.trim() : ''
  if (!reasoning) {
    throw new DecisionParseError('reasoning 必填')
  }
  const sl = asNumber(row.sl)
  if ((action === 'open_buy' || action === 'open_sell') && sl == null) {
    throw new DecisionParseError('开仓必须带 sl')
  }
  const keyRaw = row.key_factors ?? row.keyFactors
  const keyFactors = Array.isArray(keyRaw)
    ? keyRaw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 5)
    : []

  const symbol =
    typeof row.symbol === 'string' && row.symbol.trim() ? row.symbol.trim() : fallbackSymbol

  return {
    action,
    symbol,
    volume: asNumber(row.volume),
    sl,
    tp: asNumber(row.tp),
    ticket: asNumber(row.ticket),
    confidence,
    reasoning: reasoning.slice(0, 2000),
    keyFactors
  }
}

export function retryHint(error: string): string {
  return `上次输出校验失败：${error}。请只返回合法 JSON 对象，不要附加说明。`
}
