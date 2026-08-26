import { net } from 'electron'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class NonRetryableHttpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableHttpError'
  }
}

export type FetchJsonOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  /** 已序列化的请求体；签名场景必须与 OK-ACCESS-SIGN 用同一份字符串 */
  bodyText?: string
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  userAgent?: string
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function formatHttpError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const parts: string[] = []
  let current: unknown = err
  for (let i = 0; i < 4 && current; i++) {
    if (current instanceof Error) {
      if (current.message) parts.push(current.message)
      current = (current as { cause?: unknown }).cause
    } else {
      parts.push(String(current))
      break
    }
  }
  return [...new Set(parts)].join(' · ') || 'unknown error'
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
}

async function fetchRaw(url: string, opts?: FetchJsonOptions): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 20_000
  const retries = opts?.retries ?? 2
  const method = opts?.method ?? 'GET'
  let lastErr: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await net.fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'User-Agent': opts?.userAgent ?? 'LLA-Market-Desktop/0.1',
          Accept: opts?.headers?.Accept ?? 'application/json',
          ...(opts?.body != null || opts?.bodyText != null
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...opts?.headers
        },
        body: opts?.bodyText ?? (opts?.body != null ? JSON.stringify(opts.body) : undefined)
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const msg = `HTTP ${res.status} ${hostOf(url)}\n${body.slice(0, 400)}`
        const retryable = res.status >= 500
        if (retryable && attempt < retries) {
          lastErr = new Error(msg)
          await sleep(500 * (attempt + 1))
          continue
        }
        throw new NonRetryableHttpError(msg)
      }

      return res
    } catch (err) {
      if (err instanceof NonRetryableHttpError) {
        throw err
      }
      lastErr = err
      if (attempt < retries) {
        await sleep(isAbortError(err) ? 300 : 500 * (attempt + 1))
        continue
      }
      if (isAbortError(err)) {
        throw new Error(`Timeout after ${timeoutMs}ms: ${hostOf(url)}`)
      }
      throw new Error(`${hostOf(url)}: ${formatHttpError(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(`${hostOf(url)}: ${formatHttpError(lastErr)}`)
}

export async function fetchJson<T>(url: string, opts?: FetchJsonOptions): Promise<T> {
  const res = await fetchRaw(url, opts)
  return (await res.json()) as T
}

export async function fetchText(url: string, opts?: FetchJsonOptions): Promise<string> {
  const res = await fetchRaw(url, {
    ...opts,
    headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', ...opts?.headers }
  })
  return await res.text()
}
