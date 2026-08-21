import type { NewsFeedInfo, NewsSnapshot } from '../../../../preload/news-types'

export type NewsState = NewsSnapshot & {
  loading: boolean
  feeds: NewsFeedInfo[]
}

export type NewsActions = {
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  applySnapshot: (snapshot: NewsSnapshot) => void
  openUrl: (url: string) => Promise<void>
  loadFeeds: () => Promise<void>
  openFeedsConfig: () => Promise<void>
}

export type NewsStore = NewsState & NewsActions
