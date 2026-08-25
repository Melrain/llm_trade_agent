import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { MarketCollector, registerMarketIpc } from './collectors/market'
import { NewsCollector, registerNewsIpc } from './collectors/news'
import { PolymarketCollector, registerPmIpc } from './collectors/polymarket'
import { Mt5Client } from './mt5/client'
import { registerMt5Ipc } from './mt5/ipc'
import { SnapshotService, registerSnapshotIpc } from './snapshot'
import { AgentEngine, registerAgentIpc } from './agent'
import { getOkxCredentials } from './agent/config'
import { OkxClient, registerOkxIpc } from './okx'
import { closeDb, openDb } from './db'
import { checkForUpdatesOnReady, registerUpdaterIpc } from './updater'

const mt5 = new Mt5Client()
const okx = new OkxClient(() => getOkxCredentials())
const pm = new PolymarketCollector(mt5)
const market = new MarketCollector(mt5, okx)
const news = new NewsCollector()
const snapshot = new SnapshotService(market, pm, news, mt5, okx)
const agent = new AgentEngine(snapshot, mt5, okx)

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'LLMTradeAgent',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    checkForUpdatesOnReady()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('renderer failed to load', code, desc, url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      focusMainWindow()
    } else if (app.isReady()) {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.llmtradeagent.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('ping', () => console.log('pong'))

    try {
      openDb()
    } catch (error) {
      console.error('sqlite open failed', error)
    }

    if (process.platform === 'win32') {
      try {
        mt5.start()
      } catch (error) {
        console.error('MT5 bridge failed to start', error)
      }
    }
    registerMt5Ipc(mt5)
    registerOkxIpc(okx)
    registerPmIpc(pm)
    registerMarketIpc(market)
    registerNewsIpc(news)
    registerSnapshotIpc(snapshot)
    registerAgentIpc(agent, snapshot)
    registerUpdaterIpc(agent)
    pm.start()
    market.start()
    news.start()
    snapshot.start()
    agent.start()

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    agent.stop()
    snapshot.stop()
    pm.stop()
    market.stop()
    news.stop()
    mt5.stop()
    closeDb()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
