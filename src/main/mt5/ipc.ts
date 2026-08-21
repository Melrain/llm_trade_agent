import { ipcMain } from 'electron'
import type { Mt5Client } from './client'
import type { Mt5Filter, Mt5Timeframe, Mt5TradeRequest } from '../../preload/mt5-types'

const MAX_VOLUME = 10
const TIMEFRAMES = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'])

function assertSymbol(symbol: unknown): string {
  if (typeof symbol !== 'string' || !symbol.trim()) {
    throw new Error('symbol is required')
  }
  return symbol.trim()
}

function assertFilter(filter: unknown): Mt5Filter {
  if (filter == null) {
    return {}
  }
  if (typeof filter !== 'object') {
    throw new Error('invalid filter')
  }
  const { symbol, group, ticket } = filter as Mt5Filter
  const out: Mt5Filter = {}
  if (symbol != null) {
    out.symbol = assertSymbol(symbol)
  }
  if (group != null) {
    if (typeof group !== 'string' || !group.trim()) {
      throw new Error('invalid group')
    }
    out.group = group
  }
  if (ticket != null) {
    if (!Number.isInteger(ticket) || ticket <= 0) {
      throw new Error('invalid ticket')
    }
    out.ticket = ticket
  }
  return out
}

function assertTradeRequest(request: unknown): Mt5TradeRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('invalid trade request')
  }
  const req = { ...(request as Mt5TradeRequest) }
  if (!Number.isInteger(req.action)) {
    throw new Error('action is required')
  }
  if (req.symbol != null) {
    req.symbol = assertSymbol(req.symbol)
  }
  if (req.volume != null) {
    if (!Number.isFinite(req.volume) || req.volume <= 0 || req.volume > MAX_VOLUME) {
      throw new Error('invalid volume')
    }
  }
  if (req.comment != null && typeof req.comment !== 'string') {
    throw new Error('invalid comment')
  }
  return req
}

export function registerMt5Ipc(client: Mt5Client): void {
  ipcMain.handle('mt5:version', () => client.request('version'))
  ipcMain.handle('mt5:last_error', () => client.request('last_error'))
  ipcMain.handle('mt5:account_info', () => client.request('account_info'))
  ipcMain.handle('mt5:terminal_info', () => client.request('terminal_info'))
  ipcMain.handle('mt5:symbols_total', () => client.request('symbols_total'))
  ipcMain.handle('mt5:symbols_get', (_event, group?: string) =>
    client.request('symbols_get', group ? { group } : {})
  )
  ipcMain.handle('mt5:symbol_info', (_event, symbol: string) =>
    client.request('symbol_info', { symbol: assertSymbol(symbol) })
  )
  ipcMain.handle('mt5:symbol_info_tick', (_event, symbol: string) =>
    client.request('symbol_info_tick', { symbol: assertSymbol(symbol) })
  )
  ipcMain.handle('mt5:symbol_select', (_event, symbol: string, enable = true) =>
    client.request('symbol_select', { symbol: assertSymbol(symbol), enable: enable !== false })
  )
  ipcMain.handle(
    'mt5:copy_rates_from_pos',
    (_event, symbol: string, timeframe: Mt5Timeframe, start = 0, count = 220) => {
      const tf = String(timeframe || '').toUpperCase()
      if (!TIMEFRAMES.has(tf)) {
        throw new Error('invalid timeframe')
      }
      const from = Number.isInteger(start) && start >= 0 ? start : 0
      const n = Number.isInteger(count) && count > 0 && count <= 5000 ? count : 220
      return client.request('copy_rates_from_pos', {
        symbol: assertSymbol(symbol),
        timeframe: tf,
        start: from,
        count: n
      })
    }
  )
  ipcMain.handle(
    'mt5:history_deals_get',
    (_event, dateFrom: unknown, dateTo: unknown, group?: unknown) => {
      const fromTs = Number(dateFrom)
      const toTs = Number(dateTo)
      if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
        throw new Error('date range is required')
      }
      const payload: { date_from: number; date_to: number; group?: string } = {
        date_from: fromTs,
        date_to: toTs
      }
      if (typeof group === 'string' && group.trim()) {
        payload.group = group.trim()
      }
      return client.request('history_deals_get', payload)
    }
  )
  ipcMain.handle('mt5:positions_total', () => client.request('positions_total'))
  ipcMain.handle('mt5:positions_get', (_event, filter?: Mt5Filter) =>
    client.request('positions_get', assertFilter(filter))
  )
  ipcMain.handle('mt5:orders_total', () => client.request('orders_total'))
  ipcMain.handle('mt5:orders_get', (_event, filter?: Mt5Filter) =>
    client.request('orders_get', assertFilter(filter))
  )
  ipcMain.handle('mt5:order_check', (_event, request: unknown) =>
    client.request('order_check', assertTradeRequest(request))
  )
  ipcMain.handle('mt5:order_send', (_event, request: unknown) =>
    client.request('order_send', assertTradeRequest(request))
  )
}
