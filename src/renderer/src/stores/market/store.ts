import { create } from 'zustand'

import type { MarketSnapshot } from '../../../../preload/market-types'
import type { MarketStore } from './types'

const empty: MarketSnapshot = {
  venue: 'mt5',
  symbol: 'XAUUSD',
  asOf: null,
  ready: false,
  lastError: null,
  priceChangedAt: null,
  price: null,
  swap: null,
  specs: null,
  timeframes: { M15: null, H1: null, H4: null, D1: null },
  levels: [],
  account: null,
  positions: []
}

let subscribed = false

const SAMPLE_GAP_MS = 15_000
const MAX_SAMPLES = 500

export const useMarketStore = create<MarketStore>()((set, get) => ({
  ...empty,
  loading: true,
  equitySamples: [],
  applySnapshot: (snapshot) => {
    const equity = snapshot.account?.equity
    let equitySamples = get().equitySamples
    if (equity != null && Number.isFinite(equity)) {
      const now = Date.now()
      const last = equitySamples.at(-1)
      if (!last || last.v !== equity || now - last.t >= SAMPLE_GAP_MS) {
        equitySamples = [...equitySamples, { t: now, v: equity }].slice(-MAX_SAMPLES)
      }
    }
    set({
      ...snapshot,
      equitySamples,
      loading: !snapshot.ready && !snapshot.lastError
    })
  },
  initialize: async () => {
    if (!subscribed) {
      subscribed = true
      window.api.market.onUpdated((snapshot) => {
        get().applySnapshot(snapshot)
      })
    }
    try {
      const snapshot = await window.api.market.getSnapshot()
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[market] snapshot failed', error)
      set({ loading: false })
    }
  },
  refresh: async () => {
    try {
      const snapshot = await window.api.market.refresh()
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[market] refresh failed', error)
    }
  }
}))
