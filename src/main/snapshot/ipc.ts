import { BrowserWindow, ipcMain } from 'electron'

import { readSnapshotById } from '../agent/snapshot-store'
import type { DecisionSnapshot } from '../../preload/snapshot-types'
import type { SnapshotService } from './service'

function broadcast(snapshot: DecisionSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('snapshot:updated', snapshot)
  }
}

export function registerSnapshotIpc(service: SnapshotService): void {
  service.onUpdated(broadcast)
  for (const channel of ['snapshot:getSnapshot', 'snapshot:refresh', 'snapshot:getById'] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('snapshot:getSnapshot', () => service.getSnapshot())
  ipcMain.handle('snapshot:refresh', () => service.refresh())
  ipcMain.handle('snapshot:getById', (_event, snapshotId: unknown) => {
    if (typeof snapshotId !== 'string' || !snapshotId.trim()) return null
    const live = service.getSnapshot()
    if (live.meta.snapshotId === snapshotId) return live
    return readSnapshotById(snapshotId.trim())
  })
}
