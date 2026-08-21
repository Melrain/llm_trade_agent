export type PmPriceSource = 'mid' | 'last' | 'midpoint_fallback' | 'gamma_outcomePrices'

export type PmLadderDirection = 'up' | 'down' | 'flat'

export type PmLadderRow = {
  label: string
  direction?: PmLadderDirection
  strike?: number
  unit?: 'USD' | 'bps'
  impliedProb: number
  probChange24h: number | null
  volume24h: number | null
  slug?: string
}

export type PmSpotPrice = {
  symbol: string
  price: number
  change24h: number | null
  change24hPct: number | null
  asOf: string
}

export type PmQuote = {
  id: string
  symbol: string
  role: string
  primary: boolean
  notes?: string
  eventTitle: string
  question: string
  marketLabel: string
  slug: string
  impliedProb: number | null
  probSource: PmPriceSource | null
  probChange24h: number | null
  volume24h: number | null
  volume: number | null
  endDate: string | null
  stale: boolean
  staleReason?: string
  asOf: string | null
  ladder: PmLadderRow[]
  spot?: PmSpotPrice | null
}

export type PmHealthStatus = 'idle' | 'ok' | 'degraded' | 'error'

export type PmHealth = {
  status: PmHealthStatus
  lastSuccessAt: string | null
  lastError: string | null
  consecutiveFailures: number
  pollIntervalMs: number
}

export type PmSnapshot = {
  symbol: string
  displayName: string
  quotes: PmQuote[]
  health: PmHealth
}

export type PmApi = {
  getSnapshot: (symbol?: string) => Promise<PmSnapshot>
  refresh: (symbol?: string) => Promise<PmSnapshot>
  openEvent: (slug: string) => Promise<void>
  onUpdated: (callback: (snapshot: PmSnapshot) => void) => () => void
}
