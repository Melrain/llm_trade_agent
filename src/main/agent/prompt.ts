import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

import type { AgentRecord } from '../../preload/agent-types'
import type { TradeVenue } from '../../preload/okx-types'
import type { DecisionSnapshot, SnapshotBar, SnapshotTimeframe } from '../../preload/snapshot-types'

const TREND: Record<string, string> = {
  up: '多头',
  down: '空头',
  range: '震荡'
}

const LEVEL: Record<string, string> = {
  h4: '近4小时',
  prevDay: '昨高昨低',
  d5: '5日',
  d20: '20日'
}

function bars(rows: SnapshotBar[]): string {
  // 保留 月-日 时:分，否则日线K线全显示同一时刻，模型无法区分日期
  return rows
    .map((b) => `${b.t.slice(5, 16).replace('T', ' ')} o${b.o} h${b.h} l${b.l} c${b.c}`)
    .join('\n')
}

function tf(name: string, pack: SnapshotTimeframe | null): string {
  if (!pack) return `### ${name}\n不可用`
  const trend = pack.trend ? (TREND[pack.trend] ?? pack.trend) : '—'
  const pct = pack.pctChange24h == null ? '—' : `${(pack.pctChange24h * 100).toFixed(2)}%`
  return [
    `### ${name}`,
    `趋势 ${trend} · EMA20/50/200 ${pack.ema20} / ${pack.ema50} / ${pack.ema200}`,
    `RSI14 ${pack.rsi14} · ATR14 ${pack.atr14} · 24h ${pct}`,
    '```',
    bars(pack.recentBars),
    '```'
  ].join('\n')
}

export const PROMPT_VERSION = 'trader-v1.3'
export const OKX_PROMPT_VERSION = 'trader-okx-v1.0'

export function promptVersion(venue: TradeVenue = 'mt5'): string {
  return venue === 'okx' ? OKX_PROMPT_VERSION : PROMPT_VERSION
}

const ACTION_ZH: Record<string, string> = {
  open_buy: '开多',
  open_sell: '开空',
  close_position: '平仓',
  adjust_sltp: '改止损止盈',
  hold: '观望'
}

/** 最近几轮决策渲染成 Markdown，喂回模型以保持立场连贯 */
export function renderRecentDecisions(records: AgentRecord[], max = 5): string {
  const rows = records.filter((r) => !r.skipped && !r.parseError).slice(-max)
  if (rows.length === 0) return ''
  const lines = rows.map((r) => {
    const d = r.decision
    const time = r.createdAt.slice(11, 16)
    const extra =
      d.action === 'open_buy' || d.action === 'open_sell'
        ? ` · ${d.volume ?? '—'} · SL ${d.sl ?? '—'}`
        : ''
    let outcome: string
    if (r.riskVerdict !== 'pass') {
      outcome = `风控拒绝：${r.riskReason ?? ''}`
    } else if (d.action === 'hold') {
      outcome = '风控通过'
    } else if (r.execution?.status === 'sent') {
      outcome = '风控通过 · 已实际下单'
    } else {
      outcome = '风控通过 · 未下单（仅记录，账户没有这笔仓位）'
    }
    return `- ${time} ${ACTION_ZH[d.action] ?? d.action} 置信 ${d.confidence}${extra}（${outcome}）`
  })
  return [
    '## 你最近的决策（时间为 UTC，最早在上）',
    '注意：标注「未下单」的建议没有产生真实仓位，账户持仓以上方「账户」一节为准。',
    ...lines
  ].join('\n')
}

function promptPath(venue: TradeVenue = 'mt5'): string {
  const file = venue === 'okx' ? 'trader-okx-v1.md' : 'trader-v1.md'
  if (app.isPackaged) {
    const extra = join(process.resourcesPath, 'prompts', file)
    if (existsSync(extra)) return extra
  }
  const fromApp = join(app.getAppPath(), 'resources', 'prompts', file)
  if (existsSync(fromApp)) return fromApp
  return join(__dirname, '../../resources/prompts', file)
}

export function loadSystemPrompt(venue: TradeVenue = 'mt5'): string {
  const path = promptPath(venue)
  if (!existsSync(path)) {
    throw new Error(`缺少 prompt 文件: ${path}`)
  }
  return readFileSync(path, 'utf8')
}

export function renderSnapshotMarkdown(snapshot: DecisionSnapshot): string {
  const { account, technical, constraints } = snapshot
  const lines: string[] = [
    snapshot.meta.venue === 'okx'
      ? `# OKX 永续快照 ${snapshot.meta.symbol}`
      : `# 黄金快照 ${snapshot.meta.symbol}`,
    `生成 ${snapshot.meta.generatedAt}`,
    snapshot.meta.venue === 'okx'
      ? `K 线时间为 UTC（${snapshot.meta.barTime}）。日历为 UTC。`
      : `K 线时间为经纪商服务器时间（${snapshot.meta.barTime}），不是 UTC。日历为 UTC。`,
    `数据源 技术面=${snapshot.sources.market} 预测市场=${snapshot.sources.polymarket} 新闻=${snapshot.sources.news} 日历=${snapshot.sources.calendar}`,
    '',
    '## 账户',
    account
      ? `余额 ${account.balance} · 净值 ${account.equity} · 可用保证金 ${account.marginFree} · 浮动 ${account.profit} · 当日盈亏 ${account.dailyPnl}（已实现 ${account.dailyPnlRealized}） ${account.currency}`
      : '账户不可用',
    account?.positions.length
      ? account.positions
          .map(
            (p) =>
              `- ${p.type} ${p.volume} @ ${p.priceOpen} 盈亏 ${p.profit} SL ${p.sl} TP ${p.tp} ticket ${p.ticket}`
          )
          .join('\n')
      : '无持仓',
    '',
    '## 约束',
    `maxVolume ${constraints.maxVolume} · volumeMin ${constraints.volumeMin} · volumeStep ${constraints.volumeStep} · 合约 ${constraints.contractSize}`,
    `单笔风险 ${((constraints.riskPct ?? 0.01) * 100).toFixed(1)}%${constraints.fixedVolume != null ? ` · 固定数量 ${constraints.fixedVolume}` : ' · 数量按风险自动算'}`,
    snapshot.meta.venue === 'okx'
      ? '开仓张数由风控覆盖，你给的 volume 只作参考（单位：合约张）。'
      : '开仓手数由风控覆盖，你给的 volume 只作参考。',
    `过夜费 多 ${constraints.swapLong} / 空 ${constraints.swapShort}`,
    `可开方向 ${constraints.allowedDirections.join(',') || '无'}（多空均可，不要默认只做多） · 暂停开仓 ${constraints.tradingHalted ? constraints.haltReason : '否'}`,
    ''
  ]

  if (technical) {
    lines.push(
      '## 技术面',
      `买 ${technical.price.bid} / 卖 ${technical.price.ask} 点差 ${technical.price.spread}`,
      tf('15分钟', technical.timeframes.M15),
      tf('1小时', technical.timeframes.H1),
      tf('4小时', technical.timeframes.H4),
      tf('日线', technical.timeframes.D1),
      '',
      '### 档位（pos 0=低点 1=高点）',
      ...technical.levels.map(
        (lv) => `- ${LEVEL[lv.id] ?? lv.id} 高 ${lv.high} 低 ${lv.low} 位置 ${lv.pos}`
      ),
      ''
    )
  } else {
    lines.push('## 技术面', '不可用', '')
  }

  lines.push('## 预测市场')
  if (snapshot.polymarket.length === 0) {
    lines.push('无')
  } else {
    for (const m of snapshot.polymarket) {
      lines.push(`### ${m.title}（${m.role}${m.stale ? ' · 失效' : ''}）`)
      for (const leg of m.legs) {
        const ch = leg.probChange24h == null ? '' : ` 24h ${leg.probChange24h}`
        lines.push(`- ${leg.label}: ${(leg.impliedProb * 100).toFixed(1)}%${ch}`)
      }
    }
  }

  lines.push('', '## 新闻')
  if (snapshot.news.length === 0) {
    lines.push('无')
  } else {
    for (const n of snapshot.news) {
      lines.push(`- [${n.source}] ${n.title} (${n.tags.join(',')})`)
      if (n.summary) lines.push(`  ${n.summary}`)
    }
  }

  lines.push('', '## 财经日历（时间为 UTC）')
  if (snapshot.calendar.length === 0) {
    lines.push('无')
  } else {
    for (const e of snapshot.calendar) {
      lines.push(
        `- ${e.when} ${e.titleZh} ${e.impact} 预测 ${e.forecast ?? '—'} 前值 ${e.previous ?? '—'} 公布 ${e.actual ?? '—'}`
      )
    }
  }

  return lines.join('\n')
}
