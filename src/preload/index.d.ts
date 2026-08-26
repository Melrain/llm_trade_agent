import { ElectronAPI } from '@electron-toolkit/preload'
import type { MarketApi } from './market-types'
import type { Mt5Api } from './mt5-types'
import type { NewsApi } from './news-types'
import type { PmApi } from './pm-types'
import type { AgentApi } from './agent-types'
import type { SnapshotApi } from './snapshot-types'
import type { OkxApi } from './okx-types'

export type {
  Mt5AccountInfo,
  Mt5Api,
  Mt5Deal,
  Mt5Filter,
  Mt5LastError,
  Mt5Order,
  Mt5OrderCheckResult,
  Mt5OrderSendResult,
  Mt5Position,
  Mt5Rate,
  Mt5SymbolInfo,
  Mt5TerminalInfo,
  Mt5Tick,
  Mt5Timeframe,
  Mt5TradeRequest
} from './mt5-types'

export type {
  MarketApi,
  MarketBar,
  MarketLevel,
  MarketLevelId,
  MarketPositionRow,
  MarketSnapshot,
  MarketTimeframeId,
  MarketTimeframePack,
  MarketTrend
} from './market-types'

export type {
  CalendarEvent,
  NewsApi,
  NewsFeedInfo,
  NewsHeadline,
  NewsImpact,
  NewsSnapshot
} from './news-types'

export type {
  PmSpotPrice,
  PmLadderRow,
  PmApi,
  PmHealth,
  PmHealthStatus,
  PmPriceSource,
  PmQuote,
  PmSnapshot
} from './pm-types'

export type {
  DecisionSnapshot,
  SnapshotApi,
  SnapshotCalendarItem,
  SnapshotNewsItem,
  SnapshotPmMarket,
  SnapshotSourceStatus
} from './snapshot-types'

export type {
  OkxApi,
  OkxConnectionTest,
  OkxOrderResult,
  OkxPlaceOrderInput,
  OkxPublicConfig,
  OkxTdMode,
  OkxTradeIntent,
  TradeVenue
} from './okx-types'

export type {
  AgentAction,
  AgentApi,
  AgentConfigPatch,
  AgentDecision,
  AgentExecution,
  AgentOrderCheck,
  AgentOrderSend,
  AgentOutcome,
  AgentPublicConfig,
  AgentRecord,
  AgentRiskVerdict,
  AgentStats
} from './agent-types'

export type LlaMarketApi = {
  mt5: Mt5Api
  okx: OkxApi
  pm: PmApi
  market: MarketApi
  news: NewsApi
  snapshot: SnapshotApi
  agent: AgentApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: LlaMarketApi
  }
}
