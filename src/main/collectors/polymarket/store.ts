import { insertPmPrice, pmChange24h } from '../../db/pm-prices'

export class PmPriceStore {
  load(): void {
    /* sqlite 按查询读取，启动时无需预加载 */
  }

  append(tokenId: string, midpoint: number, ts = Date.now()): void {
    try {
      insertPmPrice(tokenId, midpoint, ts)
    } catch (error) {
      console.warn('[pm] price store write', error instanceof Error ? error.message : error)
    }
  }

  change24h(tokenId: string, current: number, now = Date.now()): number | null {
    try {
      return pmChange24h(tokenId, current, now)
    } catch (error) {
      console.warn('[pm] price store read', error instanceof Error ? error.message : error)
      return null
    }
  }
}
