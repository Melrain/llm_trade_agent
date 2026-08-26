import type {
  OkxBalance,
  OkxBill,
  OkxCandle,
  OkxConnectionTest,
  OkxFill,
  OkxInstrumentSpec,
  OkxOrderResult,
  OkxPlaceOrderInput,
  OkxPosMode,
  OkxPosition,
  OkxTdMode,
  OkxTicker
} from '../../preload/okx-types'
import { fetchJson } from '../http'
import {
  assertContractInst,
  buildQuery,
  digitsFromTick,
  normalizeInstId,
  sanitizeClOrdId
} from './normalize'
import { buildOkxHeaders } from './sign'

type OkxEnvelope<T> = {
  code?: string
  msg?: string
  data?: T
}

type Credentials = {
  apiKey: string
  secret: string
  passphrase: string
  demo: boolean
  baseUrl: string
}

export type OkxCredentialReader = () => Credentials | null

const PUBLIC_TIMEOUT_MS = 12_000
const SIGNED_TIMEOUT_MS = 15_000
const SPEC_TTL_MS = 10 * 60_000
const POS_MODE_TTL_MS = 60_000
const CANDLE_LIMIT = 300

function asNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : NaN
}

function asNumOrNull(value: unknown): number | null {
  const n = asNum(value)
  return Number.isFinite(n) ? n : null
}

function unwrap<T>(res: OkxEnvelope<T>, path: string): T {
  if (res?.code && res.code !== '0') {
    throw new Error(`OKX ${res.code}: ${res.msg || path}`)
  }
  return res.data as T
}

function asOrderResult(res: OkxEnvelope<Array<Record<string, unknown>>>): OkxOrderResult {
  const row = res.data?.[0] ?? {}
  const sCode = typeof row.sCode === 'string' ? row.sCode : null
  const ok = (!res.code || res.code === '0') && (sCode == null || sCode === '0')
  return {
    code: ok ? '0' : String(res.code ?? sCode ?? '1'),
    msg: typeof res.msg === 'string' ? res.msg : '',
    ordId: typeof row.ordId === 'string' && row.ordId ? row.ordId : null,
    clOrdId: typeof row.clOrdId === 'string' && row.clOrdId ? row.clOrdId : null,
    sCode,
    sMsg: typeof row.sMsg === 'string' ? row.sMsg : null,
    avgPx: asNumOrNull(row.avgPx),
    sz: asNumOrNull(row.sz)
  }
}

export class OkxClient {
  private specCache = new Map<string, OkxInstrumentSpec & { ts: number }>()
  private posModeCache: { posMode: OkxPosMode; ts: number } | null = null
  private levCache = new Map<string, number>()
  private credsFp: string | null = null

  constructor(private readonly readCredentials: OkxCredentialReader) {}

  credentials(): Credentials | null {
    return this.syncCredentials()
  }

  hasKeys(): boolean {
    return this.syncCredentials() != null
  }

  private syncCredentials(): Credentials | null {
    const creds = this.readCredentials()
    const fp = creds ? `${creds.demo ? '1' : '0'}|${creds.apiKey}|${creds.baseUrl}` : ''
    if (fp !== this.credsFp) {
      this.credsFp = fp
      this.posModeCache = null
      this.levCache.clear()
    }
    return creds
  }

  async testConnection(): Promise<OkxConnectionTest> {
    const creds = this.syncCredentials()
    if (!creds) {
      return { ok: false, demo: false, uid: null, posMode: null, error: '尚未配置 OKX API Key' }
    }
    try {
      const cfg = await this.getAccountConfig()
      return {
        ok: true,
        demo: creds.demo,
        uid: cfg.uid,
        posMode: cfg.posMode,
        error: null
      }
    } catch (error) {
      return {
        ok: false,
        demo: creds.demo,
        uid: null,
        posMode: null,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async getTicker(instIdRaw: string): Promise<OkxTicker> {
    const instId = normalizeInstId(instIdRaw)
    const data = await this.publicGet<Array<Record<string, unknown>>>('/api/v5/market/ticker', {
      instId
    })
    const row = data[0]
    if (!row) throw new Error(`没有行情：${instId}`)
    const bid = asNum(row.bidPx)
    const ask = asNum(row.askPx)
    const last = asNum(row.last)
    const mid =
      Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : last
    return {
      instId,
      last: Number.isFinite(last) ? last : mid,
      bid: Number.isFinite(bid) ? bid : mid,
      ask: Number.isFinite(ask) ? ask : mid,
      mid,
      ts: asNum(row.ts) || Date.now()
    }
  }

  async getCandles(
    instIdRaw: string,
    bar: string,
    limit = CANDLE_LIMIT,
    after?: number
  ): Promise<OkxCandle[]> {
    const instId = normalizeInstId(instIdRaw)
    const data = await this.publicGet<unknown[][]>('/api/v5/market/candles', {
      instId,
      bar,
      limit: Math.min(Math.max(1, limit), CANDLE_LIMIT),
      ...(after != null && Number.isFinite(after) ? { after } : {})
    })
    const rows = Array.isArray(data) ? data : []
    const out: OkxCandle[] = []
    for (const row of rows) {
      const ts = asNum(row?.[0])
      const open = asNum(row?.[1])
      const high = asNum(row?.[2])
      const low = asNum(row?.[3])
      const close = asNum(row?.[4])
      if (![ts, open, high, low, close].every(Number.isFinite)) continue
      out.push({
        ts,
        open,
        high,
        low,
        close,
        confirm: String(row?.[8] ?? '1') === '1'
      })
    }
    // OKX 新→旧，统一升序
    out.sort((a, b) => a.ts - b.ts)
    return out
  }

  async getInstrumentSpec(instIdRaw: string): Promise<OkxInstrumentSpec> {
    const instId = normalizeInstId(instIdRaw)
    const now = Date.now()
    const hit = this.specCache.get(instId)
    if (hit && now - hit.ts < SPEC_TTL_MS) return hit

    const data = await this.publicGet<Array<Record<string, unknown>>>(
      '/api/v5/public/instruments',
      { instType: 'SWAP', instId }
    )
    const row = data[0]
    if (!row) throw new Error(`找不到合约：${instId}`)
    const tickSz = asNum(row.tickSz) || 0.1
    const spec: OkxInstrumentSpec & { ts: number } = {
      instId,
      ctVal: asNum(row.ctVal ?? row.ctMult) || 1,
      lotSz: asNum(row.lotSz) || 1,
      tickSz,
      minSz: asNum(row.minSz ?? row.lotSz) || 1,
      digits: digitsFromTick(tickSz),
      ts: now
    }
    this.specCache.set(instId, spec)
    return spec
  }

  async getFundingRate(instIdRaw: string): Promise<number | null> {
    const instId = normalizeInstId(instIdRaw)
    try {
      const data = await this.publicGet<Array<Record<string, unknown>>>(
        '/api/v5/public/funding-rate',
        { instId }
      )
      return asNumOrNull(data[0]?.fundingRate)
    } catch {
      return null
    }
  }

  async getAccountConfig(): Promise<{ uid: string | null; posMode: OkxPosMode }> {
    const data = await this.signedGet<Array<Record<string, unknown>>>('/api/v5/account/config')
    const row = data[0] ?? {}
    const posMode = row.posMode === 'long_short_mode' ? 'long_short_mode' : 'net_mode'
    this.posModeCache = { posMode, ts: Date.now() }
    return {
      uid: row.uid != null ? String(row.uid) : null,
      posMode
    }
  }

  async getPosMode(): Promise<OkxPosMode> {
    const now = Date.now()
    if (this.posModeCache && now - this.posModeCache.ts < POS_MODE_TTL_MS) {
      return this.posModeCache.posMode
    }
    return (await this.getAccountConfig()).posMode
  }

  async getBalance(): Promise<OkxBalance> {
    const data = await this.signedGet<Array<Record<string, unknown>>>('/api/v5/account/balance')
    const row = data[0] ?? {}
    const details = Array.isArray(row.details) ? row.details : []
    return {
      uid: row.uid != null ? String(row.uid) : null,
      totalEq: asNum(row.totalEq) || 0,
      availEq: asNum(row.availEq) || 0,
      adjEq: asNum(row.adjEq) || 0,
      upl: asNum(row.upl) || 0,
      isoEq: asNum(row.isoEq) || 0,
      details: details.map((item) => {
        const d = item as Record<string, unknown>
        return {
          ccy: String(d.ccy ?? ''),
          eq: asNum(d.eq) || 0,
          availEq: asNum(d.availEq) || 0,
          upl: asNum(d.upl) || 0
        }
      })
    }
  }

  async getPositions(instIdRaw?: string): Promise<OkxPosition[]> {
    const query: Record<string, string> = { instType: 'SWAP' }
    if (instIdRaw) query.instId = normalizeInstId(instIdRaw)
    const data = await this.signedGet<Array<Record<string, unknown>>>(
      '/api/v5/account/positions',
      query
    )
    return (Array.isArray(data) ? data : [])
      .map((row) => {
        const pos = asNum(row.pos) || 0
        const posSideRaw = String(row.posSide ?? 'net')
        const posSide: OkxPosition['posSide'] =
          posSideRaw === 'long' || posSideRaw === 'short' ? posSideRaw : 'net'
        return {
          instId: String(row.instId ?? ''),
          posId: String(row.posId ?? ''),
          pos,
          posSide,
          avgPx: asNum(row.avgPx) || 0,
          upl: asNum(row.upl) || 0,
          lever: asNum(row.lever) || 0,
          mgnMode: (row.mgnMode === 'isolated' ? 'isolated' : 'cross') as OkxTdMode,
          notionalUsd: asNum(row.notionalUsd) || 0,
          last: asNum(row.last) || 0,
          slTriggerPx: asNumOrNull(row.slTriggerPx),
          tpTriggerPx: asNumOrNull(row.tpTriggerPx)
        }
      })
      .filter((row) => row.instId && Math.abs(row.pos) > 0)
  }

  async getFills(input: {
    instId?: string
    beginMs?: number
    endMs?: number
    limit?: number
  }): Promise<OkxFill[]> {
    const data = await this.signedGet<Array<Record<string, unknown>>>('/api/v5/trade/fills', {
      instType: 'SWAP',
      instId: input.instId ? normalizeInstId(input.instId) : undefined,
      begin: input.beginMs,
      end: input.endMs,
      limit: input.limit ?? 100
    })
    return (Array.isArray(data) ? data : []).map((row) => ({
      instId: String(row.instId ?? ''),
      tradeId: String(row.tradeId ?? ''),
      ordId: String(row.ordId ?? ''),
      clOrdId: String(row.clOrdId ?? ''),
      side: row.side === 'sell' ? 'sell' : 'buy',
      posSide: String(row.posSide ?? ''),
      fillPx: asNum(row.fillPx) || 0,
      fillSz: asNum(row.fillSz) || 0,
      fee: asNum(row.fee) || 0,
      ts: asNum(row.ts) || 0,
      execType: String(row.execType ?? '')
    }))
  }

  async getBills(beginMs: number, endMs = Date.now()): Promise<OkxBill[]> {
    const data = await this.signedGet<Array<Record<string, unknown>>>('/api/v5/account/bills', {
      instType: 'SWAP',
      begin: beginMs,
      end: endMs,
      limit: 100
    })
    return (Array.isArray(data) ? data : []).map((row) => ({
      billId: String(row.billId ?? ''),
      instId: String(row.instId ?? ''),
      type: String(row.type ?? ''),
      subType: String(row.subType ?? ''),
      pnl: asNum(row.pnl) || 0,
      fee: asNum(row.fee) || 0,
      ts: asNum(row.ts) || 0
    }))
  }

  async setLeverage(input: {
    instId: string
    lever: string
    mgnMode: OkxTdMode
    posSide?: 'long' | 'short'
  }): Promise<void> {
    const instId = normalizeInstId(input.instId)
    const key = `${instId}|${input.mgnMode}|${input.lever}|${input.posSide ?? ''}`
    const hit = this.levCache.get(key)
    if (hit && Date.now() - hit < 10 * 60_000) return
    await this.signedPost('/api/v5/account/set-leverage', {
      instId,
      lever: input.lever,
      mgnMode: input.mgnMode,
      ...(input.posSide ? { posSide: input.posSide } : {})
    })
    this.levCache.set(key, Date.now())
  }

  async placeOrder(input: OkxPlaceOrderInput): Promise<OkxOrderResult> {
    const instId = normalizeInstId(input.instId)
    assertContractInst(instId)
    const tdMode = (input.tdMode ?? 'cross').toLowerCase() as OkxTdMode
    if (tdMode !== 'cross' && tdMode !== 'isolated') {
      throw new Error(`无效 tdMode: ${input.tdMode}`)
    }

    let ordType = input.ordType ?? 'market'
    let px = input.px
    if (ordType === 'limit' && !px) ordType = 'market'
    if (ordType === 'market') px = undefined

    const posMode = await this.getPosMode()
    let posSide = input.posSide
    if (posMode === 'long_short_mode') {
      if (!posSide) {
        posSide = input.side === 'buy' ? 'long' : 'short'
        if (input.reduceOnly) posSide = input.side === 'buy' ? 'short' : 'long'
      }
    } else {
      posSide = undefined
    }

    if (input.lever) {
      await this.setLeverage({
        instId,
        lever: String(input.lever),
        mgnMode: tdMode,
        posSide: posMode === 'long_short_mode' ? (posSide ?? 'long') : undefined
      })
    }

    const attachAlgoOrds = this.buildAttachAlgo(input.sl, input.tp)
    const body: Record<string, unknown> = {
      instId,
      tdMode,
      side: input.side,
      ordType,
      sz: input.sz,
      ...(px ? { px } : {}),
      ...(posSide ? { posSide } : {}),
      ...(sanitizeClOrdId(input.clOrdId) ? { clOrdId: sanitizeClOrdId(input.clOrdId) } : {}),
      ...(input.reduceOnly !== undefined ? { reduceOnly: String(input.reduceOnly) } : {}),
      ...(attachAlgoOrds ? { attachAlgoOrds } : {})
    }
    const res = await this.signedPostRaw('/api/v5/trade/order', body)
    const result = asOrderResult(res)
    if (result.code !== '0') {
      throw new Error(`OKX 下单失败 ${result.sCode ?? result.code}: ${result.sMsg || result.msg}`)
    }
    return result
  }

  async closePosition(
    instIdRaw: string,
    tdMode: OkxTdMode,
    posSide?: 'long' | 'short'
  ): Promise<OkxOrderResult> {
    const instId = normalizeInstId(instIdRaw)
    const posMode = await this.getPosMode()
    const body: Record<string, unknown> = {
      instId,
      mgnMode: tdMode
    }
    if (posMode === 'long_short_mode') {
      body.posSide = posSide ?? 'long'
    }
    const res = await this.signedPostRaw('/api/v5/trade/close-position', body)
    return asOrderResult(res)
  }

  async listPendingAlgos(instIdRaw: string): Promise<Array<Record<string, unknown>>> {
    const instId = normalizeInstId(instIdRaw)
    const data = await this.signedGet<Array<Record<string, unknown>>>(
      '/api/v5/trade/orders-algo-pending',
      { instType: 'SWAP', instId, ordType: 'conditional' }
    )
    return Array.isArray(data) ? data : []
  }

  async cancelAlgos(instId: string, algoIds: string[]): Promise<void> {
    if (algoIds.length === 0) return
    await this.signedPost(
      '/api/v5/trade/cancel-algos',
      algoIds.map((algoId) => ({ instId: normalizeInstId(instId), algoId }))
    )
  }

  async placeAlgoSlTp(input: {
    instId: string
    tdMode: OkxTdMode
    side: 'buy' | 'sell'
    sz: string
    sl?: number
    tp?: number
    posSide?: 'long' | 'short'
  }): Promise<OkxOrderResult> {
    const instId = normalizeInstId(input.instId)
    const posMode = await this.getPosMode()
    const body: Record<string, unknown> = {
      instId,
      tdMode: input.tdMode,
      side: input.side,
      ordType: input.sl != null && input.tp != null ? 'oco' : 'conditional',
      sz: input.sz,
      reduceOnly: true,
      ...(posMode === 'long_short_mode'
        ? { posSide: input.posSide ?? (input.side === 'buy' ? 'short' : 'long') }
        : {}),
      ...(input.sl != null
        ? { slTriggerPx: String(input.sl), slOrdPx: '-1', slTriggerPxType: 'last' }
        : {}),
      ...(input.tp != null
        ? { tpTriggerPx: String(input.tp), tpOrdPx: '-1', tpTriggerPxType: 'last' }
        : {})
    }
    const res = await this.signedPostRaw('/api/v5/trade/order-algo', body)
    return asOrderResult(res)
  }

  async replaceAlgoSlTp(input: {
    instId: string
    tdMode: OkxTdMode
    side: 'buy' | 'sell'
    sz: string
    sl?: number
    tp?: number
    posSide?: 'long' | 'short'
  }): Promise<OkxOrderResult> {
    const pending = await this.listPendingAlgos(input.instId)
    const ids = pending
      .map((row) => (typeof row.algoId === 'string' ? row.algoId : ''))
      .filter(Boolean)
    if (ids.length) await this.cancelAlgos(input.instId, ids)
    if (input.sl == null && input.tp == null) {
      return {
        code: '0',
        msg: '',
        ordId: null,
        clOrdId: null,
        sCode: '0',
        sMsg: 'cleared',
        avgPx: null,
        sz: null
      }
    }
    return this.placeAlgoSlTp(input)
  }

  private buildAttachAlgo(sl?: number, tp?: number): Array<Record<string, string>> | undefined {
    if (sl == null && tp == null) return undefined
    const row: Record<string, string> = {}
    if (sl != null) {
      row.slTriggerPx = String(sl)
      row.slOrdPx = '-1'
      row.slTriggerPxType = 'last'
    }
    if (tp != null) {
      row.tpTriggerPx = String(tp)
      row.tpOrdPx = '-1'
      row.tpTriggerPxType = 'last'
    }
    return [row]
  }

  private async publicGet<T>(
    path: string,
    query?: Record<string, string | number | undefined>
  ): Promise<T> {
    const creds = this.syncCredentials()
    const base = creds?.baseUrl || 'https://www.okx.com'
    const qs = query ? buildQuery(query) : ''
    const res = await fetchJson<OkxEnvelope<T>>(`${base}${path}${qs}`, {
      timeoutMs: PUBLIC_TIMEOUT_MS,
      retries: 2
    })
    return unwrap(res, path)
  }

  private async signedGet<T>(
    path: string,
    query?: Record<string, string | number | undefined>
  ): Promise<T> {
    const creds = this.requireCreds()
    const qs = query ? buildQuery(query) : ''
    const requestPath = `${path}${qs}`
    const timestamp = new Date().toISOString()
    const res = await fetchJson<OkxEnvelope<T>>(`${creds.baseUrl}${requestPath}`, {
      timeoutMs: SIGNED_TIMEOUT_MS,
      retries: 1,
      headers: buildOkxHeaders({
        apiKey: creds.apiKey,
        secret: creds.secret,
        passphrase: creds.passphrase,
        timestamp,
        method: 'GET',
        requestPath,
        demo: creds.demo
      })
    })
    return unwrap(res, path)
  }

  private async signedPost(path: string, body: unknown): Promise<unknown> {
    const res = await this.signedPostRaw(path, body)
    return unwrap(res, path)
  }

  private async signedPostRaw(
    path: string,
    body: unknown
  ): Promise<OkxEnvelope<Array<Record<string, unknown>>>> {
    const creds = this.requireCreds()
    const bodyText = JSON.stringify(body)
    const timestamp = new Date().toISOString()
    return fetchJson<OkxEnvelope<Array<Record<string, unknown>>>>(`${creds.baseUrl}${path}`, {
      method: 'POST',
      bodyText,
      timeoutMs: SIGNED_TIMEOUT_MS,
      retries: 2,
      headers: buildOkxHeaders({
        apiKey: creds.apiKey,
        secret: creds.secret,
        passphrase: creds.passphrase,
        timestamp,
        method: 'POST',
        requestPath: path,
        body: bodyText,
        demo: creds.demo
      })
    })
  }

  private requireCreds(): Credentials {
    const creds = this.syncCredentials()
    if (!creds) throw new Error('尚未配置 OKX API Key / Secret / Passphrase')
    return creds
  }
}
