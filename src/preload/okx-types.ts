export type TradeVenue = 'mt5' | 'okx'

export type OkxTdMode = 'cross' | 'isolated'
export type OkxPosMode = 'net_mode' | 'long_short_mode'
export type OkxSide = 'buy' | 'sell'
export type OkxPosSide = 'long' | 'short'
export type OkxOrdType = 'market' | 'limit' | 'post_only' | 'fok' | 'ioc'

export const DEFAULT_OKX_INST_ID = 'BTC-USDT-SWAP'
export const DEFAULT_OKX_LEVERAGE = 5
export const DEFAULT_OKX_TD_MODE: OkxTdMode = 'cross'
export const OKX_INST_PRESETS = [
  'BTC-USDT-SWAP',
  'ETH-USDT-SWAP',
  'SOL-USDT-SWAP',
  'XAU-USDT-SWAP'
] as const

export type OkxInstrumentSpec = {
  instId: string
  ctVal: number
  lotSz: number
  tickSz: number
  minSz: number
  digits: number
}

export type OkxTicker = {
  instId: string
  last: number
  bid: number
  ask: number
  mid: number
  ts: number
}

export type OkxCandle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  confirm: boolean
}

export type OkxBalance = {
  uid: string | null
  totalEq: number
  availEq: number
  adjEq: number
  upl: number
  isoEq: number
  details: Array<{
    ccy: string
    eq: number
    availEq: number
    upl: number
  }>
}

export type OkxPosition = {
  instId: string
  posId: string
  pos: number
  posSide: 'net' | 'long' | 'short'
  avgPx: number
  upl: number
  lever: number
  mgnMode: OkxTdMode
  notionalUsd: number
  last: number
  slTriggerPx: number | null
  tpTriggerPx: number | null
}

export type OkxFill = {
  instId: string
  tradeId: string
  ordId: string
  clOrdId: string
  side: OkxSide
  posSide: string
  fillPx: number
  fillSz: number
  fee: number
  ts: number
  execType: string
}

export type OkxBill = {
  billId: string
  instId: string
  type: string
  subType: string
  pnl: number
  fee: number
  ts: number
}

export type OkxPlaceOrderInput = {
  instId: string
  side: OkxSide
  sz: string
  ordType?: OkxOrdType
  px?: string
  tdMode?: OkxTdMode
  posSide?: OkxPosSide
  clOrdId?: string
  reduceOnly?: boolean
  lever?: string
  sl?: number
  tp?: number
}

export type OkxTradeIntent = {
  kind: 'place' | 'close' | 'amend-sltp'
  instId: string
  tdMode: OkxTdMode
  side?: OkxSide
  sz?: string
  posSide?: OkxPosSide
  ordType?: OkxOrdType
  sl?: number
  tp?: number
  reduceOnly?: boolean
  clOrdId?: string
  lever?: string
}

export type OkxOrderResult = {
  code: string
  msg: string
  ordId: string | null
  clOrdId: string | null
  sCode: string | null
  sMsg: string | null
  avgPx: number | null
  sz: number | null
}

export type OkxConnectionTest = {
  ok: boolean
  demo: boolean
  uid: string | null
  posMode: OkxPosMode | null
  error: string | null
}

export type OkxPublicConfig = {
  instId: string
  demo: boolean
  leverage: number
  tdMode: OkxTdMode
  hasKeys: boolean
}

export type OkxApi = {
  test: () => Promise<OkxConnectionTest>
  placeOrder: (input: OkxPlaceOrderInput) => Promise<OkxOrderResult>
  closePosition: (instId?: string) => Promise<OkxOrderResult>
}
