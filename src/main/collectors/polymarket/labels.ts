const MONTH_ZH: Record<string, string> = {
  january: '1月',
  february: '2月',
  march: '3月',
  april: '4月',
  may: '5月',
  june: '6月',
  july: '7月',
  august: '8月',
  september: '9月',
  october: '10月',
  november: '11月',
  december: '12月'
}

function monthZh(raw: string): string | undefined {
  return MONTH_ZH[raw.trim().toLowerCase()]
}

function formatUsdStrike(strike: number): string {
  return `$${strike.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

/** 黄金触及价档：向上触及 $4,700 / 向下触及 $4,000 */
export function localizePriceLabel(
  direction: 'up' | 'down' | 'flat' | undefined,
  strike: number | undefined,
  fallback: string
): string {
  if (strike == null) return fallback
  const price = formatUsdStrike(strike)
  if (direction === 'up') return `向上触及 ${price}`
  if (direction === 'down') return `向下触及 ${price}`
  return `触及 ${price}`
}

/**
 * 把 Gamma 英文标题映射成中文。匹配不到则原样返回。
 */
export function localizeEventTitle(title: string, slug: string): string {
  const fed = /fed decision in ([a-z]+)/i.exec(title) ?? /fed-decision-in-([a-z]+)/i.exec(slug)
  if (fed) {
    const month = monthZh(fed[1])
    return month ? `${month}美联储决议` : '美联储决议'
  }

  const goldMonth =
    /gold[^(]*\(xauusd\) hit in ([a-z]+) (\d{4})/i.exec(title) ??
    /xauusd-hit-in-([a-z]+)-(\d{4})/i.exec(slug)
  if (goldMonth) {
    const month = monthZh(goldMonth[1])
    const year = goldMonth[2]
    return month ? `黄金将在${year}年${month}触及什么价位？` : '黄金触及价'
  }

  const goldWeek =
    /gold[^(]*\(xauusd\) hit week of ([a-z]+) (\d{1,2})(?: (\d{4}))?/i.exec(title) ??
    /xauusd-hit-week-of-([a-z]+)-(\d{1,2})(?:-(\d{4}))?/i.exec(slug)
  if (goldWeek) {
    const month = monthZh(goldWeek[1])
    const day = goldWeek[2]
    const year = goldWeek[3] ? `${goldWeek[3]}年` : ''
    return month ? `黄金将在${year}${month}${day}日当周触及什么价位？` : '黄金当周触及价'
  }

  return title
}

const MONTH_DAY_RE = /([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/

export function localizeMonthDay(raw: string): string | undefined {
  const m = MONTH_DAY_RE.exec(raw)
  if (!m) return undefined
  const month = monthZh(m[1])
  if (!month) return undefined
  const day = String(Number(m[2]))
  const year = m[3] ? `${m[3]}年` : ''
  return `${year}${month}${day}日`
}

/** 地缘盘短中文标签 */
export function localizeGeoLabel(title: string, slug: string, dateHint?: string): string {
  const blob = `${title} ${slug} ${dateHint ?? ''}`
  const date =
    (dateHint ? localizeMonthDay(dateHint) : undefined) ??
    localizeMonthDay(title) ??
    localizeMonthDay(slug.replace(/-/g, ' '))

  if (/us-ceasefire-against-iran|us-iran.*ceasefire/i.test(blob)) {
    return date ? `美伊停火持续至${date}` : '美伊停火持续'
  }
  if (/strait-of-hormuz-traffic-returns-to-normal|hormuz.*normal/i.test(blob)) {
    return date ? `霍尔木兹航运${date}前恢复` : '霍尔木兹航运恢复正常'
  }
  if (/us-invade-iran|invade iran/i.test(blob)) {
    return '美国2027年前入侵伊朗'
  }
  if (/china-invade-taiwan|invade taiwan/i.test(blob)) {
    return '中国2027年前进攻台湾'
  }
  if (/russia-x-ukraine-ceasefire|russia.*ukraine.*ceasefire/i.test(blob)) {
    return date ? `俄乌停火（${date}前）` : '俄乌停火'
  }
  return localizeEventTitle(title, slug)
}
