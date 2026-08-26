import { safeStorage } from 'electron'

import type { AgentConfigPatch, AgentPublicConfig } from '../../preload/agent-types'
import type { AccountMode } from '../../preload/mt5-types'
import {
  DEFAULT_OKX_INST_ID,
  DEFAULT_OKX_LEVERAGE,
  DEFAULT_OKX_TD_MODE,
  type OkxTdMode,
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
  okxInstId: string
  okxDemo: boolean
  okxLeverage: number
  okxTdMode: OkxTdMode
  okxApiKeyEnc: string | null
  okxSecretEnc: string | null
  okxPassphraseEnc: string | null
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
    okxInstId: DEFAULT_OKX_INST_ID,
    okxDemo: true,
    okxLeverage: DEFAULT_OKX_LEVERAGE,
    okxTdMode: DEFAULT_OKX_TD_MODE,
    okxApiKeyEnc: null,
    okxSecretEnc: null,
    okxPassphraseEnc: null,
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
    tradingEnabled: parsed.tradingEnabled === true,
    enabled: parsed.enabled === true || parsed.tradingEnabled === true,
    apiKeyEnc: typeof parsed.apiKeyEnc === 'string' ? parsed.apiKeyEnc : null,
    maxVolume,
    riskPct: typeof parsed.riskPct === 'number' ? clampRiskPct(parsed.riskPct) : base.riskPct,
    fixedVolume:
      parsed.fixedVolume === null
        ? null
        : typeof parsed.fixedVolume === 'number'
          ? clampFixedVolume(parsed.fixedVolume, maxVolume, venue)
          : null,
    armedLogin: typeof parsed.armedLogin === 'number' ? parsed.armedLogin : null,
    armedMode: parsed.armedMode === 'demo' || parsed.armedMode === 'real' ? parsed.armedMode : null,
    venue,
    okxInstId:
      typeof parsed.okxInstId === 'string' && parsed.okxInstId.trim()
        ? normalizeInstId(parsed.okxInstId)
        : base.okxInstId,
    okxDemo: parsed.okxDemo !== false,
    okxLeverage:
      typeof parsed.okxLeverage === 'number' ? clampLeverage(parsed.okxLeverage) : base.okxLeverage,
    okxTdMode: parsed.okxTdMode === 'isolated' ? 'isolated' : 'cross',
    okxApiKeyEnc: typeof parsed.okxApiKeyEnc === 'string' ? parsed.okxApiKeyEnc : null,
    okxSecretEnc: typeof parsed.okxSecretEnc === 'string' ? parsed.okxSecretEnc : null,
    okxPassphraseEnc: typeof parsed.okxPassphraseEnc === 'string' ? parsed.okxPassphraseEnc : null,
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
    return normalizeStored(parsed)
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
    okx: {
      instId: cfg.okxInstId,
      demo: cfg.okxDemo,
      leverage: cfg.okxLeverage,
      tdMode: cfg.okxTdMode,
      hasKeys: Boolean(cfg.okxApiKeyEnc && cfg.okxSecretEnc && cfg.okxPassphraseEnc)
    }
  }
}

export function getVenue(): TradeVenue {
  return readStored().venue
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
  if (!cfg.okxApiKeyEnc || !cfg.okxSecretEnc || !cfg.okxPassphraseEnc) return null
  const apiKey = decryptKey(cfg.okxApiKeyEnc)?.trim()
  const secret = decryptKey(cfg.okxSecretEnc)?.trim()
  const passphrase = decryptKey(cfg.okxPassphraseEnc)?.trim()
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
  if (typeof patch.okxInstId === 'string' && patch.okxInstId.trim()) {
    const next = normalizeInstId(patch.okxInstId)
    if (next !== cfg.okxInstId && cfg.venue === 'okx') disarm(cfg)
    cfg.okxInstId = next
  }
  if (typeof patch.okxDemo === 'boolean') {
    if (patch.okxDemo !== cfg.okxDemo && cfg.venue === 'okx') disarm(cfg)
    cfg.okxDemo = patch.okxDemo
  }
  if (typeof patch.okxLeverage === 'number') {
    cfg.okxLeverage = clampLeverage(patch.okxLeverage)
  }
  if (patch.okxTdMode === 'cross' || patch.okxTdMode === 'isolated') {
    cfg.okxTdMode = patch.okxTdMode
  }
  if (typeof patch.okxApiKey === 'string') {
    const key = patch.okxApiKey.trim()
    cfg.okxApiKeyEnc = key ? encryptKey(key) : cfg.okxApiKeyEnc
  }
  if (typeof patch.okxSecret === 'string') {
    const key = patch.okxSecret.trim()
    cfg.okxSecretEnc = key ? encryptKey(key) : cfg.okxSecretEnc
  }
  if (typeof patch.okxPassphrase === 'string') {
    const key = patch.okxPassphrase.trim()
    cfg.okxPassphraseEnc = key ? encryptKey(key) : cfg.okxPassphraseEnc
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
