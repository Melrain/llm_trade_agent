import { create } from 'zustand'

import type { NewsSnapshot } from '../../../../preload/news-types'
import type { NewsStore } from './types'

const empty: NewsSnapshot = {
  asOf: null,
  lastError: null,
  headlines: [],
  calendar: []
}

let subscribed = false

export const useNewsStore = create<NewsStore>()((set, get) => ({
  ...empty,
  loading: true,
  feeds: [],
  applySnapshot: (snapshot) => {
    set({
      ...snapshot,
      loading:
        snapshot.asOf == null && snapshot.headlines.length === 0 && snapshot.calendar.length === 0
    })
  },
  initialize: async () => {
    if (!subscribed) {
      subscribed = true
      window.api.news.onUpdated((snapshot) => {
        get().applySnapshot(snapshot)
      })
    }
    try {
      const snapshot = await window.api.news.getSnapshot()
      get().applySnapshot(snapshot)
      const feeds = await window.api.news.listFeeds()
      set({ feeds })
    } catch (error) {
      console.error('[news] snapshot failed', error)
      set({ loading: false })
    }
  },
  refresh: async () => {
    try {
      const snapshot = await window.api.news.refresh()
      get().applySnapshot(snapshot)
    } catch (error) {
      console.error('[news] refresh failed', error)
    }
  },
  openUrl: async (url) => {
    await window.api.news.openUrl(url)
  },
  loadFeeds: async () => {
    try {
      const feeds = await window.api.news.listFeeds()
      set({ feeds })
    } catch (error) {
      console.error('[news] listFeeds failed', error)
    }
  }
}))
