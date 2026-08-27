import assert from 'node:assert/strict'

import {
  DEFAULT_TRADE_ASSET,
  asTradeAsset,
  assetFromInstId,
  isGoldMarketSymbol,
  isTradeAsset,
  mt5SymbolForAsset,
  okxInstIdForAsset,
  restoreMt5GoldDefault,
  venueSymbol
} from '../../preload/okx-types'

assert.equal(DEFAULT_TRADE_ASSET, 'XAU')
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
assert.equal(asTradeAsset('SOL'), 'XAU')
assert.equal(isGoldMarketSymbol('XAUUSD.s'), true)
assert.equal(isGoldMarketSymbol('XAU-USDT-SWAP'), true)
assert.equal(isGoldMarketSymbol('BTCUSD'), false)
assert.equal(restoreMt5GoldDefault('mt5', 'BTC', false), 'XAU')
assert.equal(restoreMt5GoldDefault('mt5', 'BTC', true), 'BTC')
assert.equal(restoreMt5GoldDefault('mt5', 'ETH', false), 'ETH')
assert.equal(restoreMt5GoldDefault('okx', 'BTC', false), 'BTC')

console.log('okx/asset.test.ts ok')
