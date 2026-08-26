import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { MarketApi, MarketSnapshot } from './market-types'
import type { Mt5Api, Mt5Filter, Mt5Timeframe, Mt5TradeRequest } from './mt5-types'
import type { NewsApi, NewsSnapshot } from './news-types'
import type { PmApi, PmSnapshot } from './pm-types'
import type { AgentApi, AgentConfigPatch, AgentPublicConfig, AgentRecord } from './agent-types'
import type { SnapshotApi, DecisionSnapshot } from './snapshot-types'
import type { OkxApi, OkxCandleBar, OkxPlaceOrderInput, OkxPosSide } from './okx-types'

const api: {
  mt5: Mt5Api
  okx: OkxApi
  pm: PmApi
  market: MarketApi
  news: NewsApi
  snapshot: SnapshotApi
  agent: AgentApi
} = {
  okx: {
    test: () => ipcRenderer.invoke('okx:test'),
    placeOrder: (input: OkxPlaceOrderInput) => ipcRenderer.invoke('okx:placeOrder', input),
    closePosition: (instId?: string, posSide?: OkxPosSide) =>
      ipcRenderer.invoke('okx:closePosition', instId, posSide),
    candles: (instId: string, bar: OkxCandleBar, limit?: number, after?: number) =>
      ipcRenderer.invoke('okx:candles', instId, bar, limit, after),
    amendSlTp: (input) => ipcRenderer.invoke('okx:amendSlTp', input)
  },
  mt5: {
    version: () => ipcRenderer.invoke('mt5:version'),
    last_error: () => ipcRenderer.invoke('mt5:last_error'),
    account_info: () => ipcRenderer.invoke('mt5:account_info'),
    terminal_info: () => ipcRenderer.invoke('mt5:terminal_info'),
    symbols_total: () => ipcRenderer.invoke('mt5:symbols_total'),
    symbols_get: (group?: string) => ipcRenderer.invoke('mt5:symbols_get', group),
    symbol_info: (symbol: string) => ipcRenderer.invoke('mt5:symbol_info', symbol),
    symbol_info_tick: (symbol: string) => ipcRenderer.invoke('mt5:symbol_info_tick', symbol),
    symbol_select: (symbol: string, enable?: boolean) =>
      ipcRenderer.invoke('mt5:symbol_select', symbol, enable),
    copy_rates_from_pos: (
      symbol: string,
      timeframe: Mt5Timeframe,
      start?: number,
      count?: number
    ) => ipcRenderer.invoke('mt5:copy_rates_from_pos', symbol, timeframe, start, count),
    history_deals_get: (dateFrom: number, dateTo: number, group?: string) =>
      ipcRenderer.invoke('mt5:history_deals_get', dateFrom, dateTo, group),
    positions_total: () => ipcRenderer.invoke('mt5:positions_total'),
    positions_get: (filter?: Mt5Filter) => ipcRenderer.invoke('mt5:positions_get', filter),
    orders_total: () => ipcRenderer.invoke('mt5:orders_total'),
    orders_get: (filter?: Mt5Filter) => ipcRenderer.invoke('mt5:orders_get', filter),
    order_check: (request: Mt5TradeRequest) => ipcRenderer.invoke('mt5:order_check', request),
    order_send: (request: Mt5TradeRequest) => ipcRenderer.invoke('mt5:order_send', request)
  },
  pm: {
    getSnapshot: (symbol?: string) => ipcRenderer.invoke('pm:getSnapshot', symbol),
    refresh: (symbol?: string) => ipcRenderer.invoke('pm:refresh', symbol),
    openEvent: (slug: string) => ipcRenderer.invoke('pm:openEvent', slug),
    onUpdated: (callback: (snapshot: PmSnapshot) => void) => {
      const listener = (_event: unknown, snapshot: PmSnapshot): void => {
        callback(snapshot)
      }
      ipcRenderer.on('pm:updated', listener)
      return () => {
        ipcRenderer.removeListener('pm:updated', listener)
      }
    }
  },
  market: {
    getSnapshot: () => ipcRenderer.invoke('market:getSnapshot'),
    refresh: () => ipcRenderer.invoke('market:refresh'),
    onUpdated: (callback: (snapshot: MarketSnapshot) => void) => {
      const listener = (_event: unknown, snapshot: MarketSnapshot): void => {
        callback(snapshot)
      }
      ipcRenderer.on('market:updated', listener)
      return () => {
        ipcRenderer.removeListener('market:updated', listener)
      }
    }
  },
  news: {
    getSnapshot: () => ipcRenderer.invoke('news:getSnapshot'),
    refresh: () => ipcRenderer.invoke('news:refresh'),
    listFeeds: () => ipcRenderer.invoke('news:listFeeds'),
    openUrl: (url: string) => ipcRenderer.invoke('news:openUrl', url),
    onUpdated: (callback: (snapshot: NewsSnapshot) => void) => {
      const listener = (_event: unknown, snapshot: NewsSnapshot): void => {
        callback(snapshot)
      }
      ipcRenderer.on('news:updated', listener)
      return () => {
        ipcRenderer.removeListener('news:updated', listener)
      }
    }
  },
  snapshot: {
    getSnapshot: () => ipcRenderer.invoke('snapshot:getSnapshot'),
    refresh: () => ipcRenderer.invoke('snapshot:refresh'),
    getById: (snapshotId: string) => ipcRenderer.invoke('snapshot:getById', snapshotId),
    onUpdated: (callback: (snapshot: DecisionSnapshot) => void) => {
      const listener = (_event: unknown, snapshot: DecisionSnapshot): void => {
        callback(snapshot)
      }
      ipcRenderer.on('snapshot:updated', listener)
      return () => {
        ipcRenderer.removeListener('snapshot:updated', listener)
      }
    }
  },
  agent: {
    list: () => ipcRenderer.invoke('agent:list'),
    run: () => ipcRenderer.invoke('agent:run'),
    getConfig: () => ipcRenderer.invoke('agent:getConfig'),
    setConfig: (patch: AgentConfigPatch) => ipcRenderer.invoke('agent:setConfig', patch),
    stats: () => ipcRenderer.invoke('agent:stats'),
    onUpdated: (callback: (records: AgentRecord[]) => void) => {
      const listener = (_event: unknown, records: AgentRecord[]): void => {
        callback(records)
      }
      ipcRenderer.on('agent:updated', listener)
      return () => {
        ipcRenderer.removeListener('agent:updated', listener)
      }
    },
    onConfig: (callback: (config: AgentPublicConfig) => void) => {
      const listener = (_event: unknown, config: AgentPublicConfig): void => {
        callback(config)
      }
      ipcRenderer.on('agent:config', listener)
      return () => {
        ipcRenderer.removeListener('agent:config', listener)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
