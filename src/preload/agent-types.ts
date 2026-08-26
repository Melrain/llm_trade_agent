import type { AccountMode, Mt5TradeRequest } from './mt5-types'
import type { OkxPublicConfig, OkxTdMode, OkxTradeIntent, TradeVenue } from './okx-types'

/** 本引擎发出的所有订单都带这个 magic，用于对账和识别自有仓位 */
export const AGENT_MAGIC = 260820
/** 有持仓时决策周期加密到 5 分钟 */
export const HOLDING_INTERVAL_MS = 5 * 60_000

export type AgentAction = 'open_buy' | 'open_sell' | 'close_position' | 'adjust_sltp' | 'hold'

export type AgentDecision = {
  action: AgentAction
  symbol: string
  volume?: number
  sl?: number
  tp?: number
  ticket?: number
  confidence: number
  reasoning: string
  keyFactors: string[]
}

export type AgentRiskVerdict = 'pass' | 'reject'

export type AgentOrderCheck = {
  retcode: number
  comment: string
  margin: number | null
  marginFree: number | null
}

export type AgentOrderSend = {
  retcode: number
  deal: number | null
  order: number | null
  volume: number | null
  price: number | null
  comment: string
}

export type AgentExecution = {
  status: 'preview' | 'sent' | 'rejected' | 'skipped'
  reason: string
}

/** 已发单开仓的后续结果，由对账定期回写 */
export type AgentOutcome = {
  status: 'open' | 'closed'
  positionId: number | null
  /** 经纪商服务器时间（Z 不代表 UTC，与 K 线一致） */
  closedAt: string | null
  closePrice: number | null
  /** 已实现盈亏（含手续费/过夜费） */
  pnl: number | null
}

export type AgentStats = {
  totalDecisions: number
  holdCount: number
  openCount: number
  sentCount: number
  closedCount: number
  wins: number
  losses: number
  winRate: number | null
  totalPnl: number | null
  avgWin: number | null
  avgLoss: number | null
  profitFactor: number | null
  totalTokens: number
}

export type AgentRecord = {
  id: string
  /** 执行（风控/组单）时用的快照 */
  snapshotId: string
  /** 模型实际看到的快照；null 表示与 snapshotId 相同（旧记录） */
  promptSnapshotId?: string | null
  symbol: string
  createdAt: string
  promptVersion: string
  model: string
  decision: AgentDecision
  parseError: string | null
  riskVerdict: AgentRiskVerdict
  riskReason: string | null
  tokens: { prompt: number; completion: number; total: number } | null
  skipped: string | null
  sizedVolume?: number | null
  intendedRequest?: Mt5TradeRequest | null
  intendedOkxRequest?: OkxTradeIntent | null
  check?: AgentOrderCheck | null
  send?: AgentOrderSend | null
  execution?: AgentExecution | null
  outcome?: AgentOutcome | null
}

export type AgentPublicConfig = {
  baseUrl: string
  model: string
  temperature: number
  intervalMs: number
  enabled: boolean
  tradingEnabled: boolean
  accountMode: AccountMode
  hasApiKey: boolean
  maxVolume: number
  riskPct: number
  fixedVolume: number | null
  venue: TradeVenue
  okx: OkxPublicConfig
}

export type AgentConfigPatch = {
  baseUrl?: string
  model?: string
  temperature?: number
  intervalMs?: number
  enabled?: boolean
  tradingEnabled?: boolean
  apiKey?: string
  maxVolume?: number
  riskPct?: number
  fixedVolume?: number | null
  venue?: TradeVenue
  okxInstId?: string
  okxDemo?: boolean
  okxLeverage?: number
  okxTdMode?: OkxTdMode
  okxApiKey?: string
  okxSecret?: string
  okxPassphrase?: string
}

export type AgentApi = {
  list: () => Promise<AgentRecord[]>
  run: () => Promise<AgentRecord>
  getConfig: () => Promise<AgentPublicConfig>
  setConfig: (patch: AgentConfigPatch) => Promise<AgentPublicConfig>
  stats: () => Promise<AgentStats>
  onUpdated: (callback: (records: AgentRecord[]) => void) => () => void
  onConfig: (callback: (config: AgentPublicConfig) => void) => () => void
}
