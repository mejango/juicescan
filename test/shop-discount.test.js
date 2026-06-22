// 721 tier discounts: the explorer must display + CHARGE the same discounted price the JB721TiersHookStore
// applies at mint (effective = price - mulDiv(price, discountPercent, 200), DISCOUNT_DENOMINATOR = 200), or
// the buyer is over/under-charged. These are the pure pricing/label helpers behind the shop + pay cards.
import { describe, it, expect } from 'vitest';
import { tierEffectivePrice, tierDiscountLabel, pctOffToDiscountPercent, buildSetDiscountConfig } from '../src/discover.js';

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

describe('pctOffToDiscountPercent — operator % off (0-100) → on-chain discountPercent (0-200)', () => {
  it('0% → 0', () => { expect(pctOffToDiscountPercent(0)).toBe(0); });
  it('20% → 40', () => { expect(pctOffToDiscountPercent(20)).toBe(40); });
  it('50% → 100', () => { expect(pctOffToDiscountPercent(50)).toBe(100); });
  it('100% → 200', () => { expect(pctOffToDiscountPercent(100)).toBe(200); });
  it('clamps above 100', () => { expect(pctOffToDiscountPercent(150)).toBe(200); });
  it('clamps negative', () => { expect(pctOffToDiscountPercent(-5)).toBe(0); });
});

describe('buildSetDiscountConfig — the setDiscountPercentsOf entry + round-trip to effective price', () => {
  it('encodes {tierId, discountPercent}', () => {
    expect(buildSetDiscountConfig(7, 25)).toEqual({ tierId: 7, discountPercent: 50 });
  });
  it('20% off → effective price is 80% of original', () => {
    const cfg = buildSetDiscountConfig(1, 20);
    expect(tierEffectivePrice(1000n, cfg.discountPercent)).toBe(800n);
  });
  it('100% off → free', () => {
    expect(tierEffectivePrice(1000n, buildSetDiscountConfig(1, 100).discountPercent)).toBe(0n);
  });
});
