import { create } from 'zustand'

import type { SnapshotStore } from './types'

let subscribed = false

export const useSnapshotStore = create<SnapshotStore>()((set, get) => ({
  current: null,
  byId: {},
  loading: true,
  applySnapshot: (snapshot) => {
    set((state) => ({
      current: snapshot,
      loading: false,
      byId: { ...state.byId, [snapshot.meta.snapshotId]: snapshot }
    }))
  },
  initialize: async () => {
    if (!subscribed) {
      subscribed = true
      window.api.snapshot.onUpdated((snapshot) => {
        get().applySnapshot(snapshot)
      })
    }
    try {
      const snapshot = await window.api.snapshot.getSnapshot()
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[snapshot] get failed', error)
      set({ loading: false })
    }
  },
  refresh: async () => {
    try {
      const snapshot = await window.api.snapshot.refresh()
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[snapshot] refresh failed', error)
    }
  },
  loadById: async (snapshotId) => {
    if (!snapshotId) return null
    const cached = get().byId[snapshotId]
    if (cached) return cached
    if (get().current?.meta.snapshotId === snapshotId) return get().current
    try {
      const snapshot = await window.api.snapshot.getById(snapshotId)
      if (snapshot) {
        set((state) => ({ byId: { ...state.byId, [snapshotId]: snapshot } }))
      }
      return snapshot
    } catch (error) {
      console.error('[snapshot] getById failed', error)
      return null
    }
  }
}))
