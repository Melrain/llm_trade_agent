import type {
  AgentConfigPatch,
  AgentPublicConfig,
  AgentRecord,
  AgentStats
} from '../../../../preload/agent-types'

export type AgentState = {
  records: AgentRecord[]
  config: AgentPublicConfig | null
  stats: AgentStats | null
  running: boolean
  saving: boolean
  error: string | null
}

export type AgentActions = {
  initialize: () => Promise<void>
  run: () => Promise<void>
  saveConfig: (patch: AgentConfigPatch) => Promise<void>
  applyRecords: (records: AgentRecord[]) => void
}

export type AgentStore = AgentState & AgentActions
