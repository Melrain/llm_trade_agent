export type NewsImpact = 'high' | 'medium' | 'low'

export type NewsHeadline = {
  id: string
  source: string
  sourceZh: string
  title: string
  summary: string
  url: string
  publishedAt: string
  tags: string[]
}

export type CalendarEvent = {
  id: string
  title: string
  titleZh: string
  currency: string
  impact: NewsImpact
  when: string
  forecast: string | null
  previous: string | null
  actual: string | null
  /** 高影响事件处于禁开仓窗口（前后 15 分钟） */
  inWindow: boolean
  soon: boolean
}

export type NewsSnapshot = {
  asOf: string | null
  lastError: string | null
  headlines: NewsHeadline[]
  calendar: CalendarEvent[]
}

export type NewsFeedInfo = {
  source: string
  sourceZh: string
  url: string
  enabled: boolean
}

export type NewsApi = {
  getSnapshot: () => Promise<NewsSnapshot>
  refresh: () => Promise<NewsSnapshot>
  listFeeds: () => Promise<NewsFeedInfo[]>
  openUrl: (url: string) => Promise<void>
  onUpdated: (callback: (snapshot: NewsSnapshot) => void) => () => void
}
