import assert from 'node:assert/strict'

import {
  assetFromInstId,
  isTradeAsset,
  mt5SymbolForAsset,
  okxInstIdForAsset,
  venueSymbol
} from '../../preload/okx-types'

assert.equal(isTradeAsset('BTC'), true)
assert.equal(isTradeAsset('ETH'), true)
assert.equal(isTradeAsset('SOL'), false)
assert.equal(okxInstIdForAsset('BTC'), 'BTC-USDT-SWAP')
assert.equal(okxInstIdForAsset('ETH'), 'ETH-USDT-SWAP')
assert.equal(assetFromInstId('ETH-USDT-SWAP'), 'ETH')
assert.equal(assetFromInstId('BTC-USDT-SWAP'), 'BTC')
assert.equal(mt5SymbolForAsset('BTC'), 'BTCUSD')
assert.equal(mt5SymbolForAsset('ETH'), 'ETHUSD')
assert.equal(venueSymbol('okx', 'ETH'), 'ETH-USDT-SWAP')
assert.equal(venueSymbol('mt5', 'BTC'), 'BTCUSD')

console.log('okx/asset.test.ts ok')
