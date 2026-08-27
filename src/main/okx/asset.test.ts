import assert from 'node:assert/strict'

import {
  DEFAULT_OKX_ASSET,
  DEFAULT_TRADE_ASSET,
  OKX_INST_PRESETS,
  asTradeAsset,
  assetFromInstId,
  assetsForVenue,
  clampAssetToVenue,
  isGoldMarketSymbol,
  isOkxTradeAsset,
  isTradeAsset,
  mt5SymbolForAsset,
  okxInstIdForAsset,
  restoreMt5GoldDefault,
  venueSymbol
} from '../../preload/okx-types'

assert.equal(DEFAULT_TRADE_ASSET, 'XAU')
assert.equal(DEFAULT_OKX_ASSET, 'BTC')
assert.equal(isTradeAsset('BTC'), true)
assert.equal(isTradeAsset('ETH'), true)
assert.equal(isTradeAsset('XAU'), true)
assert.equal(isTradeAsset('SOL'), false)
assert.equal(isOkxTradeAsset('BTC'), true)
assert.equal(isOkxTradeAsset('ETH'), true)
assert.equal(isOkxTradeAsset('XAU'), false)
assert.deepEqual([...assetsForVenue('mt5')], ['BTC', 'ETH', 'XAU'])
assert.deepEqual([...assetsForVenue('okx')], ['BTC', 'ETH'])
assert.equal(clampAssetToVenue('okx', 'XAU'), 'BTC')
assert.equal(clampAssetToVenue('okx', 'ETH'), 'ETH')
assert.equal(clampAssetToVenue('mt5', 'XAU'), 'XAU')
assert.equal(okxInstIdForAsset('BTC'), 'BTC-USDT-SWAP')
assert.equal(okxInstIdForAsset('ETH'), 'ETH-USDT-SWAP')
assert.equal(okxInstIdForAsset('XAU'), 'BTC-USDT-SWAP')
assert.equal((OKX_INST_PRESETS as readonly string[]).includes('XAU-USDT-SWAP'), false)
assert.equal(assetFromInstId('ETH-USDT-SWAP'), 'ETH')
assert.equal(assetFromInstId('BTC-USDT-SWAP'), 'BTC')
assert.equal(assetFromInstId('XAU-USDT-SWAP'), 'XAU')
assert.equal(mt5SymbolForAsset('BTC'), 'BTCUSD')
assert.equal(mt5SymbolForAsset('ETH'), 'ETHUSD')
assert.equal(mt5SymbolForAsset('XAU'), 'XAUUSD')
assert.equal(venueSymbol('okx', 'ETH'), 'ETH-USDT-SWAP')
assert.equal(venueSymbol('okx', 'XAU'), 'BTC-USDT-SWAP')
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
