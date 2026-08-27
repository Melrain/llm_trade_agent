export type TradeVenue = 'mt5' | 'okx'
export type TradeAsset = 'BTC' | 'ETH' | 'XAU'

export const TRADE_ASSETS = ['BTC', 'ETH', 'XAU'] as const
export const TRADE_ASSET_LABELS: Record<TradeAsset, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  XAU: '黄金'
}

export type OkxTdMode = 'cross' | 'isolated'
export type OkxPosMode = 'net_mode' | 'long_short_mode'
export type OkxSide = 'buy' | 'sell'
export type OkxPosSide = 'long' | 'short'
export type OkxOrdType = 'market' | 'limit' | 'post_only' | 'fok' | 'ioc'

export const DEFAULT_OKX_INST_ID = 'BTC-USDT-SWAP'
export const DEFAULT_OKX_LEVERAGE = 5
export const DEFAULT_OKX_TD_MODE: OkxTdMode = 'cross'
export const DEFAULT_TRADE_ASSET: TradeAsset = 'XAU'
export const OKX_INST_PRESETS = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'XAU-USDT-SWAP'] as const

export function isTradeAsset(value: unknown): value is TradeAsset {
  return value === 'BTC' || value === 'ETH' || value === 'XAU'
}

export function asTradeAsset(value: unknown): TradeAsset {
  return isTradeAsset(value) ? value : DEFAULT_TRADE_ASSET
}

export function isGoldMarketSymbol(symbol: string): boolean {
  const u = symbol.toUpperCase()
  return u.includes('XAU') || u.includes('GOLD')
}

export function okxInstIdForAsset(asset: TradeAsset): string {
  if (asset === 'ETH') return 'ETH-USDT-SWAP'
  if (asset === 'XAU') return 'XAU-USDT-SWAP'
  return 'BTC-USDT-SWAP'
}

export function assetFromInstId(instId: string): TradeAsset {
  const u = instId.toUpperCase()
  if (u.includes('XAU') || u.includes('GOLD')) return 'XAU'
  if (u.includes('ETH')) return 'ETH'
  return 'BTC'
}

export function mt5SymbolForAsset(asset: TradeAsset): string {
  if (asset === 'ETH') return 'ETHUSD'
  if (asset === 'XAU') return 'XAUUSD'
  return 'BTCUSD'
}

export function venueSymbol(venue: TradeVenue, asset: TradeAsset): string {
  return venue === 'okx' ? okxInstIdForAsset(asset) : mt5SymbolForAsset(asset)
}

/** 旧版默认 MT5 黄金。对齐 BTC/ETH 时把未选手种写成了 BTC，回退一次。 */
export function restoreMt5GoldDefault(
  venue: TradeVenue,
  asset: TradeAsset,
  alreadyRestored: boolean
): TradeAsset {
  if (alreadyRestored) return asset
  if (venue === 'mt5' && asset === 'BTC') return 'XAU'
  return asset
}

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
  hasDemoKeys: boolean
  hasLiveKeys: boolean
}

export type OkxCandleBar = '15m' | '1H' | '4H' | '1Dutc'

export type OkxApi = {
  test: () => Promise<OkxConnectionTest>
  placeOrder: (input: OkxPlaceOrderInput) => Promise<OkxOrderResult>
  closePosition: (instId?: string, posSide?: OkxPosSide) => Promise<OkxOrderResult>
  candles: (
    instId: string,
    bar: OkxCandleBar,
    limit?: number,
    after?: number
  ) => Promise<OkxCandle[]>
  amendSlTp: (input: {
    instId?: string
    sl?: number
    tp?: number
    sz: string
    side: OkxSide
    posSide?: OkxPosSide
  }) => Promise<OkxOrderResult>
}
