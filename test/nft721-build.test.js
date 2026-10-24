import { describe, it, expect } from 'vitest';
import {
  TIER_UNLIMITED_SUPPLY,
  assertNewTierPolicy,
  build721TierConfig,
  build721TierMetadata,
  mediaTypeForFile,
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
      price: 5n, initialSupply: '100', votingUnits: 0, reserveFrequency: 2,
      reserveBeneficiary: '0x1111111111111111111111111111111111111111', discountPercent: 40,
      flags: { allowOwnerMint: true },
    });
    expect(tier.initialSupply).toBe(100);
    expect(tier.discountPercent).toBe(40);
    expect(tier.flags.useVotingUnits).toBe(false);
    expect(tier.flags.useReserveBeneficiaryAsDefault).toBe(true);
    expect(() => build721TierConfig({ price: 1n << 104n, initialSupply: 1 })).toThrow(/uint104/i);
    expect(() => build721TierConfig({ price: 1n, initialSupply: 1, reserveFrequency: 1, reserveBeneficiary: 'bad' })).toThrow(/beneficiary/i);

    const unlimited = build721TierConfig({ unlimited: true, reserveFrequency: 0 });
    expect(unlimited.initialSupply).toBe(TIER_UNLIMITED_SUPPLY);
    expect(unlimited.reserveBeneficiary).toBe(ZERO_ADDRESS);
  });

  it.each([0, 7, '42', 'legacy invalid'])('always compiles price-based voting for legacy custom input %s', votingUnits => {
    const tier = build721TierConfig({ price: 123n, initialSupply: 2, votingUnits, flags: { useVotingUnits: true } });
    expect(tier).toMatchObject({ votingUnits: 0, flags: { useVotingUnits: false } });
  });

  it('refuses saved unsigned custom-vote or reserved-one tier data without changing its bytes', () => {
    const tier = { price: 3n, initialSupply: 2, reserveFrequency: 0, flags: { useVotingUnits: true } };
    expect(() => assertNewTierPolicy([{ tiersConfig: { tiers: [tier] } }])).toThrow(/Rebuild and review/);
    expect(tier.flags.useVotingUnits).toBe(true);
    expect(() => assertNewTierPolicy([{ ...tier, initialSupply: 1, reserveFrequency: 1, flags: { useVotingUnits: false } }])).toThrow(/supply of at least 2/);
    expect(() => assertNewTierPolicy([null, 0, { ...tier, flags: { useVotingUnits: false } }])).not.toThrow();
  });

  it('rejects deadlocked reserved supply through the shared compiler', () => {
    const reserved = { price: 1n, initialSupply: 1, reserveFrequency: 1, reserveBeneficiary: '0x1111111111111111111111111111111111111111' };
    expect(() => build721TierConfig(reserved)).toThrow(/supply of at least 2/i);
    expect(build721TierConfig({ ...reserved, initialSupply: 2 }).initialSupply).toBe(2);
    expect(build721TierConfig({ ...reserved, unlimited: true }).initialSupply).toBe(TIER_UNLIMITED_SUPPLY);
    expect(build721TierConfig({ ...reserved, reserveFrequency: 0 }).initialSupply).toBe(1);
  });

  it('sorts by category while preserving caller order inside a category', () => {
    const entries = [
      { order: 0, tier: { category: 3, initialSupply: 10 } },
      { order: 1, tier: { category: 0, initialSupply: 20 } },
      { order: 2, tier: { category: 3, initialSupply: 30 } },
    ];
    expect(sortTierEntriesByCategory(entries).map((e) => e.tier.initialSupply)).toEqual([20, 10, 30]);
  });

  it('keeps video attachments in animation_url metadata and images in image', () => {
    expect(build721TierMetadata({
      name: 'Mission', categoryName: 'Collectables', mediaUri: 'ipfs://video', mediaType: 'video/mp4',
    })).toEqual({
      name: 'Mission', categoryName: 'Collectables', mediaType: 'video/mp4', animation_url: 'ipfs://video',
    });
    expect(build721TierMetadata({
      name: 'Poster', mediaUri: 'ipfs://image', mediaType: 'image/png',
    })).toEqual({ name: 'Poster', mediaType: 'image/png', image: 'ipfs://image' });
  });

  it('infers media MIME from filenames when the browser leaves File.type empty', () => {
    expect(mediaTypeForFile({ name: 'theme.MP3', type: '' })).toBe('audio/mpeg');
    expect(mediaTypeForFile({ name: 'trailer.webm', type: '' })).toBe('video/webm');
    expect(mediaTypeForFile({ name: 'field-recording.flac', type: 'application/octet-stream' })).toBe('audio/flac');
    expect(mediaTypeForFile({ name: 'cover.png', type: 'image/custom; charset=binary' })).toBe('image/custom');
  });
});
