import { BrowserWindow, ipcMain } from 'electron'

import type { AgentConfigPatch, AgentRecord } from '../../preload/agent-types'
import { accountModeFromTradeMode } from '../../preload/mt5-types'
import type { SnapshotService } from '../snapshot/service'
import { getPublicConfig, setConfig } from './config'
import type { AgentEngine } from './engine'
import { computeStats } from './stats'
import { loadAllRecords } from './store'

function broadcast(records: AgentRecord[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:updated', records)
  }
}

function broadcastConfig(config: ReturnType<typeof getPublicConfig>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:config', config)
  }
}

function asPatch(raw: unknown): AgentConfigPatch {
  if (!raw || typeof raw !== 'object') return {}
  const row = raw as Record<string, unknown>
  const patch: AgentConfigPatch = {}
  if (typeof row.baseUrl === 'string') patch.baseUrl = row.baseUrl
  if (typeof row.model === 'string') patch.model = row.model
  if (typeof row.temperature === 'number') patch.temperature = row.temperature
  if (typeof row.intervalMs === 'number') patch.intervalMs = row.intervalMs
  if (typeof row.enabled === 'boolean') patch.enabled = row.enabled
  if (typeof row.tradingEnabled === 'boolean') patch.tradingEnabled = row.tradingEnabled
  if (typeof row.apiKey === 'string') patch.apiKey = row.apiKey
  if (typeof row.maxVolume === 'number') patch.maxVolume = row.maxVolume
  if (typeof row.riskPct === 'number') patch.riskPct = row.riskPct
  if (row.fixedVolume === null) patch.fixedVolume = null
  else if (typeof row.fixedVolume === 'number') patch.fixedVolume = row.fixedVolume
  return patch
}

export function registerAgentIpc(engine: AgentEngine, snapshots: SnapshotService): void {
  const accountMode = (): ReturnType<typeof accountModeFromTradeMode> =>
    accountModeFromTradeMode(snapshots.getSnapshot().account?.tradeMode)
  const login = (): number | null => snapshots.getSnapshot().account?.login ?? null

  engine.onUpdated(broadcast)
  engine.onConfig(() => broadcastConfig(getPublicConfig(accountMode())))
  for (const channel of [
    'agent:list',
    'agent:run',
    'agent:getConfig',
    'agent:setConfig',
    'agent:stats'
  ] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('agent:list', () => engine.list())
  ipcMain.handle('agent:run', () => engine.runOnce())
  ipcMain.handle('agent:getConfig', () => getPublicConfig(accountMode()))
  ipcMain.handle('agent:stats', () => computeStats(loadAllRecords()))
  ipcMain.handle('agent:setConfig', (_event, raw: unknown) => {
    const next = setConfig(asPatch(raw), accountMode(), login())
    engine.syncTimer()
    // 手数/风险等约束进快照，但不必为改配置重拉一遍行情
    void snapshots.rebuildFromCache()
    return next
  })
}
