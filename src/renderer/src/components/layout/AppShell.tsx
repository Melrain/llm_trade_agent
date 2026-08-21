import { useEffect, useRef, type JSX } from 'react'
import { toast } from 'sonner'

import { AgentPage } from '@/pages/AgentPage'
import { ChartPage } from '@/pages/ChartPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { IntelPage } from '@/pages/IntelPage'
import { ReviewPage } from '@/pages/ReviewPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { kindLabel, recordKind } from '@/lib/record-status'
import { useAgentStore, useAppStore, useMarketStore, useNewsStore, usePmStore } from '@/stores'

import { NavRail } from './NavRail'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'

export function AppShell(): JSX.Element {
  const page = useAppStore((s) => s.activePage)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <NavRail />
          <main className="min-w-0 flex-1 overflow-hidden">
            {page === 'dashboard' && <DashboardPage />}
            {page === 'chart' && <ChartPage />}
            {page === 'agent' && <AgentPage />}
            {page === 'intel' && <IntelPage />}
            {page === 'review' && <ReviewPage />}
            {page === 'settings' && <SettingsPage />}
          </main>
        </div>
        <StatusBar />
        <Toaster position="bottom-right" />
        <AgentToasts />
        <SourceToasts />
      </div>
    </TooltipProvider>
  )
}

function AgentToasts(): null {
  const records = useAgentStore((s) => s.records)
  const seen = useRef<string | null>(null)

  useEffect(() => {
    const newest = records[0]
    if (!newest) return
    if (seen.current == null) {
      seen.current = newest.id
      return
    }
    if (newest.id === seen.current) return
    seen.current = newest.id
    const kind = recordKind(newest)
    const title = kindLabel(kind)
    const desc = newest.riskReason ?? newest.decision?.reasoning?.slice(0, 80)
    if (kind === 'sent') toast.success(title, { description: desc })
    else if (kind === 'reject') toast.error(title, { description: desc })
    else if (kind === 'parseError') toast.warning(title, { description: newest.parseError ?? desc })
  }, [records])

  return null
}

function SourceToasts(): null {
  const marketError = useMarketStore((s) => s.lastError)
  const newsError = useNewsStore((s) => s.lastError)
  const pmError = usePmStore((s) => s.health.lastError)
  const seen = useRef({
    market: null as string | null,
    news: null as string | null,
    pm: null as string | null
  })

  useEffect(() => {
    if (marketError && marketError !== seen.current.market) {
      seen.current.market = marketError
      toast.error('行情故障', { description: marketError })
    }
    if (!marketError) seen.current.market = null
  }, [marketError])

  useEffect(() => {
    if (newsError && newsError !== seen.current.news) {
      seen.current.news = newsError
      toast.error('新闻/日历故障', { description: newsError })
    }
    if (!newsError) seen.current.news = null
  }, [newsError])

  useEffect(() => {
    if (pmError && pmError !== seen.current.pm) {
      seen.current.pm = pmError
      toast.error('Polymarket 故障', { description: pmError })
    }
    if (!pmError) seen.current.pm = null
  }, [pmError])

  return null
}
