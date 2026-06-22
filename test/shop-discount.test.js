// 721 tier discounts: the explorer must display + CHARGE the same discounted price the JB721TiersHookStore
// applies at mint (effective = price - mulDiv(price, discountPercent, 200), DISCOUNT_DENOMINATOR = 200), or
// the buyer is over/under-charged. These are the pure pricing/label helpers behind the shop + pay cards.
import { describe, it, expect } from 'vitest';
import { tierEffectivePrice, tierDiscountLabel } from '../src/discover.js';

describe('tierEffectivePrice — mirrors the on-chain mint discount (denominator 200)', () => {
  it('no discount → full price', () => {
    expect(tierEffectivePrice(1000n, 0)).toBe(1000n);
    expect(tierEffectivePrice(1000n, undefined)).toBe(1000n);
  });
  it('discountPercent 100 = 50% off', () => {
    expect(tierEffectivePrice(1000n, 100)).toBe(500n);
  });
  it('discountPercent 40 = 20% off', () => {
    expect(tierEffectivePrice(1000n, 40)).toBe(800n); // 1000 - 1000*40/200
  });
  it('discountPercent 200 = 100% off → free', () => {
    expect(tierEffectivePrice(1000n, 200)).toBe(0n);
  });
  it('floors like the on-chain mulDiv', () => {
    // 7 - floor(7*40/200) = 7 - floor(1.4) = 7 - 1 = 6
    expect(tierEffectivePrice(7n, 40)).toBe(6n);
  });
  it('clamps a discount above 200 to 100% off', () => {
    expect(tierEffectivePrice(1000n, 255)).toBe(0n);
  });
  it('accepts a string/number price', () => {
    expect(tierEffectivePrice('1000', 100)).toBe(500n);
  });
});

describe('tierDiscountLabel — shopper-facing "% off" (discountPercent / 2)', () => {
  it('null when there is no discount', () => {
    expect(tierDiscountLabel({ discountPercent: 0 })).toBeNull();
    expect(tierDiscountLabel({})).toBeNull();
    expect(tierDiscountLabel(null)).toBeNull();
  });
  it('40 → "20% off"', () => { expect(tierDiscountLabel({ discountPercent: 40 })).toBe('20% off'); });
  it('200 → "100% off"', () => { expect(tierDiscountLabel({ discountPercent: 200 })).toBe('100% off'); });
  it('odd percent keeps one decimal', () => { expect(tierDiscountLabel({ discountPercent: 5 })).toBe('2.5% off'); });
});
