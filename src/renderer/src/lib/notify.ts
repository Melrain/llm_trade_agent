import { toast } from 'sonner'

/** 场所 / 品种 / 盘口立刻生效时的反馈（总闸会被关掉） */
export function toastAppliedSwitch(label: string): void {
  toast.success(`已切到 ${label}`, { description: '自动交易已关闭' })
}
