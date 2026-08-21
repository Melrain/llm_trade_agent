export type AppPage = 'dashboard' | 'chart' | 'agent' | 'intel' | 'review' | 'settings'

export type AppState = {
  initialized: boolean
  activePage: AppPage
  focusRecordId: string | null
}

export type AppActions = {
  initialize: () => void
  reset: () => void
  setActivePage: (page: AppPage) => void
  openAgentRecord: (id: string) => void
  clearFocusRecord: () => void
}

export type AppStore = AppState & AppActions
