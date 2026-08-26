import { BrowserWindow, ipcMain } from 'electron'

import type { AgentConfigPatch, AgentRecord } from '../../preload/agent-types'
import type { TradeVenue } from '../../preload/okx-types'
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
  if (row.venue === 'mt5' || row.venue === 'okx') patch.venue = row.venue as TradeVenue
  if (typeof row.okxInstId === 'string') patch.okxInstId = row.okxInstId
  if (typeof row.okxDemo === 'boolean') patch.okxDemo = row.okxDemo
  if (typeof row.okxLeverage === 'number') patch.okxLeverage = row.okxLeverage
  if (row.okxTdMode === 'cross' || row.okxTdMode === 'isolated') patch.okxTdMode = row.okxTdMode
  if (typeof row.okxApiKey === 'string') patch.okxApiKey = row.okxApiKey
  if (typeof row.okxSecret === 'string') patch.okxSecret = row.okxSecret
  if (typeof row.okxPassphrase === 'string') patch.okxPassphrase = row.okxPassphrase
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
    const prev = getPublicConfig(accountMode())
    const patch = asPatch(raw)
    const next = setConfig(patch, accountMode(), login())
    engine.syncTimer()
    const relink =
      prev.venue !== next.venue ||
      prev.okx.instId !== next.okx.instId ||
      prev.okx.demo !== next.okx.demo ||
      Boolean(patch.okxApiKey || patch.okxSecret || patch.okxPassphrase)
    if (relink) void snapshots.refresh()
    else void snapshots.rebuildFromCache()
    return next
  })
}
