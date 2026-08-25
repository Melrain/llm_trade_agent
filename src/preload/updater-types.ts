export type UpdaterState =
  'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error' | 'dev'

export type UpdaterStatus = {
  state: UpdaterState
  currentVersion: string
  availableVersion: string | null
  releaseNotes: string | null
  percent: number | null
  error: string | null
}

export type UpdaterApi = {
  getStatus: () => Promise<UpdaterStatus>
  check: () => Promise<UpdaterStatus>
  downloadAndInstall: () => Promise<UpdaterStatus>
  onStatus: (callback: (status: UpdaterStatus) => void) => () => void
}
