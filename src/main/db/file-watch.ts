import { existsSync, type FSWatcher, watch } from 'fs'
import { basename, dirname } from 'path'

type Handler = (path: string) => void

const watchers = new Map<string, FSWatcher>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const ignoreUntil = new Map<string, number>()

const DEBOUNCE_MS = 400
const WRITE_IGNORE_MS = 700

export function markWriting(path: string, _active?: boolean): void {
  void _active
  ignoreUntil.set(path, Date.now() + WRITE_IGNORE_MS)
}

function shouldIgnore(path: string): boolean {
  return Date.now() < (ignoreUntil.get(path) ?? 0)
}

export function watchJsonFile(path: string, onChange: Handler): void {
  if (watchers.has(path)) return
  const dir = dirname(path)
  const name = basename(path)
  if (!existsSync(dir)) return
  try {
    const watcher = watch(dir, (_event, filename) => {
      const changed =
        typeof filename === 'string' ? filename : filename != null ? String(filename) : null
      if (changed && changed !== name) return
      if (shouldIgnore(path)) return
      const prev = timers.get(path)
      if (prev) clearTimeout(prev)
      timers.set(
        path,
        setTimeout(() => {
          timers.delete(path)
          if (shouldIgnore(path)) return
          if (!existsSync(path)) return
          onChange(path)
        }, DEBOUNCE_MS)
      )
    })
    watcher.on('error', (error) => {
      console.warn('[db] watch', path, error.message)
    })
    watchers.set(path, watcher)
  } catch (error) {
    console.warn('[db] watch start', path, error instanceof Error ? error.message : error)
  }
}

export function unwatchJsonFile(path: string): void {
  const watcher = watchers.get(path)
  if (watcher) {
    watcher.close()
    watchers.delete(path)
  }
  const timer = timers.get(path)
  if (timer) {
    clearTimeout(timer)
    timers.delete(path)
  }
  ignoreUntil.delete(path)
}

export function unwatchAllJsonFiles(): void {
  for (const path of [...watchers.keys()]) unwatchJsonFile(path)
}
