import type { Mt5TerminalInfo, Mt5Tick } from '../../../preload/mt5-types'
import type { Mt5Client } from '../../mt5/client'

export const SPOT_STORE_ID = 'spot:XAUUSD'

const GOLD_CANDIDATES = ['XAUUSD', 'XAUUSDm', 'XAUUSDc', 'GOLD']

export type Mt5GoldTick = {
  symbol: string
  price: number
  timeMs: number
}

function asTick(raw: unknown): Mt5Tick | null {
  if (!raw || typeof raw !== 'object') return null
  const tick = raw as Mt5Tick
  if (!Number.isFinite(tick.bid) && !Number.isFinite(tick.ask) && !Number.isFinite(tick.last)) {
    return null
  }
  return tick
}

function midFromTick(tick: Mt5Tick): number | null {
  if (tick.last > 0) return tick.last
  if (tick.bid > 0 && tick.ask > 0) return (tick.bid + tick.ask) / 2
  if (tick.bid > 0) return tick.bid
  if (tick.ask > 0) return tick.ask
  return null
}

function tickTimeMs(tick: Mt5Tick): number {
  if (tick.time_msc > 0) return tick.time_msc
  if (tick.time > 0) return tick.time * 1000
  return Date.now()
}

function scoreGoldName(name: string): number {
  const u = name.toUpperCase()
  if (u === 'XAUUSD') return 100
  if (GOLD_CANDIDATES.includes(name)) return 90
  if (u.startsWith('XAUUSD')) return 80
  if (u === 'GOLD' || u.startsWith('GOLD')) return 50
  if (u.includes('XAU')) return 30
  return 0
}

async function terminalConnected(mt5: Mt5Client): Promise<boolean> {
  try {
    const info = (await mt5.request('terminal_info')) as Mt5TerminalInfo | null
    return Boolean(info?.connected)
  } catch {
    return false
  }
}

async function selectSymbol(mt5: Mt5Client, symbol: string): Promise<boolean> {
  try {
    return (await mt5.request('symbol_select', { symbol, enable: true })) === true
  } catch {
    return false
  }
}

async function readTick(
  mt5: Mt5Client,
  symbol: string,
  select: boolean
): Promise<Mt5GoldTick | null> {
  if (select && !(await selectSymbol(mt5, symbol))) return null
  try {
    const tick = asTick(await mt5.request('symbol_info_tick', { symbol }))
    if (!tick) return null
    const price = midFromTick(tick)
    if (price == null) return null
    return { symbol, price, timeMs: tickTimeMs(tick) }
  } catch {
    return null
  }
}

async function listGoldSymbols(mt5: Mt5Client): Promise<string[]> {
  const names = new Set<string>()
  for (const group of ['*XAUUSD*', '*XAU*', '*GOLD*']) {
    try {
      const rows = (await mt5.request('symbols_get', { group })) as Array<{ name?: string }>
      for (const row of rows ?? []) {
        const name = row.name?.trim()
        if (name && scoreGoldName(name) > 0) names.add(name)
      }
    } catch {
      // 终端未就绪时 symbols_get 会失败，下一轮再试
    }
  }
  return [...names].sort((a, b) => scoreGoldName(b) - scoreGoldName(a))
}

export async function fetchGoldSpotFromMt5(
  mt5: Mt5Client,
  cachedSymbol?: string | null
): Promise<Mt5GoldTick> {
  if (!(await terminalConnected(mt5))) {
    throw new Error('MT5 终端未就绪')
  }

  if (cachedSymbol) {
    const cached = await readTick(mt5, cachedSymbol, false)
    if (cached) return cached
    const selected = await readTick(mt5, cachedSymbol, true)
    if (selected) return selected
  }

  const listed = await listGoldSymbols(mt5)
  const candidates = listed.length > 0 ? listed : GOLD_CANDIDATES
  for (const symbol of candidates) {
    const hit = await readTick(mt5, symbol, true)
    if (hit) return hit
  }

  throw new Error('MT5 未找到黄金报价（XAUUSD）')
}
