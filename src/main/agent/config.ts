import { safeStorage } from 'electron'

import type { AgentPublicConfig } from '../../preload/agent-types'
import type { AccountMode } from '../../preload/mt5-types'
import { getKvJson, setKv } from '../db/kv'
import { KV_KEYS } from '../db/schema'
import { armAccount, shouldDisarmTrading } from './account-guard'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000
export const DEFAULT_MAX_VOLUME = 0.1
export const DEFAULT_RISK_PCT = 0.01
const MIN_MAX_VOLUME = 0.01
const MAX_MAX_VOLUME = 1
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
}

function clampMaxVolume(value: number): number {
  return Math.round(Math.min(MAX_MAX_VOLUME, Math.max(MIN_MAX_VOLUME, value)) * 100) / 100
}

function clampRiskPct(value: number): number {
  return Math.round(Math.min(MAX_RISK_PCT, Math.max(MIN_RISK_PCT, value)) * 1000) / 1000
}

function clampFixedVolume(value: number | null, maxVolume: number): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return clampMaxVolume(Math.min(value, maxVolume))
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
    armedMode: null
  }
}

function normalizeStored(parsed: Partial<StoredConfig>): StoredConfig {
  const base = defaults()
  const modelRaw = typeof parsed.model === 'string' ? parsed.model.trim() : ''
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
    maxVolume:
      typeof parsed.maxVolume === 'number' ? clampMaxVolume(parsed.maxVolume) : base.maxVolume,
    riskPct: typeof parsed.riskPct === 'number' ? clampRiskPct(parsed.riskPct) : base.riskPct,
    fixedVolume:
      parsed.fixedVolume === null
        ? null
        : typeof parsed.fixedVolume === 'number'
          ? clampFixedVolume(
              parsed.fixedVolume,
              typeof parsed.maxVolume === 'number'
                ? clampMaxVolume(parsed.maxVolume)
                : base.maxVolume
            )
          : null,
    armedLogin: typeof parsed.armedLogin === 'number' ? parsed.armedLogin : null,
    armedMode: parsed.armedMode === 'demo' || parsed.armedMode === 'real' ? parsed.armedMode : null
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
    fixedVolume: cfg.fixedVolume
  }
}

export function getApiKey(): string | null {
  const enc = readStored().apiKeyEnc
  if (!enc) return null
  const key = decryptKey(enc)?.trim()
  return key || null
}

export function setConfig(
  patch: {
    baseUrl?: string
    model?: string
    temperature?: number
    intervalMs?: number
    enabled?: boolean
    tradingEnabled?: boolean
    apiKey?: string
    maxVolume?: number
    riskPct?: number
    fixedVolume?: number | null
  },
  accountMode: AccountMode = 'unknown',
  login: number | null = null
): AgentPublicConfig {
  const cfg = readStored()
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
    if (!patch.enabled) {
      cfg.tradingEnabled = false
      cfg.armedLogin = null
      cfg.armedMode = null
    }
  }
  if (typeof patch.tradingEnabled === 'boolean') {
    if (patch.tradingEnabled) {
      const armed = armAccount(login, accountMode)
      if (armed.armedMode == null || armed.armedLogin == null) {
        cfg.tradingEnabled = false
        cfg.armedLogin = null
        cfg.armedMode = null
      } else {
        cfg.tradingEnabled = true
        cfg.enabled = true
        cfg.armedLogin = armed.armedLogin
        cfg.armedMode = armed.armedMode
      }
    } else {
      cfg.tradingEnabled = false
      cfg.armedLogin = null
      cfg.armedMode = null
    }
  }
  if (cfg.tradingEnabled) {
    cfg.enabled = true
  }
  if (typeof patch.maxVolume === 'number') {
    cfg.maxVolume = clampMaxVolume(patch.maxVolume)
  }
  if (typeof patch.riskPct === 'number') {
    cfg.riskPct = clampRiskPct(patch.riskPct)
  }
  if (patch.fixedVolume === null) {
    cfg.fixedVolume = null
  } else if (typeof patch.fixedVolume === 'number') {
    cfg.fixedVolume = clampFixedVolume(patch.fixedVolume, cfg.maxVolume)
  }
  if (cfg.fixedVolume != null) {
    cfg.fixedVolume = clampFixedVolume(cfg.fixedVolume, cfg.maxVolume)
  }
  if (typeof patch.apiKey === 'string') {
    const key = patch.apiKey.trim()
    cfg.apiKeyEnc = key ? encryptKey(key) : null
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
  cfg.tradingEnabled = false
  cfg.armedLogin = null
  cfg.armedMode = null
  writeStored(cfg)
  return true
}
