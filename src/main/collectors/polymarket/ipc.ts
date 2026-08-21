import { BrowserWindow, ipcMain, shell } from 'electron'

import type { PmSnapshot } from '../../../preload/pm-types'
import type { PolymarketCollector } from './collector'
import { openWatchConfig } from './config'

function assertSymbol(symbol: unknown): string {
  if (symbol == null || symbol === '') return 'XAUUSD'
  if (typeof symbol !== 'string' || !symbol.trim()) {
    throw new Error('symbol is required')
  }
  return symbol.trim().toUpperCase()
}

function assertSlug(slug: unknown): string {
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/i.test(slug)) {
    throw new Error('invalid slug')
  }
  return slug
}

function broadcast(snapshot: PmSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('pm:updated', snapshot)
  }
}

export function registerPmIpc(collector: PolymarketCollector): void {
  collector.onUpdated(broadcast)

  for (const channel of [
    'pm:getSnapshot',
    'pm:refresh',
    'pm:openEvent',
    'pm:openWatchConfig'
  ] as const) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('pm:getSnapshot', (_event, symbol?: string) =>
    collector.getSnapshot(assertSymbol(symbol))
  )
  ipcMain.handle('pm:refresh', (_event, symbol?: string) => collector.refresh(assertSymbol(symbol)))
  ipcMain.handle('pm:openEvent', async (_event, slug: unknown) => {
    const url = `https://polymarket.com/event/${assertSlug(slug)}`
    await shell.openExternal(url)
  })
  ipcMain.handle('pm:openWatchConfig', () => openWatchConfig())
}
