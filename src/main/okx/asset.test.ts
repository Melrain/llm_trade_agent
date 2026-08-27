import assert from 'node:assert/strict'

import {
  asTradeAsset,
  assetFromInstId,
  isGoldMarketSymbol,
  isTradeAsset,
  mt5SymbolForAsset,
  okxInstIdForAsset,
  venueSymbol
} from '../../preload/okx-types'

assert.equal(isTradeAsset('BTC'), true)
assert.equal(isTradeAsset('ETH'), true)
assert.equal(isTradeAsset('XAU'), true)
assert.equal(isTradeAsset('SOL'), false)
assert.equal(okxInstIdForAsset('BTC'), 'BTC-USDT-SWAP')
assert.equal(okxInstIdForAsset('ETH'), 'ETH-USDT-SWAP')
assert.equal(okxInstIdForAsset('XAU'), 'XAU-USDT-SWAP')
assert.equal(assetFromInstId('ETH-USDT-SWAP'), 'ETH')
assert.equal(assetFromInstId('BTC-USDT-SWAP'), 'BTC')
assert.equal(assetFromInstId('XAU-USDT-SWAP'), 'XAU')
assert.equal(mt5SymbolForAsset('BTC'), 'BTCUSD')
assert.equal(mt5SymbolForAsset('ETH'), 'ETHUSD')
assert.equal(mt5SymbolForAsset('XAU'), 'XAUUSD')
assert.equal(venueSymbol('okx', 'ETH'), 'ETH-USDT-SWAP')
assert.equal(venueSymbol('okx', 'XAU'), 'XAU-USDT-SWAP')
assert.equal(venueSymbol('mt5', 'BTC'), 'BTCUSD')
assert.equal(venueSymbol('mt5', 'XAU'), 'XAUUSD')
assert.equal(asTradeAsset('XAU'), 'XAU')
assert.equal(asTradeAsset('SOL'), 'BTC')
assert.equal(isGoldMarketSymbol('XAUUSD.s'), true)
assert.equal(isGoldMarketSymbol('XAU-USDT-SWAP'), true)
assert.equal(isGoldMarketSymbol('BTCUSD'), false)

console.log('okx/asset.test.ts ok')
