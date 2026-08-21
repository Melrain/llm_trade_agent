import type { JSX } from 'react'
import { Bot, CandlestickChart, History, LayoutDashboard, Newspaper, Settings } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAppStore, type AppPage } from '@/stores'

const ITEMS: Array<{ id: AppPage; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: '驾驶舱', icon: LayoutDashboard },
  { id: 'chart', label: '图表', icon: CandlestickChart },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'intel', label: '情报', icon: Newspaper },
  { id: 'review', label: '复盘', icon: History }
]

export function NavRail(): JSX.Element {
  const activePage = useAppStore((s) => s.activePage)
  const setActivePage = useAppStore((s) => s.setActivePage)

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center border-r border-border bg-sidebar py-2">
      <div className="flex flex-1 flex-col items-center gap-1">
        {ITEMS.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={activePage === item.id}
            onClick={() => setActivePage(item.id)}
          />
        ))}
      </div>
      <NavButton
        label="设置"
        icon={Settings}
        active={activePage === 'settings'}
        onClick={() => setActivePage('settings')}
      />
    </nav>
  )
}

function NavButton({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: typeof LayoutDashboard
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-muted-foreground hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground'
      )}
    >
      <Icon className="size-4" />
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  )
}
