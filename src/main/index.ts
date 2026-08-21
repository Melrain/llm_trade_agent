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
import { closeDb, openDb } from './db'

const mt5 = new Mt5Client()
const pm = new PolymarketCollector(mt5)
const market = new MarketCollector(mt5)
const news = new NewsCollector()
const snapshot = new SnapshotService(market, pm, news, mt5)
const agent = new AgentEngine(snapshot, mt5)

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.llmtradeagent.desktop')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
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
  registerPmIpc(pm)
  registerMarketIpc(market)
  registerNewsIpc(news)
  registerSnapshotIpc(snapshot)
  registerAgentIpc(agent, snapshot)
  pm.start()
  market.start()
  news.start()
  snapshot.start()
  agent.start()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
