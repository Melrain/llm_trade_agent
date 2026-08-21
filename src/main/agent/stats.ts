import type { AgentRecord, AgentStats } from '../../preload/agent-types'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function computeStats(records: AgentRecord[]): AgentStats {
  let holdCount = 0
  let openCount = 0
  let sentCount = 0
  let closedCount = 0
  let wins = 0
  let losses = 0
  let winSum = 0
  let lossSum = 0
  let totalPnl = 0
  let hasPnl = false
  let totalTokens = 0

  for (const record of records) {
    if (record.skipped) continue
    const { action } = record.decision
    if (action === 'hold') holdCount += 1
    if (action === 'open_buy' || action === 'open_sell') {
      openCount += 1
      if (record.execution?.status === 'sent') sentCount += 1
    }
    totalTokens += record.tokens?.total ?? 0

    const outcome = record.outcome
    if (outcome?.status === 'closed' && outcome.pnl != null) {
      closedCount += 1
      hasPnl = true
      totalPnl += outcome.pnl
      if (outcome.pnl >= 0) {
        wins += 1
        winSum += outcome.pnl
      } else {
        losses += 1
        lossSum += Math.abs(outcome.pnl)
      }
    }
  }

  return {
    totalDecisions: records.filter((r) => !r.skipped).length,
    holdCount,
    openCount,
    sentCount,
    closedCount,
    wins,
    losses,
    winRate: closedCount > 0 ? round2(wins / closedCount) : null,
    totalPnl: hasPnl ? round2(totalPnl) : null,
    avgWin: wins > 0 ? round2(winSum / wins) : null,
    avgLoss: losses > 0 ? round2(lossSum / losses) : null,
    profitFactor: lossSum > 0 ? round2(winSum / lossSum) : null,
    totalTokens
  }
}
