export type SnapshotSourceStatus = 'ok' | 'degraded' | 'unavailable' | 'error'

export type SnapshotPosition = {
  ticket: number
  type: 'buy' | 'sell'
  volume: number
  priceOpen: number
  profit: number
  sl: number
  tp: number
  magic: number
}

export type SnapshotBar = {
  t: string
  o: number
  h: number
  l: number
  c: number
}

export type SnapshotTimeframe = {
  ema20: number | null
  ema50: number | null
  ema200: number | null
  rsi14: number | null
  atr14: number | null
  trend: 'up' | 'down' | 'range' | null
  pctChange24h: number | null
  recentBars: SnapshotBar[]
}

export type SnapshotLevel = {
  id: string
  high: number
  low: number
  pos: number | null
}

export type SnapshotPmLeg = {
  label: string
  impliedProb: number
  probChange24h: number | null
}

export type SnapshotPmMarket = {
  id: string
  role: string
  title: string
  slug: string
  stale: boolean
  volume24h: number | null
  endDate: string | null
  legs: SnapshotPmLeg[]
}

export type SnapshotNewsItem = {
  publishedAt: string
  source: string
  title: string
  summary: string
  tags: string[]
}

export type SnapshotCalendarItem = {
  when: string
  title: string
  titleZh: string
  currency: string
  impact: 'high' | 'medium' | 'low'
  forecast: string | null
  previous: string | null
  actual: string | null
}

export type DecisionSnapshot = {
  meta: {
    snapshotId: string
    symbol: string
    generatedAt: string
    /** MT5 K 线时间为经纪商服务器时间；OKX 为 UTC */
    barTime: 'mt5-server' | 'utc'
    venue?: 'mt5' | 'okx'
  }
  sources: {
    market: SnapshotSourceStatus
    polymarket: SnapshotSourceStatus
    news: SnapshotSourceStatus
    calendar: SnapshotSourceStatus
  }
  account: {
    balance: number
    equity: number
    marginFree: number
    profit: number
    dailyPnl: number | null
    dailyPnlRealized: number | null
    currency: string
    tradeMode: number
    tradeAllowed: boolean
    login: number
    server: string
    positions: SnapshotPosition[]
  } | null
  technical: {
    price: { bid: number; ask: number; mid: number; spread: number }
    timeframes: {
      M15: SnapshotTimeframe | null
      H1: SnapshotTimeframe | null
      H4: SnapshotTimeframe | null
      D1: SnapshotTimeframe | null
    }
    levels: SnapshotLevel[]
  } | null
  polymarket: SnapshotPmMarket[]
  news: SnapshotNewsItem[]
  calendar: SnapshotCalendarItem[]
  constraints: {
    maxVolume: number
    riskPct: number
    fixedVolume: number | null
    volumeMin: number | null
    volumeStep: number | null
    contractSize: number | null
    fillingMode: number | null
    digits: number | null
    swapLong: number | null
    swapShort: number | null
    allowedDirections: Array<'buy' | 'sell'>
    tradingHalted: boolean
    haltReason: string | null
  }
}

export type SnapshotApi = {
  getSnapshot: () => Promise<DecisionSnapshot>
  refresh: () => Promise<DecisionSnapshot>
  getById: (snapshotId: string) => Promise<DecisionSnapshot | null>
  onUpdated: (callback: (snapshot: DecisionSnapshot) => void) => () => void
}
