import { create } from 'zustand'

import type { AppStore } from './types'

const initialState = {
  initialized: false,
  activePage: 'dashboard' as const,
  focusRecordId: null
}

export const useAppStore = create<AppStore>()((set) => ({
  ...initialState,
  initialize: () => set({ initialized: true }),
  reset: () => set(initialState),
  setActivePage: (page) => set({ activePage: page }),
  openAgentRecord: (id) => set({ activePage: 'agent', focusRecordId: id }),
  clearFocusRecord: () => set({ focusRecordId: null })
}))
