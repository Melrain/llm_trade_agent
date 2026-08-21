import { useEffect, type JSX } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import {
  useAppStore,
  useAgentStore,
  useMarketStore,
  useNewsStore,
  usePmStore,
  useSnapshotStore
} from '@/stores'

const App = (): JSX.Element => {
  const initialize = useAppStore((s) => s.initialize)
  const initializePm = usePmStore((s) => s.initialize)
  const initializeMarket = useMarketStore((s) => s.initialize)
  const initializeNews = useNewsStore((s) => s.initialize)
  const initializeSnapshot = useSnapshotStore((s) => s.initialize)
  const initializeAgent = useAgentStore((s) => s.initialize)

  useEffect(() => {
    initialize()
    void initializePm()
    void initializeMarket()
    void initializeNews()
    void initializeSnapshot()
    void initializeAgent()
  }, [
    initialize,
    initializePm,
    initializeMarket,
    initializeNews,
    initializeSnapshot,
    initializeAgent
  ])

  return <AppShell />
}

export default App
