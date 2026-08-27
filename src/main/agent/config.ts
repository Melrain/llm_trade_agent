import { safeStorage } from 'electron'

import type { AgentConfigPatch, AgentPublicConfig } from '../../preload/agent-types'
import type { AccountMode } from '../../preload/mt5-types'
import {
  DEFAULT_OKX_LEVERAGE,
  DEFAULT_OKX_TD_MODE,
  DEFAULT_TRADE_ASSET,
  assetFromInstId,
  isTradeAsset,
  okxInstIdForAsset,
  restoreMt5GoldDefault,
  type OkxTdMode,
  type TradeAsset,
  type TradeVenue
} from '../../preload/okx-types'
import { getKvJson, setKv } from '../db/kv'
import { KV_KEYS } from '../db/schema'
import { normalizeInstId } from '../okx/normalize'
import { armAccount, shouldDisarmTrading } from './account-guard'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000
export const DEFAULT_MAX_VOLUME = 0.1
export const DEFAULT_OKX_MAX_VOLUME = 1
export const DEFAULT_RISK_PCT = 0.01
export const DEFAULT_OKX_BASE_URL = 'https://www.okx.com'
const MIN_MAX_VOLUME = 0.01
const MAX_MAX_VOLUME_MT5 = 1
const MAX_MAX_VOLUME_OKX = 100
const MIN_RISK_PCT = 0.001
const MAX_RISK_PCT = 0.05

type StoredConfig = {
  baseUrl: string
  model: string
  temperature: number
  intervalMs: number
  enabled: boolean
  tradingEnabled: boolean
  apiKeyEnc: string | null
  maxVolume: number
  riskPct: number
  fixedVolume: number | null
  armedLogin: number | null
  armedMode: 'demo' | 'real' | null
  venue: TradeVenue
  asset: TradeAsset
  /** 对齐 BTC/ETH 时曾把未选手种的 MT5 配置写成 BTC；true 表示已回退过黄金默认 */
  mt5GoldDefaultRestored: boolean
  okxInstId: string
  okxDemo: boolean
  okxLeverage: number
  okxTdMode: OkxTdMode
  okxDemoApiKeyEnc: string | null
  okxDemoSecretEnc: string | null
  okxDemoPassphraseEnc: string | null
  okxLiveApiKeyEnc: string | null
  okxLiveSecretEnc: string | null
  okxLivePassphraseEnc: string | null
  okxBaseUrl: string
}

function volumeCap(venue: TradeVenue): number {
  return venue === 'okx' ? MAX_MAX_VOLUME_OKX : MAX_MAX_VOLUME_MT5
}

function defaultMaxVolume(venue: TradeVenue): number {
  return venue === 'okx' ? DEFAULT_OKX_MAX_VOLUME : DEFAULT_MAX_VOLUME
}

function clampMaxVolume(value: number, venue: TradeVenue): number {
  const cap = volumeCap(venue)
  return Math.round(Math.min(cap, Math.max(MIN_MAX_VOLUME, value)) * 100) / 100
}

function clampRiskPct(value: number): number {
  return Math.round(Math.min(MAX_RISK_PCT, Math.max(MIN_RISK_PCT, value)) * 1000) / 1000
}

function clampFixedVolume(
  value: number | null,
  maxVolume: number,
  venue: TradeVenue
): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return clampMaxVolume(Math.min(value, maxVolume), venue)
}

function resolveAsset(parsed: Partial<StoredConfig> & { okxInstId?: string }): TradeAsset {
  if (isTradeAsset(parsed.asset)) return parsed.asset
  if (typeof parsed.okxInstId === 'string' && parsed.okxInstId.trim()) {
    return assetFromInstId(normalizeInstId(parsed.okxInstId))
  }
  return DEFAULT_TRADE_ASSET
}

function slotHasKeys(key: string | null, secret: string | null, pass: string | null): boolean {
  return Boolean(key && secret && pass)
}

function migrateOkxKeys(parsed: Record<string, unknown>): Pick<
  StoredConfig,
  | 'okxDemoApiKeyEnc'
  | 'okxDemoSecretEnc'
  | 'okxDemoPassphraseEnc'
  | 'okxLiveApiKeyEnc'
  | 'okxLiveSecretEnc'
  | 'okxLivePassphraseEnc'
> {
  const asEnc = (value: unknown): string | null => (typeof value === 'string' ? value : null)
  let demoKey = asEnc(parsed.okxDemoApiKeyEnc)
  let demoSecret = asEnc(parsed.okxDemoSecretEnc)
  let demoPass = asEnc(parsed.okxDemoPassphraseEnc)
  let liveKey = asEnc(parsed.okxLiveApiKeyEnc)
  let liveSecret = asEnc(parsed.okxLiveSecretEnc)
  let livePass = asEnc(parsed.okxLivePassphraseEnc)
  const legacyKey = asEnc(parsed.okxApiKeyEnc)
  const legacySecret = asEnc(parsed.okxSecretEnc)
  const legacyPass = asEnc(parsed.okxPassphraseEnc)
  if (legacyKey && legacySecret && legacyPass) {
    if (parsed.okxDemo === false) {
      liveKey = liveKey ?? legacyKey
      liveSecret = liveSecret ?? legacySecret
      livePass = livePass ?? legacyPass
    } else {
      demoKey = demoKey ?? legacyKey
      demoSecret = demoSecret ?? legacySecret
      demoPass = demoPass ?? legacyPass
    }
  }
  return {
    okxDemoApiKeyEnc: demoKey,
    okxDemoSecretEnc: demoSecret,
    okxDemoPassphraseEnc: demoPass,
    okxLiveApiKeyEnc: liveKey,
    okxLiveSecretEnc: liveSecret,
    okxLivePassphraseEnc: livePass
  }
}

function clampLeverage(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OKX_LEVERAGE
  return Math.min(125, Math.max(1, Math.round(value)))
}

function defaults(): StoredConfig {
  return {
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    temperature: 0.2,
    intervalMs: DEFAULT_INTERVAL_MS,
    enabled: false,
    tradingEnabled: false,
    apiKeyEnc: null,
    maxVolume: DEFAULT_MAX_VOLUME,
    riskPct: DEFAULT_RISK_PCT,
    fixedVolume: null,
    armedLogin: null,
    armedMode: null,
    venue: 'mt5',
    asset: DEFAULT_TRADE_ASSET,
    mt5GoldDefaultRestored: true,
    okxInstId: okxInstIdForAsset(DEFAULT_TRADE_ASSET),
    okxDemo: true,
    okxLeverage: DEFAULT_OKX_LEVERAGE,
    okxTdMode: DEFAULT_OKX_TD_MODE,
    okxDemoApiKeyEnc: null,
    okxDemoSecretEnc: null,
    okxDemoPassphraseEnc: null,
    okxLiveApiKeyEnc: null,
    okxLiveSecretEnc: null,
    okxLivePassphraseEnc: null,
    okxBaseUrl: DEFAULT_OKX_BASE_URL
  }
}

function normalizeStored(parsed: Partial<StoredConfig>): StoredConfig {
  const base = defaults()
  const modelRaw = typeof parsed.model === 'string' ? parsed.model.trim() : ''
  const venue: TradeVenue = parsed.venue === 'okx' ? 'okx' : 'mt5'
  const maxVolume =
    typeof parsed.maxVolume === 'number'
      ? clampMaxVolume(parsed.maxVolume, venue)
      : defaultMaxVolume(venue)
  const resolved = resolveAsset(parsed)
  const alreadyRestored = parsed.mt5GoldDefaultRestored === true
  const asset = restoreMt5GoldDefault(venue, resolved, alreadyRestored)
  const restoredGold = !alreadyRestored && resolved === 'BTC' && asset === 'XAU'
  return {
    baseUrl:
      typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim()
        : base.baseUrl,
    model: !modelRaw || modelRaw === 'deepseek-chat' ? base.model : modelRaw,
    temperature:
      typeof parsed.temperature === 'number' && parsed.temperature >= 0 && parsed.temperature <= 0.5
        ? parsed.temperature
        : base.temperature,
    intervalMs:
      typeof parsed.intervalMs === 'number' && parsed.intervalMs >= 60_000
        ? parsed.intervalMs
        : base.intervalMs,
    tradingEnabled: restoredGold ? false : parsed.tradingEnabled === true,
    enabled: restoredGold
      ? parsed.enabled === true
      : parsed.enabled === true || parsed.tradingEnabled === true,
    apiKeyEnc: typeof parsed.apiKeyEnc === 'string' ? parsed.apiKeyEnc : null,
    maxVolume,
    riskPct: typeof parsed.riskPct === 'number' ? clampRiskPct(parsed.riskPct) : base.riskPct,
    fixedVolume:
      parsed.fixedVolume === null
        ? null
        : typeof parsed.fixedVolume === 'number'
          ? clampFixedVolume(parsed.fixedVolume, maxVolume, venue)
          : null,
    armedLogin: restoredGold
      ? null
      : typeof parsed.armedLogin === 'number'
        ? parsed.armedLogin
        : null,
    armedMode: restoredGold
      ? null
      : parsed.armedMode === 'demo' || parsed.armedMode === 'real'
        ? parsed.armedMode
        : null,
    venue,
    asset,
    mt5GoldDefaultRestored: true,
    okxInstId: okxInstIdForAsset(asset),
    okxDemo: parsed.okxDemo !== false,
    okxLeverage:
      typeof parsed.okxLeverage === 'number' ? clampLeverage(parsed.okxLeverage) : base.okxLeverage,
    okxTdMode: parsed.okxTdMode === 'isolated' ? 'isolated' : 'cross',
    ...migrateOkxKeys(parsed),
    okxBaseUrl:
      typeof parsed.okxBaseUrl === 'string' && parsed.okxBaseUrl.trim()
        ? parsed.okxBaseUrl.trim().replace(/\/+$/, '')
        : base.okxBaseUrl
  }
}

function readStored(): StoredConfig {
  try {
    const parsed = getKvJson<Partial<StoredConfig>>(KV_KEYS.agentConfig)
    if (!parsed) return defaults()
    const next = normalizeStored(parsed)
    if (parsed.mt5GoldDefaultRestored !== true) writeStored(next)
    return next
  } catch (error) {
    console.warn('[agent] config read', error instanceof Error ? error.message : error)
    return defaults()
  }
}

function writeStored(cfg: StoredConfig): void {
  try {
    setKv(KV_KEYS.agentConfig, cfg)
  } catch (error) {
    console.warn('[agent] config write', error instanceof Error ? error.message : error)
  }
}

function encryptKey(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain).toString('base64')
  }
  return Buffer.from(plain, 'utf8').toString('base64')
}

function decryptKey(enc: string): string | null {
  try {
    const buf = Buffer.from(enc, 'base64')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
    return buf.toString('utf8')
  } catch {
    return null
  }
}

export function getPublicConfig(accountMode: AccountMode = 'unknown'): AgentPublicConfig {
  const cfg = readStored()
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    temperature: cfg.temperature,
    intervalMs: cfg.intervalMs,
    enabled: cfg.enabled,
    tradingEnabled: cfg.tradingEnabled,
    accountMode,
    hasApiKey: Boolean(cfg.apiKeyEnc),
    maxVolume: cfg.maxVolume,
    riskPct: cfg.riskPct,
    fixedVolume: cfg.fixedVolume,
    venue: cfg.venue,
    asset: cfg.asset,
    okx: {
      instId: cfg.okxInstId,
      demo: cfg.okxDemo,
      leverage: cfg.okxLeverage,
      tdMode: cfg.okxTdMode,
      hasKeys: cfg.okxDemo
        ? slotHasKeys(cfg.okxDemoApiKeyEnc, cfg.okxDemoSecretEnc, cfg.okxDemoPassphraseEnc)
        : slotHasKeys(cfg.okxLiveApiKeyEnc, cfg.okxLiveSecretEnc, cfg.okxLivePassphraseEnc),
      hasDemoKeys: slotHasKeys(cfg.okxDemoApiKeyEnc, cfg.okxDemoSecretEnc, cfg.okxDemoPassphraseEnc),
      hasLiveKeys: slotHasKeys(cfg.okxLiveApiKeyEnc, cfg.okxLiveSecretEnc, cfg.okxLivePassphraseEnc)
    }
  }
}

export function getVenue(): TradeVenue {
  return readStored().venue
}

export function getAsset(): TradeAsset {
  return readStored().asset
}

export function getApiKey(): string | null {
  const enc = readStored().apiKeyEnc
  if (!enc) return null
  const key = decryptKey(enc)?.trim()
  return key || null
}

export function getOkxCredentials(): {
  apiKey: string
  secret: string
  passphrase: string
  demo: boolean
  baseUrl: string
} | null {
  const cfg = readStored()
  const apiKeyEnc = cfg.okxDemo ? cfg.okxDemoApiKeyEnc : cfg.okxLiveApiKeyEnc
  const secretEnc = cfg.okxDemo ? cfg.okxDemoSecretEnc : cfg.okxLiveSecretEnc
  const passEnc = cfg.okxDemo ? cfg.okxDemoPassphraseEnc : cfg.okxLivePassphraseEnc
  if (!apiKeyEnc || !secretEnc || !passEnc) return null
  const apiKey = decryptKey(apiKeyEnc)?.trim()
  const secret = decryptKey(secretEnc)?.trim()
  const passphrase = decryptKey(passEnc)?.trim()
  if (!apiKey || !secret || !passphrase) return null
  return {
    apiKey,
    secret,
    passphrase,
    demo: cfg.okxDemo,
    baseUrl: cfg.okxBaseUrl || DEFAULT_OKX_BASE_URL
  }
}

function disarm(cfg: StoredConfig): void {
  cfg.tradingEnabled = false
  cfg.armedLogin = null
  cfg.armedMode = null
}

export function setConfig(
  patch: AgentConfigPatch,
  accountMode: AccountMode = 'unknown',
  login: number | null = null
): AgentPublicConfig {
  const cfg = readStored()
  const prevVenue = cfg.venue
  if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) {
    cfg.baseUrl = patch.baseUrl.trim().replace(/\/+$/, '')
  }
  if (typeof patch.model === 'string' && patch.model.trim()) {
    cfg.model = patch.model.trim()
  }
  if (typeof patch.temperature === 'number' && patch.temperature >= 0 && patch.temperature <= 0.5) {
    cfg.temperature = patch.temperature
  }
  if (typeof patch.intervalMs === 'number' && patch.intervalMs >= 60_000) {
    cfg.intervalMs = patch.intervalMs
  }
  if (typeof patch.enabled === 'boolean') {
    cfg.enabled = patch.enabled
    if (!patch.enabled) disarm(cfg)
  }
  if (typeof patch.tradingEnabled === 'boolean') {
    if (patch.tradingEnabled) {
      const armed = armAccount(login, accountMode)
      if (armed.armedMode == null || armed.armedLogin == null) {
        disarm(cfg)
      } else {
        cfg.tradingEnabled = true
        cfg.enabled = true
        cfg.armedLogin = armed.armedLogin
        cfg.armedMode = armed.armedMode
      }
    } else {
      disarm(cfg)
    }
  }
  if (cfg.tradingEnabled) {
    cfg.enabled = true
  }
  if (patch.venue === 'mt5' || patch.venue === 'okx') {
    if (patch.venue !== prevVenue) {
      disarm(cfg)
      if (typeof patch.maxVolume !== 'number') {
        cfg.maxVolume = defaultMaxVolume(patch.venue)
      }
      cfg.fixedVolume = null
    }
    cfg.venue = patch.venue
  }
  if (typeof patch.maxVolume === 'number') {
    cfg.maxVolume = clampMaxVolume(patch.maxVolume, cfg.venue)
  } else {
    cfg.maxVolume = clampMaxVolume(cfg.maxVolume, cfg.venue)
  }
  if (typeof patch.riskPct === 'number') {
    cfg.riskPct = clampRiskPct(patch.riskPct)
  }
  if (patch.fixedVolume === null) {
    cfg.fixedVolume = null
  } else if (typeof patch.fixedVolume === 'number') {
    cfg.fixedVolume = clampFixedVolume(patch.fixedVolume, cfg.maxVolume, cfg.venue)
  }
  if (cfg.fixedVolume != null) {
    cfg.fixedVolume = clampFixedVolume(cfg.fixedVolume, cfg.maxVolume, cfg.venue)
  }
  if (typeof patch.apiKey === 'string') {
    const key = patch.apiKey.trim()
    cfg.apiKeyEnc = key ? encryptKey(key) : null
  }
  if (isTradeAsset(patch.asset)) {
    if (patch.asset !== cfg.asset) disarm(cfg)
    cfg.asset = patch.asset
    cfg.okxInstId = okxInstIdForAsset(patch.asset)
  } else if (typeof patch.okxInstId === 'string' && patch.okxInstId.trim()) {
    const next = normalizeInstId(patch.okxInstId)
    if (next !== cfg.okxInstId) disarm(cfg)
    cfg.okxInstId = next
    cfg.asset = assetFromInstId(next)
  }
  if (typeof patch.okxDemo === 'boolean') {
    if (patch.okxDemo !== cfg.okxDemo) disarm(cfg)
    cfg.okxDemo = patch.okxDemo
  }
  if (typeof patch.okxLeverage === 'number') {
    cfg.okxLeverage = clampLeverage(patch.okxLeverage)
  }
  if (patch.okxTdMode === 'cross' || patch.okxTdMode === 'isolated') {
    cfg.okxTdMode = patch.okxTdMode
  }
  if (typeof patch.okxApiKey === 'string' && patch.okxApiKey.trim()) {
    const enc = encryptKey(patch.okxApiKey.trim())
    if (cfg.okxDemo) cfg.okxDemoApiKeyEnc = enc
    else cfg.okxLiveApiKeyEnc = enc
  }
  if (typeof patch.okxSecret === 'string' && patch.okxSecret.trim()) {
    const enc = encryptKey(patch.okxSecret.trim())
    if (cfg.okxDemo) cfg.okxDemoSecretEnc = enc
    else cfg.okxLiveSecretEnc = enc
  }
  if (typeof patch.okxPassphrase === 'string' && patch.okxPassphrase.trim()) {
    const enc = encryptKey(patch.okxPassphrase.trim())
    if (cfg.okxDemo) cfg.okxDemoPassphraseEnc = enc
    else cfg.okxLivePassphraseEnc = enc
  }
  writeStored(cfg)
  return getPublicConfig(accountMode)
}

export function disarmIfAccountDrift(current: {
  login: number | null
  mode: AccountMode
}): boolean {
  const cfg = readStored()
  if (
    !shouldDisarmTrading({
      tradingEnabled: cfg.tradingEnabled,
      armedLogin: cfg.armedLogin,
      armedMode: cfg.armedMode,
      currentLogin: current.login,
      currentMode: current.mode
    })
  ) {
    return false
  }
  disarm(cfg)
  writeStored(cfg)
  return true
}
