/**
 * Official MetaTrader5 Python package → Electron mapping.
 * Function names and request fields match
 * https://www.mql5.com/en/docs/python_metatrader5
 *
 * Not wired yet: login, copy_rates_range, copy_ticks_*, history_orders_*, market_book_*.
 */

export const TRADE_ACTION_DEAL = 1
export const TRADE_ACTION_PENDING = 5
export const TRADE_ACTION_SLTP = 6
export const TRADE_ACTION_MODIFY = 7
export const TRADE_ACTION_REMOVE = 8
export const TRADE_ACTION_CLOSE_BY = 10

export const ORDER_TYPE_BUY = 0
export const ORDER_TYPE_SELL = 1
export const ORDER_TYPE_BUY_LIMIT = 2
export const ORDER_TYPE_SELL_LIMIT = 3
export const ORDER_TYPE_BUY_STOP = 4
export const ORDER_TYPE_SELL_STOP = 5
export const ORDER_TYPE_BUY_STOP_LIMIT = 6
export const ORDER_TYPE_SELL_STOP_LIMIT = 7
export const ORDER_TYPE_CLOSE_BY = 8

/** order_send type_filling */
export const ORDER_FILLING_FOK = 0
export const ORDER_FILLING_IOC = 1
export const ORDER_FILLING_RETURN = 2
export const ORDER_FILLING_BOC = 3

export const ORDER_TIME_GTC = 0
export const ORDER_TIME_DAY = 1
export const ORDER_TIME_SPECIFIED = 2
export const ORDER_TIME_SPECIFIED_DAY = 3

export const POSITION_TYPE_BUY = 0
export const POSITION_TYPE_SELL = 1

/** deal.entry */
export const DEAL_ENTRY_IN = 0
export const DEAL_ENTRY_OUT = 1
export const DEAL_ENTRY_INOUT = 2
export const DEAL_ENTRY_OUT_BY = 3

/** account_info.trade_mode */
export const ACCOUNT_TRADE_MODE_DEMO = 0
export const ACCOUNT_TRADE_MODE_CONTEST = 1
export const ACCOUNT_TRADE_MODE_REAL = 2

export type AccountMode = 'demo' | 'real' | 'unknown'

export function accountModeFromTradeMode(mode: number | null | undefined): AccountMode {
  if (mode === ACCOUNT_TRADE_MODE_DEMO) return 'demo'
  if (mode === ACCOUNT_TRADE_MODE_REAL) return 'real'
  return 'unknown'
}

/** Python last_error / some brokers' order_send success */
export const RES_S_OK = 0
export const TRADE_RETCODE_DONE = 10009
export const TRADE_RETCODE_DONE_PARTIAL = 10010
export const TRADE_RETCODE_PLACED = 10008
export const TRADE_RETCODE_INVALID_FILL = 10030

export function isTradeSuccess(retcode: number | undefined): boolean {
  return (
    retcode === RES_S_OK ||
    retcode === TRADE_RETCODE_DONE ||
    retcode === TRADE_RETCODE_DONE_PARTIAL ||
    retcode === TRADE_RETCODE_PLACED
  )
}

/** symbol_info.filling_mode bits: 1=FOK, 2=IOC, 4=RETURN */
export function fillingFromMode(mode: number | undefined): number {
  return fillingCandidates(mode)[0] ?? ORDER_FILLING_IOC
}

export function fillingCandidates(mode: number | undefined): number[] {
  const bits = mode ?? 0
  const allowed: number[] = []
  if (bits & 2) allowed.push(ORDER_FILLING_IOC)
  if (bits & 1) allowed.push(ORDER_FILLING_FOK)
  if (bits & 4) allowed.push(ORDER_FILLING_RETURN)
  if (allowed.length === 0) {
    return [ORDER_FILLING_IOC, ORDER_FILLING_FOK, ORDER_FILLING_RETURN]
  }
  return allowed
}

export type Mt5LastError = [code: number, description: string]

export type Mt5AccountInfo = {
  login: number
  trade_mode: number
  leverage: number
  limit_orders: number
  margin_so_mode: number
  trade_allowed: boolean
  trade_expert: boolean
  margin_mode: number
  currency_digits: number
  fifo_close: boolean
  balance: number
  credit: number
  profit: number
  equity: number
  margin: number
  margin_free: number
  margin_level: number
  margin_so_call: number
  margin_so_so: number
  margin_initial: number
  margin_maintenance: number
  assets: number
  liabilities: number
  commission_blocked: number
  name: string
  server: string
  currency: string
  company: string
}

export type Mt5TerminalInfo = {
  community_account: boolean
  community_connection: boolean
  connected: boolean
  dlls_allowed: boolean
  trade_allowed: boolean
  tradeapi_disabled: boolean
  email_enabled: boolean
  ftp_enabled: boolean
  notifications_enabled: boolean
  mqid: boolean
  build: number
  maxbars: number
  codepage: number
  ping_last: number
  community_balance: number
  retransmission: number
  company: string
  name: string
  language: string
  path: string
  data_path: string
  commondata_path: string
}

export type Mt5SymbolInfo = {
  name: string
  custom: boolean
  select: boolean
  visible: boolean
  digits: number
  spread: number
  spread_float: boolean
  trade_mode: number
  trade_exemode: number
  filling_mode: number
  point: number
  volume_min: number
  volume_max: number
  volume_step: number
  trade_contract_size: number
  currency_base: string
  currency_profit: string
  currency_margin: string
  description: string
  path: string
  bid: number
  ask: number
  swap_long?: number
  swap_short?: number
  [key: string]: unknown
}

export type Mt5Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1'

export type Mt5Rate = {
  time: number
  open: number
  high: number
  low: number
  close: number
  tick_volume: number
  spread: number
}

export type Mt5Tick = {
  time: number
  bid: number
  ask: number
  last: number
  volume: number
  time_msc: number
  flags: number
  volume_real: number
}

export type Mt5Position = {
  ticket: number
  time: number
  time_msc: number
  time_update: number
  time_update_msc: number
  type: number
  magic: number
  identifier: number
  reason: number
  volume: number
  price_open: number
  sl: number
  tp: number
  price_current: number
  swap: number
  profit: number
  symbol: string
  comment: string
  external_id: string
}

export type Mt5Order = {
  ticket: number
  time_setup: number
  time_setup_msc: number
  time_done: number
  time_done_msc: number
  time_expiration: number
  type: number
  type_time: number
  type_filling: number
  state: number
  magic: number
  volume_initial: number
  volume_current: number
  price_open: number
  sl: number
  tp: number
  price_current: number
  price_stoplimit: number
  symbol: string
  comment: string
  external_id: string
  position_id: number
  position_by_id: number
  reason: number
}

/** Official order_send / order_check request (MqlTradeRequest). */
export type Mt5TradeRequest = {
  action: number
  magic?: number
  order?: number
  symbol?: string
  volume?: number
  price?: number
  stoplimit?: number
  sl?: number
  tp?: number
  deviation?: number
  type?: number
  type_filling?: number
  type_time?: number
  expiration?: number
  comment?: string
  position?: number
  position_by?: number
}

export type Mt5OrderSendResult = {
  retcode: number
  deal: number
  order: number
  volume: number
  price: number
  bid: number
  ask: number
  comment: string
  request_id: number
  retcode_external: number
  request: Mt5TradeRequest
}

export type Mt5OrderCheckResult = {
  retcode: number
  balance: number
  equity: number
  profit: number
  margin: number
  margin_free: number
  margin_level: number
  comment: string
  request: Mt5TradeRequest
}

export type Mt5Deal = {
  ticket: number
  order: number
  /** Unix 毫秒（bridge 会把秒级 time 乘 1000） */
  time: number
  type: number
  entry: number
  magic: number
  position_id: number
  volume: number
  price: number
  commission: number
  swap: number
  profit: number
  fee: number
  symbol: string
  comment: string
}

export type Mt5Filter = {
  symbol?: string
  group?: string
  ticket?: number
}

export type Mt5Api = {
  version: () => Promise<[number, number, string] | null>
  last_error: () => Promise<Mt5LastError>
  account_info: () => Promise<Mt5AccountInfo | null>
  terminal_info: () => Promise<Mt5TerminalInfo | null>
  symbols_total: () => Promise<number>
  symbols_get: (group?: string) => Promise<Mt5SymbolInfo[]>
  symbol_info: (symbol: string) => Promise<Mt5SymbolInfo | null>
  symbol_info_tick: (symbol: string) => Promise<Mt5Tick | null>
  symbol_select: (symbol: string, enable?: boolean) => Promise<boolean>
  copy_rates_from_pos: (
    symbol: string,
    timeframe: Mt5Timeframe,
    start?: number,
    count?: number
  ) => Promise<Mt5Rate[]>
  history_deals_get: (dateFrom: number, dateTo: number, group?: string) => Promise<Mt5Deal[]>
  positions_total: () => Promise<number>
  positions_get: (filter?: Mt5Filter) => Promise<Mt5Position[]>
  orders_total: () => Promise<number>
  orders_get: (filter?: Mt5Filter) => Promise<Mt5Order[]>
  order_check: (request: Mt5TradeRequest) => Promise<Mt5OrderCheckResult>
  order_send: (request: Mt5TradeRequest) => Promise<Mt5OrderSendResult>
}
