import { BrowserWindow, ipcMain, shell } from 'electron'

import type { NewsSnapshot } from '../../../preload/news-types'
import type { NewsCollector } from './collector'

function assertHttpUrl(url: unknown): string {
  if (typeof url !== 'string') throw new Error('invalid url')
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('invalid url')
  }
  return parsed.toString()
}

function broadcast(snapshot: NewsSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('news:updated', snapshot)
  }
}

export function registerNewsIpc(collector: NewsCollector): void {
  collector.onUpdated(broadcast)
  for (const channel of [
    'news:getSnapshot',
    'news:refresh',
    'news:openUrl',
    'news:listFeeds'
  ] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('news:getSnapshot', () => collector.getSnapshot())
  ipcMain.handle('news:refresh', () => collector.refresh())
  ipcMain.handle('news:listFeeds', () => collector.listFeeds())
  ipcMain.handle('news:openUrl', async (_event, url: unknown) => {
    await shell.openExternal(assertHttpUrl(url))
  })
}
