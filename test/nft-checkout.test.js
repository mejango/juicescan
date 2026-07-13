import { describe, expect, it } from 'vitest';
import {
  nftCreditBreakdown,
  nftPaymentAmountFromPricing,
  nftPricingValueFromPayment,
} from '../src/discover.js';

describe('NFT shop credits', () => {
  it('applies credits to eligible item cost and exposes the fresh amount due', () => {
    expect(nftCreditBreakdown(100n, 0n, 35n)).toEqual({
      subtotal: 100n, restrictedCost: 0n, eligibleCost: 100n, credits: 35n, applied: 35n, due: 65n,
    });
  });

  it('never applies credits to tiers which require fresh payment', () => {
    expect(nftCreditBreakdown(100n, 40n, 90n)).toEqual({
      subtotal: 100n, restrictedCost: 40n, eligibleCost: 60n, credits: 90n, applied: 60n, due: 40n,
    });
  });

  it('allows credits to cover every eligible item', () => {
    expect(nftCreditBreakdown(100n, 0n, 150n).due).toBe(0n);
  });
});

describe('NFT cross-currency checkout conversion', () => {
  it('converts the shop total to a payment amount and rounds up', () => {
    // A 0.10 USD item (18-decimal shop pricing), with ETH worth 2,000 USD:
    // one USD costs 0.0005 ETH, expressed at 18 payment decimals.
    const usdItem = 100000000000000000n;
    const ethPerUsd = 500000000000000n;
    expect(nftPaymentAmountFromPricing(usdItem, 18, ethPerUsd)).toBe(50000000000000n);

    // A fractional raw payment unit rounds up instead of silently underfunding the mint.
    expect(nftPaymentAmountFromPricing(1n, 1, 3n)).toBe(1n);
  });

  it('shows the entered payment in the NFT pricing currency using contract rounding', () => {
    const ethPerUsd = 500000000000000n;
    expect(nftPricingValueFromPayment(50000000000000n, 18, ethPerUsd)).toBe(100000000000000000n);
    expect(nftPricingValueFromPayment(25000000000000n, 18, ethPerUsd)).toBe(50000000000000000n);
  });

  it('fails closed on a missing or zero price', () => {
    expect(nftPaymentAmountFromPricing(1n, 18, 0n)).toBeNull();
    expect(nftPricingValueFromPayment(1n, 18, 0n)).toBeNull();
  });
});
