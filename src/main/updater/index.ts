import { app, BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

import type { UpdaterStatus } from '../../preload/updater-types'
import type { AgentEngine } from '../agent'
import { setConfig } from '../agent/config'

const INSTALL_WAIT_MS = 15_000

let engine: AgentEngine | null = null
let status: UpdaterStatus = blankStatus()
let wired = false
let checking: Promise<UpdaterStatus> | null = null
let installing = false

function isDevBuild(): boolean {
  return is.dev || !app.isPackaged
}

function blankStatus(): UpdaterStatus {
  return {
    state: isDevBuild() ? 'dev' : 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    releaseNotes: null,
    percent: null,
    error: null
  }
}

function notesOf(info: UpdateInfo): string | null {
  const raw = info.releaseNotes
  if (typeof raw === 'string') {
    const text = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text ? text.slice(0, 400) : null
  }
  if (Array.isArray(raw)) {
    const text = raw
      .map((row) => (typeof row.note === 'string' ? row.note : ''))
      .join(' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text ? text.slice(0, 400) : null
  }
  return null
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', status)
  }
}

function setStatus(patch: Partial<UpdaterStatus>): void {
  status = { ...status, currentVersion: app.getVersion(), ...patch }
  broadcast()
}

function wireUpdater(): void {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', error: null })
  })
  autoUpdater.on('update-available', (info) => {
    if (status.state === 'ready' || status.state === 'downloading') return
    setStatus({
      state: 'available',
      availableVersion: info.version,
      releaseNotes: notesOf(info),
      percent: null,
      error: null
    })
  })
  autoUpdater.on('update-not-available', () => {
    if (status.state === 'ready' || status.state === 'downloading') return
    setStatus({
      state: 'not-available',
      availableVersion: null,
      releaseNotes: null,
      percent: null,
      error: null
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      error: null
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'ready',
      availableVersion: info.version,
      releaseNotes: notesOf(info),
      percent: 100,
      error: null
    })
  })
  autoUpdater.on('error', (error) => {
    if (status.state === 'ready') return
    setStatus({
      state: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  })
}

function disarmTrading(): void {
  if (!engine) return
  setConfig({ enabled: false, tradingEnabled: false })
  engine.notifyConfigChanged()
}

async function check(): Promise<UpdaterStatus> {
  if (isDevBuild()) {
    setStatus({ state: 'dev', error: null })
    return status
  }
  if (checking) return checking
  if (status.state === 'downloading' || status.state === 'ready') return status

  wireUpdater()
  checking = autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (status.state === 'checking') {
        const version = result?.updateInfo?.version
        if (version && version !== app.getVersion()) {
          setStatus({
            state: 'available',
            availableVersion: version,
            releaseNotes: result?.updateInfo ? notesOf(result.updateInfo) : null,
            percent: null,
            error: null
          })
        } else {
          setStatus({
            state: 'not-available',
            availableVersion: null,
            releaseNotes: null,
            percent: null,
            error: null
          })
        }
      }
      return status
    })
    .catch((error: unknown) => {
      setStatus({
        state: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      return status
    })
    .finally(() => {
      checking = null
    })
  return checking
}

async function downloadAndInstall(): Promise<UpdaterStatus> {
  if (isDevBuild()) {
    setStatus({ state: 'dev', error: null })
    return status
  }
  if (installing || status.state === 'downloading') return status

  wireUpdater()
  installing = true
  try {
    disarmTrading()
    if (engine) await engine.waitUntilIdle(INSTALL_WAIT_MS)

    if (status.state !== 'ready' && status.state !== 'available') {
      await check()
    }
    if (status.state === 'available') {
      setStatus({ state: 'downloading', percent: 0, error: null })
      await autoUpdater.downloadUpdate()
    }
    if (status.state !== 'ready') return status

    autoUpdater.quitAndInstall(true, true)
    return status
  } catch (error) {
    setStatus({
      state: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
    return status
  } finally {
    installing = false
  }
}

export function registerUpdaterIpc(next: AgentEngine): void {
  engine = next
  status = blankStatus()
  if (!isDevBuild()) wireUpdater()

  for (const channel of [
    'updater:getStatus',
    'updater:check',
    'updater:downloadAndInstall'
  ] as const) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('updater:getStatus', () => status)
  ipcMain.handle('updater:check', () => check())
  ipcMain.handle('updater:downloadAndInstall', () => downloadAndInstall())
}

export function checkForUpdatesOnReady(): void {
  if (isDevBuild()) return
  void check().catch((error) => {
    console.warn('[updater]', error instanceof Error ? error.message : error)
  })
}
