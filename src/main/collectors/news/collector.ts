import type { CalendarEvent, NewsHeadline, NewsSnapshot } from '../../../preload/news-types'
import { loadRecentNews, upsertNews } from '../../db/news'
import { fetchCalendar } from './calendar'
import {
  listEnabledFeeds,
  loadNewsFeeds,
  type NewsFeedInfo
} from './feeds'
import { fetchFeed, selectHeadlines } from './rss'

type Listener = (snapshot: NewsSnapshot) => void

const NEWS_INTERVAL_MS = 5 * 60 * 1000
const CALENDAR_INTERVAL_MS = 60 * 60 * 1000

function emptySnapshot(): NewsSnapshot {
  return {
    asOf: null,
    lastError: null,
    headlines: [],
    calendar: []
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class NewsCollector {
  private snapshot: NewsSnapshot = emptySnapshot()
  private newsError: string | null = null
  private calendarError: string | null = null
  private readonly listeners = new Set<Listener>()
  private newsTimer: NodeJS.Timeout | null = null
  private calendarTimer: NodeJS.Timeout | null = null
  private tail: Promise<void> = Promise.resolve()
  private started = false

  listFeeds(): NewsFeedInfo[] {
    return loadNewsFeeds()
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.hydrateHeadlines()
    void this.refresh()
    this.newsTimer = setInterval(() => {
      this.enqueue(() => this.pollNews())
    }, NEWS_INTERVAL_MS)
    this.calendarTimer = setInterval(() => {
      this.enqueue(() => this.pollCalendar())
    }, CALENDAR_INTERVAL_MS)
  }

  stop(): void {
    if (this.newsTimer) clearInterval(this.newsTimer)
    if (this.calendarTimer) clearInterval(this.calendarTimer)
    this.newsTimer = null
    this.calendarTimer = null
    this.started = false
  }

  getSnapshot(): NewsSnapshot {
    return this.snapshot
  }

  async refresh(): Promise<NewsSnapshot> {
    await this.enqueue(async () => {
      await Promise.all([this.pollNews(), this.pollCalendar()])
    })
    return this.snapshot
  }

  onUpdated(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.tail = this.tail.then(task, task)
    return this.tail
  }

  private async pollNews(): Promise<void> {
    const feeds = listEnabledFeeds()
    if (feeds.length === 0) {
      this.newsError = '没有启用的新闻源'
      this.patch({ headlines: [] })
      return
    }
    const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed)))
    const items: NewsHeadline[] = []
    const errors: string[] = []
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value)
        return
      }
      errors.push(`${feeds[i].sourceZh}: ${errorText(result.reason)}`)
    })

    if (items.length) {
      try {
        upsertNews(items)
      } catch (error) {
        console.warn('[news] persist', error instanceof Error ? error.message : error)
      }
    }
    const newsFailed = errors.length === feeds.length
    this.newsError = newsFailed ? errors.join('；') : null
    if (errors.length) {
      console.warn('[news]', errors.join('；'))
    }
    const headlines =
      newsFailed && this.snapshot.headlines.length > 0
        ? this.snapshot.headlines
        : selectHeadlines(items)
    this.patch({
      headlines,
      asOf: newsFailed && this.snapshot.asOf == null ? this.snapshot.asOf : new Date().toISOString()
    })
  }

  private hydrateHeadlines(): void {
    try {
      const cached = loadRecentNews()
      if (cached.length === 0) return
      this.patch({ headlines: selectHeadlines(cached) })
    } catch (error) {
      console.warn('[news] hydrate', error instanceof Error ? error.message : error)
    }
  }

  private async pollCalendar(): Promise<void> {
    try {
      const calendar: CalendarEvent[] = await fetchCalendar()
      this.calendarError = null
      this.patch({
        calendar,
        asOf: new Date().toISOString()
      })
    } catch (error) {
      this.calendarError = errorText(error).split('\n')[0]
      this.patch({})
      console.warn('[news] calendar', this.calendarError)
    }
  }

  private patch(partial: Partial<NewsSnapshot>): void {
    const errors = [this.newsError, this.calendarError].filter(Boolean)
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      lastError: errors.length ? errors.join('；') : null
    }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}
