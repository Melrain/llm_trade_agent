import type { MarketSnapshot } from '../../../../preload/market-types'

export type EquitySample = {
  t: number
  v: number
}

export type MarketState = MarketSnapshot & {
  loading: boolean
  equitySamples: EquitySample[]
}

export type MarketActions = {
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  applySnapshot: (snapshot: MarketSnapshot) => void
}

export type MarketStore = MarketState & MarketActions
