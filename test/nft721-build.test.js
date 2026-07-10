import { describe, it, expect } from 'vitest';
import {
  TIER_UNLIMITED_SUPPLY,
  build721TierConfig,
  sortTierEntriesByCategory,
  tierDiscountPercentFromPct,
} from '../src/nft721-build.js';
import { ZERO_ADDRESS } from '../src/component-base.js';

describe('nft721-build shared tier helpers', () => {
  it('validates supply, converts discounts, and fills derived flags', () => {
    expect(tierDiscountPercentFromPct(20)).toBe(40);
    expect(() => tierDiscountPercentFromPct(150)).toThrow(/between 0 and 100/i);
    expect(() => tierDiscountPercentFromPct(-1)).toThrow(/between 0 and 100/i);

    expect(() => build721TierConfig({
      price: 5n,
      initialSupply: '1000000005',
      votingUnits: 3,
      reserveFrequency: 2,
      reserveBeneficiary: '0x1111111111111111111111111111111111111111',
      discountPercent: 40,
      flags: { allowOwnerMint: true },
    })).toThrow(/supply/i);
    const tier = build721TierConfig({
      price: 5n, initialSupply: '100', votingUnits: 3, reserveFrequency: 2,
      reserveBeneficiary: '0x1111111111111111111111111111111111111111', discountPercent: 40,
      flags: { allowOwnerMint: true },
    });
    expect(tier.initialSupply).toBe(100);
    expect(tier.discountPercent).toBe(40);
    expect(tier.flags.useVotingUnits).toBe(true);
    expect(tier.flags.useReserveBeneficiaryAsDefault).toBe(true);
    expect(() => build721TierConfig({ price: 1n << 104n, initialSupply: 1 })).toThrow(/uint104/i);
    expect(() => build721TierConfig({ price: 1n, initialSupply: 1, reserveFrequency: 1, reserveBeneficiary: 'bad' })).toThrow(/beneficiary/i);

    const unlimited = build721TierConfig({ unlimited: true, reserveFrequency: 0 });
    expect(unlimited.initialSupply).toBe(TIER_UNLIMITED_SUPPLY);
    expect(unlimited.reserveBeneficiary).toBe(ZERO_ADDRESS);
  });

  it('sorts by category while preserving caller order inside a category', () => {
    const entries = [
      { order: 0, tier: { category: 3, initialSupply: 10 } },
      { order: 1, tier: { category: 0, initialSupply: 20 } },
      { order: 2, tier: { category: 3, initialSupply: 30 } },
    ];
    expect(sortTierEntriesByCategory(entries).map((e) => e.tier.initialSupply)).toEqual([20, 10, 30]);
  });
});
