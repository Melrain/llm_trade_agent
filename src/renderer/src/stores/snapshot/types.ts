import type { DecisionSnapshot } from '../../../../preload/snapshot-types'

export type SnapshotState = {
  current: DecisionSnapshot | null
  byId: Record<string, DecisionSnapshot>
  loading: boolean
}

export type SnapshotActions = {
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  applySnapshot: (snapshot: DecisionSnapshot) => void
  loadById: (snapshotId: string) => Promise<DecisionSnapshot | null>
}

export type SnapshotStore = SnapshotState & SnapshotActions
