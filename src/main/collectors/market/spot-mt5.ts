import type { TradeAsset } from '../../../preload/okx-types'
import type { Mt5TerminalInfo, Mt5Tick } from '../../../preload/mt5-types'
import type { Mt5Client } from '../../mt5/client'

const ASSET_CANDIDATES: Record<TradeAsset, string[]> = {
  BTC: ['BTCUSD', 'BTCUSDm', 'BTCUSDc', 'BTCUSDT', 'BTCUSD.s', 'XBTUSD', 'BTC'],
  ETH: ['ETHUSD', 'ETHUSDm', 'ETHUSDc', 'ETHUSDT', 'ETHUSD.s', 'ETH'],
  XAU: ['XAUUSD', 'XAUUSDm', 'XAUUSDc', 'XAUUSD.s', 'GOLD']
}

const ASSET_GROUPS: Record<TradeAsset, string[]> = {
  BTC: ['*BTCUSD*', '*BTCUSDT*', '*XBTUSD*', '*BTC*'],
  ETH: ['*ETHUSD*', '*ETHUSDT*', '*ETH*'],
  XAU: ['*XAUUSD*', '*XAU*', '*GOLD*']
}

export type Mt5SpotTick = {
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

function scoreAssetName(name: string, asset: TradeAsset): number {
  const u = name.toUpperCase()
  const exact = ASSET_CANDIDATES[asset]
  if (exact.includes(u)) return u.endsWith('USD') || u.endsWith('USDT') ? 100 : 80
  if (asset === 'BTC') {
    if (u === 'BTCUSD' || u === 'BTCUSDT') return 100
    if (u.startsWith('BTCUSD')) return 90
    if (u.includes('BTC') && u.includes('USD')) return 70
    if (u.includes('BTC')) return 20
    return 0
  }
  if (asset === 'ETH') {
    if (u === 'ETHUSD' || u === 'ETHUSDT') return 100
    if (u.startsWith('ETHUSD')) return 90
    if (u.includes('ETH') && u.includes('USD')) return 70
    if (u.includes('ETH')) return 20
    return 0
  }
  if (u === 'XAUUSD') return 100
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
): Promise<Mt5SpotTick | null> {
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

async function listAssetSymbols(mt5: Mt5Client, asset: TradeAsset): Promise<string[]> {
  const names = new Set<string>()
  for (const group of ASSET_GROUPS[asset]) {
    try {
      const rows = (await mt5.request('symbols_get', { group })) as Array<{ name?: string }>
      for (const row of rows ?? []) {
        const name = row.name?.trim()
        if (name && scoreAssetName(name, asset) > 0) names.add(name)
      }
    } catch {
      // 终端未就绪时 symbols_get 会失败，下一轮再试
    }
  }
  return [...names].sort((a, b) => scoreAssetName(b, asset) - scoreAssetName(a, asset))
}

export async function fetchSpotFromMt5(
  mt5: Mt5Client,
  asset: TradeAsset,
  cachedSymbol?: string | null
): Promise<Mt5SpotTick> {
  if (!(await terminalConnected(mt5))) {
    throw new Error('MT5 终端未就绪')
  }

  if (cachedSymbol && scoreAssetName(cachedSymbol, asset) > 0) {
    const cached = await readTick(mt5, cachedSymbol, false)
    if (cached) return cached
    const selected = await readTick(mt5, cachedSymbol, true)
    if (selected) return selected
  }

  const listed = await listAssetSymbols(mt5, asset)
  const candidates = listed.length > 0 ? listed : ASSET_CANDIDATES[asset]
  for (const symbol of candidates) {
    const hit = await readTick(mt5, symbol, true)
    if (hit) return hit
  }

  throw new Error(`MT5 未找到 ${asset} 报价`)
}
