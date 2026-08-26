import { DEFAULT_OKX_INST_ID, type OkxInstrumentSpec } from '../../preload/okx-types'

/** 把 btc / BTC-USDT / btc-usdt-swap 归一成 OKX 永续合约 instId */
export function normalizeInstId(raw: string, fallback = DEFAULT_OKX_INST_ID): string {
  const inst = raw.trim().toUpperCase()
  if (!inst) return fallback
  if (!inst.includes('-')) return `${inst}-USDT-SWAP`
  if (inst.endsWith('-SWAP') || inst.endsWith('-FUTURES')) return inst
  return `${inst}-SWAP`
}

export function isContractInst(instId: string): boolean {
  return /-SWAP$/.test(instId) || /-FUTURES$/.test(instId)
}

export function assertContractInst(instId: string): void {
  if (!isContractInst(instId)) {
    throw new Error(`instId 必须是永续或交割合约：${instId}`)
  }
}

export function sanitizeClOrdId(id?: string): string | undefined {
  if (!id) return undefined
  const clean = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)
  return clean || undefined
}

export function digitsFromTick(tickSz: number): number {
  if (!(tickSz > 0) || !Number.isFinite(tickSz)) return 2
  const text = tickSz.toString()
  const idx = text.indexOf('.')
  if (idx < 0) return 0
  return text.length - idx - 1
}

export function alignToStep(raw: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(raw)) return raw
  const steps = Math.floor((raw + 1e-12) / step)
  return Number((steps * step).toFixed(12))
}

export function alignPrice(px: number, tickSz: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(tickSz) || tickSz <= 0) return px
  return Number((Math.round(px / tickSz) * tickSz).toFixed(12))
}

export function notionalToSize(
  notionalUSDT: number,
  px: number,
  spec: Pick<OkxInstrumentSpec, 'ctVal' | 'lotSz' | 'minSz'>
): number {
  if (!(notionalUSDT > 0) || !(px > 0) || !(spec.ctVal > 0)) {
    throw new Error('名义或价格无效，无法换算张数')
  }
  let sz = notionalUSDT / (px * spec.ctVal)
  sz = alignToStep(sz, spec.lotSz)
  if (sz < spec.minSz) sz = spec.minSz
  return Number(sz.toFixed(12))
}

export function formatSz(sz: number): string {
  return String(Number(sz.toFixed(12)))
}

export function posIdToTicket(posId: string): number {
  const n = Number(posId)
  if (Number.isFinite(n) && n > 0) return n
  let hash = 0
  for (let i = 0; i < posId.length; i += 1) {
    hash = (hash * 31 + posId.charCodeAt(i)) >>> 0
  }
  return hash || 1
}

export function buildQuery(obj: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(obj).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    entries
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
  )
}
