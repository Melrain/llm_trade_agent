export type MarketTrend = 'up' | 'down' | 'range'

export type MarketBar = {
  t: string
  o: number
  h: number
  l: number
  c: number
}

export type MarketTimeframeId = 'M15' | 'H1' | 'H4' | 'D1'

export type MarketLevelId = 'h4' | 'prevDay' | 'd5' | 'd20'

export type MarketLevel = {
  id: MarketLevelId
  high: number
  low: number
  /** 现价在区间中的位置，0=低点 1=高点 */
  pos: number | null
}

export type MarketTimeframePack = {
  bars: number
  recentBars: MarketBar[]
  ema20: number | null
  ema50: number | null
  ema200: number | null
  rsi14: number | null
  atr14: number | null
  trend: MarketTrend | null
  pctChange24h: number | null
}

export type MarketPositionRow = {
  ticket: number
  type: 'buy' | 'sell'
  volume: number
  priceOpen: number
  priceCurrent: number
  profit: number
  swap: number
  sl: number
  tp: number
  magic: number
}

export type MarketSnapshot = {
  venue?: 'mt5' | 'okx'
  symbol: string
  asOf: string | null
  ready: boolean
  lastError: string | null
  /** 本机时间戳：bid/ask 最近一次变动，用于判断休市/断流 */
  priceChangedAt: number | null
  price: {
    bid: number
    ask: number
    mid: number
    spread: number
  } | null
  swap: { long: number | null; short: number | null } | null
  specs: {
    volumeMin: number | null
    volumeStep: number | null
    contractSize: number | null
    fillingMode: number | null
    digits: number | null
  } | null
  timeframes: Record<MarketTimeframeId, MarketTimeframePack | null>
  levels: MarketLevel[]
  account: {
    balance: number
    equity: number
    marginFree: number
    profit: number
    currency: string
    tradeMode: number
    tradeAllowed: boolean
    login: number
    server: string
  } | null
  positions: MarketPositionRow[]
}

export type MarketApi = {
  getSnapshot: () => Promise<MarketSnapshot>
  refresh: () => Promise<MarketSnapshot>
  onUpdated: (callback: (snapshot: MarketSnapshot) => void) => () => void
}
