import type { NewsHeadline } from '../../../preload/news-types'
import { fetchText } from '../../http'

export type RssFeed = {
  source: string
  sourceZh: string
  url: string
}

const TAG_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: 'fed', re: /\b(fed|fomc|powell|federal reserve)\b/i },
  { tag: 'cpi', re: /\b(cpi|pce|ppi)\b/i },
  { tag: 'nfp', re: /\b(nfp|non[-\s]?farm|payrolls?|unemployment claims)\b/i },
  { tag: 'gold', re: /\b(gold|xau|bullion|xauusd)\b/i },
  { tag: 'geo', re: /\b(iran|israel|hormuz|ukraine|taiwan|ceasefire|geopolit|strait)\b/i },
  { tag: 'usd', re: /\b(dxy|us dollar|u\.s\. dollar|treasury|10-?year yield)\b/i },
  { tag: 'crypto', re: /\b(bitcoin|btc|ethereum|eth|crypto|okx|binance|solana|sol|perpetual)\b/i }
]

const KEEP_TAGS = new Set(['gold', 'geo', 'fed', 'nfp'])
const CRYPTO_KEEP_TAGS = new Set(['crypto', 'btc', 'eth', 'fed', 'geo', 'cpi', 'nfp', 'usd'])

function codePoint(value: number): string {
  try {
    return String.fromCodePoint(value)
  } catch {
    return ''
  }
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => codePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => codePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

function stripHtml(text: string): string {
  return decodeXml(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tagValue(xml: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
  const match = xml.match(re)
  return match ? stripHtml(match[1]) : ''
}

function hrefOf(xml: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*href=["']([^"']+)["'][^>]*/?>`, 'i')
  return xml.match(re)?.[1] ?? ''
}

function parseItems(xml: string): Array<{
  title: string
  url: string
  guid: string
  summary: string
  publishedAt: string | null
}> {
  const rssChunks = xml.split(/<item[\s>]/i).slice(1)
  const atomChunks = rssChunks.length ? [] : xml.split(/<entry[\s>]/i).slice(1)
  const chunks = rssChunks.length ? rssChunks : atomChunks
  const close = rssChunks.length ? /<\/item>/i : /<\/entry>/i
  return chunks.map((chunk) => {
    const body = chunk.split(close)[0] ?? chunk
    const title = tagValue(body, 'title')
    const url = tagValue(body, 'link') || hrefOf(body, 'link') || tagValue(body, 'guid')
    const guid = tagValue(body, 'guid') || tagValue(body, 'id') || url || title
    const summary = tagValue(body, 'description') || tagValue(body, 'summary')
    const rawDate =
      tagValue(body, 'pubDate') || tagValue(body, 'published') || tagValue(body, 'updated')
    const ms = rawDate ? Date.parse(rawDate) : NaN
    return {
      title,
      url,
      guid,
      summary,
      publishedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null
    }
  })
}

export function tagHeadline(title: string, summary: string): string[] {
  const text = `${title} ${summary}`
  return TAG_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.tag)
}

export function isGoldRelevant(item: Pick<NewsHeadline, 'tags'>): boolean {
  return item.tags.some((tag) => KEEP_TAGS.has(tag))
}

export function isCryptoRelevant(item: Pick<NewsHeadline, 'tags'>): boolean {
  return item.tags.some((tag) => CRYPTO_KEEP_TAGS.has(tag))
}

export function selectHeadlines(items: NewsHeadline[], now = Date.now(), max = 8): NewsHeadline[] {
  const tagged = items.filter((item) => item.title && isCryptoRelevant(item))
  const within = (hours: number): NewsHeadline[] =>
    tagged.filter((item) => now - Date.parse(item.publishedAt) <= hours * 60 * 60 * 1000)

  const recent = within(12)
  const pool = recent.length >= 3 ? recent : within(48)
  const seen = new Set<string>()
  const out: NewsHeadline[] = []
  for (const item of pool.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    if (seen.has(item.id) || seen.has(item.url)) continue
    seen.add(item.id)
    if (item.url) seen.add(item.url)
    out.push(item)
    if (out.length >= max) break
  }
  return out
}

export async function fetchFeed(feed: RssFeed): Promise<NewsHeadline[]> {
  const xml = await fetchText(feed.url, { timeoutMs: 20_000 })
  return parseItems(xml)
    .filter((item) => item.title && (item.url || item.guid))
    .map((item) => ({
      id: `${feed.source}:${item.guid || item.url || item.title}`,
      source: feed.source,
      sourceZh: feed.sourceZh,
      title: item.title,
      summary: item.summary.slice(0, 240),
      url: item.url,
      publishedAt: item.publishedAt ?? new Date().toISOString(),
      tags: tagHeadline(item.title, item.summary)
    }))
}
