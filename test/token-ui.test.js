import { describe, expect, it } from 'vitest';
import { tokenUiCapabilities } from '../src/discover.js';

describe('token UI capabilities', () => {
  it('keeps internal-credit cash-out available before an ERC-20 is deployed', () => {
    expect(tokenUiCapabilities({ tokenAddress: null })).toEqual({
      hasErc20: false,
      canCashOut: true,
      canAddMarketLiquidity: false,
      showMarket: false,
    });
  });

  it('treats the zero address as no deployed ERC-20', () => {
    expect(tokenUiCapabilities({ tokenAddress: '0x0000000000000000000000000000000000000000' })).toMatchObject({
      hasErc20: false,
      canCashOut: true,
      canAddMarketLiquidity: false,
    });
  });

  it('enables ERC-20 market actions only after deployment', () => {
    expect(tokenUiCapabilities({ tokenAddress: '0x1111111111111111111111111111111111111111' })).toEqual({
      hasErc20: true,
      canCashOut: true,
      canAddMarketLiquidity: true,
      showMarket: true,
    });
  });
});
