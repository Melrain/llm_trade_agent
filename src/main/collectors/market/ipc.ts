import { BrowserWindow, ipcMain } from 'electron'

import type { MarketSnapshot } from '../../../preload/market-types'
import type { MarketCollector } from './collector'

function broadcast(snapshot: MarketSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('market:updated', snapshot)
  }
}

export function registerMarketIpc(collector: MarketCollector): void {
  collector.onUpdated(broadcast)
  for (const channel of ['market:getSnapshot', 'market:refresh'] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('market:getSnapshot', () => collector.getSnapshot())
  ipcMain.handle('market:refresh', () => collector.refresh())
}
