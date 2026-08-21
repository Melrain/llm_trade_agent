import { create } from 'zustand'

import type { PmHealth } from '../../../../preload/pm-types'
import type { PmStore } from './types'

const idleHealth: PmHealth = {
  status: 'idle',
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailures: 0,
  pollIntervalMs: 60_000
}

const initialState = {
  symbol: 'XAUUSD',
  displayName: '黄金',
  quotes: [],
  health: idleHealth,
  loading: true,
  refreshing: false
}

let subscribed = false

export const usePmStore = create<PmStore>()((set, get) => ({
  ...initialState,
  applySnapshot: (snapshot) => {
    const pending = snapshot.health.status === 'idle' && snapshot.quotes.length === 0
    set({
      symbol: snapshot.symbol,
      displayName: snapshot.displayName,
      quotes: snapshot.quotes,
      health: snapshot.health,
      loading: pending
    })
  },
  initialize: async () => {
    if (!subscribed) {
      subscribed = true
      window.api.pm.onUpdated((snapshot) => {
        get().applySnapshot(snapshot)
      })
    }
    try {
      const snapshot = await window.api.pm.getSnapshot('XAUUSD')
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[pm] snapshot failed', error)
      set({ loading: false })
    }
  },
  refresh: async () => {
    set({ refreshing: true })
    try {
      const snapshot = await window.api.pm.refresh('XAUUSD')
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[pm] refresh failed', error)
    } finally {
      set({ refreshing: false })
    }
  },
  openEvent: async (slug) => {
    await window.api.pm.openEvent(slug)
  },
  openWatchConfig: async () => {
    await window.api.pm.openWatchConfig()
  }
}))
