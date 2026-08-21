import { Notification } from 'electron'

const lastShownAt = new Map<string, number>()

/** dedupeMs > 0 时同 key 在窗口内只弹一次（用于熔断这类每轮都会触发的原因） */
export function notify(key: string, title: string, body: string, dedupeMs = 0): void {
  const now = Date.now()
  if (dedupeMs > 0) {
    const prev = lastShownAt.get(key) ?? 0
    if (now - prev < dedupeMs) return
  }
  lastShownAt.set(key, now)
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  } catch {
    /* 通知失败不影响主流程 */
  }
}
