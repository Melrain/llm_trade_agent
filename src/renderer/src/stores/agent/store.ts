import { create } from 'zustand'

import type { AgentPublicConfig } from '../../../../preload/agent-types'
import type { AgentStore } from './types'

const idleConfig: AgentPublicConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-pro',
  temperature: 0.2,
  intervalMs: 15 * 60 * 1000,
  enabled: false,
  tradingEnabled: false,
  accountMode: 'unknown',
  hasApiKey: false,
  maxVolume: 0.1,
  riskPct: 0.01,
  fixedVolume: null
}

let subscribed = false

export const useAgentStore = create<AgentStore>()((set, get) => ({
  records: [],
  config: null,
  stats: null,
  running: false,
  saving: false,
  error: null,
  applyRecords: (records) => {
    set({ records: [...records].reverse() })
    window.api.agent
      .stats()
      .then((stats) => set({ stats }))
      .catch(() => undefined)
  },
  initialize: async () => {
    if (!subscribed) {
      subscribed = true
      window.api.agent.onUpdated((records) => {
        get().applyRecords(records)
      })
      window.api.agent.onConfig((config) => {
        set({ config })
      })
    }
    try {
      const [records, config] = await Promise.all([
        window.api.agent.list(),
        window.api.agent.getConfig()
      ])
      get().applyRecords(records)
      set({ config, error: null })
    } catch (error) {
      console.error('[agent] init failed', error)
      set({ config: idleConfig, error: error instanceof Error ? error.message : String(error) })
    }
  },
  run: async () => {
    set({ running: true, error: null })
    try {
      await window.api.agent.run()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ error: message })
    } finally {
      set({ running: false })
    }
  },
  saveConfig: async (patch) => {
    set({ saving: true, error: null })
    try {
      const config = await window.api.agent.setConfig(patch)
      set({ config })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ saving: false })
    }
  }
}))
