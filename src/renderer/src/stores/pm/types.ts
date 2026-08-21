import type { PmHealth, PmQuote, PmSnapshot } from '../../../../preload/pm-types'

export type PmState = {
  symbol: string
  displayName: string
  quotes: PmQuote[]
  health: PmHealth
  loading: boolean
  refreshing: boolean
}

export type PmActions = {
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  openEvent: (slug: string) => Promise<void>
  applySnapshot: (snapshot: PmSnapshot) => void
}

export type PmStore = PmState & PmActions
