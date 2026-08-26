import { ipcMain } from 'electron'

import type { OkxCandleBar, OkxPlaceOrderInput, OkxPosSide } from '../../preload/okx-types'
import { getPublicConfig } from '../agent/config'
import type { OkxClient } from './client'

const CANDLE_BARS: OkxCandleBar[] = ['15m', '1H', '4H', '1Dutc']

function asPlaceInput(raw: unknown): OkxPlaceOrderInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('下单参数无效')
  }
  const row = raw as Record<string, unknown>
  if (typeof row.instId !== 'string' || (row.side !== 'buy' && row.side !== 'sell')) {
    throw new Error('instId / side 无效')
  }
  if (typeof row.sz !== 'string' && typeof row.sz !== 'number') {
    throw new Error('sz 无效')
  }
  return {
    instId: row.instId,
    side: row.side,
    sz: String(row.sz),
    ordType: row.ordType === 'limit' ? 'limit' : 'market',
    px: typeof row.px === 'string' ? row.px : undefined,
    tdMode: row.tdMode === 'isolated' ? 'isolated' : 'cross',
    posSide: row.posSide === 'short' ? 'short' : row.posSide === 'long' ? 'long' : undefined,
    sl: typeof row.sl === 'number' ? row.sl : undefined,
    tp: typeof row.tp === 'number' ? row.tp : undefined,
    lever:
      typeof row.lever === 'string' || typeof row.lever === 'number' ? String(row.lever) : undefined
  }
}

function asPosSide(value: unknown): OkxPosSide | undefined {
  return value === 'long' || value === 'short' ? value : undefined
}

export function registerOkxIpc(okx: OkxClient): void {
  for (const channel of [
    'okx:test',
    'okx:placeOrder',
    'okx:closePosition',
    'okx:candles',
    'okx:amendSlTp'
  ] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('okx:test', () => okx.testConnection())
  ipcMain.handle('okx:placeOrder', (_event, raw: unknown) => okx.placeOrder(asPlaceInput(raw)))
  ipcMain.handle('okx:closePosition', (_event, instId?: unknown, posSide?: unknown) => {
    const cfg = getPublicConfig()
    return okx.closePosition(
      typeof instId === 'string' && instId ? instId : cfg.okx.instId,
      cfg.okx.tdMode,
      asPosSide(posSide)
    )
  })
  ipcMain.handle(
    'okx:candles',
    (_event, instId: unknown, bar: unknown, limit?: unknown, after?: unknown) => {
      const cfg = getPublicConfig()
      const id = typeof instId === 'string' && instId ? instId : cfg.okx.instId
      if (!CANDLE_BARS.includes(bar as OkxCandleBar)) {
        throw new Error('K 线周期无效')
      }
      return okx.getCandles(
        id,
        bar as OkxCandleBar,
        typeof limit === 'number' ? limit : 300,
        typeof after === 'number' ? after : undefined
      )
    }
  )
  ipcMain.handle('okx:amendSlTp', (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('改止盈止损参数无效')
    const row = raw as Record<string, unknown>
    const cfg = getPublicConfig()
    if (row.side !== 'buy' && row.side !== 'sell') throw new Error('side 无效')
    if (typeof row.sz !== 'string' && typeof row.sz !== 'number') throw new Error('sz 无效')
    return okx.replaceAlgoSlTp({
      instId: typeof row.instId === 'string' && row.instId ? row.instId : cfg.okx.instId,
      tdMode: cfg.okx.tdMode,
      side: row.side,
      sz: String(row.sz),
      sl: typeof row.sl === 'number' ? row.sl : undefined,
      tp: typeof row.tp === 'number' ? row.tp : undefined,
      posSide: asPosSide(row.posSide)
    })
  })
}
