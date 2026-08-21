import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

type BridgeResponse = {
  id: string | null
  ok: boolean
  data?: unknown
  error?: string
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const WIN32_ONLY = '仅 Windows 支持'
const MISSING_RUNTIME = '未找到嵌入式 Python 运行时'
const MT5_NOT_READY = '未检测到 MT5 终端。请打开并登录 MetaTrader 5，并允许算法交易。'

const RESPAWN_BASE_MS = 5_000
const RESPAWN_MAX_MS = 60_000

export class Mt5Client {
  private child: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private readonly pending = new Map<string, Pending>()
  private retriedPy = false
  private lastError: Error | null = null
  private stopped = false
  private respawnTimer: NodeJS.Timeout | null = null
  private respawnAttempts = 0

  start(): void {
    if (process.platform !== 'win32') {
      return
    }
    this.stopped = false
    if (this.child) {
      return
    }
    this.lastError = null
    this.retriedPy = false

    if (app.isPackaged) {
      const pythonExe = join(process.resourcesPath, 'python', 'python.exe')
      if (!existsSync(pythonExe)) {
        this.lastError = new Error(MISSING_RUNTIME)
        console.error('[mt5-bridge]', MISSING_RUNTIME, pythonExe)
        return
      }
      this.attach(this.spawnWith(pythonExe, ['-u', this.scriptPath()]), false)
      return
    }

    this.attach(this.spawnWith('python', ['-u', this.scriptPath()]), true)
  }

  stop(): void {
    this.stopped = true
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer)
      this.respawnTimer = null
    }
    if (!this.child) {
      this.rejectAll(new Error('mt5-bridge stopped'))
      return
    }
    this.child.kill()
    this.child = null
  }

  request(action: string, payload?: unknown): Promise<unknown> {
    if (process.platform !== 'win32') {
      return Promise.reject(new Error(WIN32_ONLY))
    }
    if (this.lastError && !this.child) {
      return Promise.reject(this.lastError)
    }
    if (!this.child) {
      return Promise.reject(new Error(MT5_NOT_READY))
    }
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child!.stdin.write(JSON.stringify({ id, action, payload }) + '\n')
    })
  }

  private scriptPath(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'mt5-bridge', 'bridge.py')
    }
    const fromApp = join(app.getAppPath(), 'resources', 'mt5-bridge', 'bridge.py')
    if (existsSync(fromApp)) {
      return fromApp
    }
    return join(__dirname, '../../resources/mt5-bridge/bridge.py')
  }

  private spawnWith(command: string, args: string[]): ChildProcessWithoutNullStreams {
    return spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
  }

  private attach(child: ChildProcessWithoutNullStreams, allowPyFallback: boolean): void {
    this.child = child
    this.buf = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      console.error('[mt5-bridge]', chunk.trimEnd())
    })

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (allowPyFallback && error.code === 'ENOENT' && !this.retriedPy) {
        this.retriedPy = true
        this.child = null
        this.attach(this.spawnWith('py', ['-3', '-u', this.scriptPath()]), false)
        return
      }
      this.child = null
      const permanent = error.code === 'ENOENT'
      this.rejectAll(permanent ? new Error(MISSING_RUNTIME) : error)
      // 找不到 Python 属于环境问题，重试无意义；其余启动失败照常重连
      if (!permanent) {
        this.scheduleRespawn('桥接进程启动失败')
      }
    })

    child.once('exit', (code, signal) => {
      if (this.child !== child) {
        return
      }
      this.child = null
      // MT5 终端未开/崩溃/被重启都会走到这里，挂机场景必须自愈
      this.scheduleRespawn(`桥接进程退出（${code ?? signal ?? 'unknown'}）`)
      if (this.lastError) {
        return
      }
      const hint = code === 1 ? MT5_NOT_READY : `mt5-bridge exited: ${code ?? signal ?? 'unknown'}`
      this.rejectAll(new Error(hint))
    })
  }

  private scheduleRespawn(reason: string): void {
    if (this.stopped || this.respawnTimer || this.child) {
      return
    }
    const delay = Math.min(RESPAWN_BASE_MS * 2 ** this.respawnAttempts, RESPAWN_MAX_MS)
    this.respawnAttempts += 1
    console.warn(
      `[mt5-bridge] ${reason}，${Math.round(delay / 1000)}s 后自动重连（第 ${this.respawnAttempts} 次）`
    )
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = null
      if (this.stopped || this.child) {
        return
      }
      this.start()
    }, delay)
  }

  private onStdout(chunk: string): void {
    this.buf += chunk
    const lines = this.buf.split('\n')
    this.buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) {
        continue
      }
      let msg: BridgeResponse
      try {
        msg = JSON.parse(line) as BridgeResponse
      } catch {
        console.error('[mt5-bridge] invalid stdout', line)
        continue
      }
      if (!msg.id) {
        if (!msg.ok) {
          this.rejectAll(new Error(msg.error ?? MT5_NOT_READY))
        }
        continue
      }
      const waiter = this.pending.get(msg.id)
      if (!waiter) {
        continue
      }
      this.pending.delete(msg.id)
      if (msg.ok) {
        // 一次成功的请求往返说明桥已恢复，重置重连退避
        if (this.respawnAttempts > 0) {
          console.log('[mt5-bridge] 桥接已恢复')
          this.respawnAttempts = 0
        }
        this.lastError = null
        waiter.resolve(msg.data)
      } else {
        waiter.reject(new Error(msg.error ?? 'mt5-bridge error'))
      }
    }
  }

  private rejectAll(error: Error): void {
    this.lastError = error
    for (const [id, waiter] of this.pending) {
      waiter.reject(error)
      this.pending.delete(id)
    }
  }
}
