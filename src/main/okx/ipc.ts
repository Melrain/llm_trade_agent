import { ipcMain } from 'electron'

import type { OkxPlaceOrderInput } from '../../preload/okx-types'
import { getPublicConfig } from '../agent/config'
import type { OkxClient } from './client'

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

export function registerOkxIpc(okx: OkxClient): void {
  for (const channel of ['okx:test', 'okx:placeOrder', 'okx:closePosition'] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('okx:test', () => okx.testConnection())
  ipcMain.handle('okx:placeOrder', (_event, raw: unknown) => okx.placeOrder(asPlaceInput(raw)))
  ipcMain.handle('okx:closePosition', (_event, instId?: string) => {
    const cfg = getPublicConfig()
    return okx.closePosition(
      typeof instId === 'string' && instId ? instId : cfg.okx.instId,
      cfg.okx.tdMode
    )
  })
}
