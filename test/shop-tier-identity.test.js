import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeFunctionResult } from 'viem';
import { getABI } from '../src/abi-registry.js';
import { assertShopTierIdentity, assertShopTierMutationFresh, readBoundedShopTier } from '../src/discover.js';

const HOOK = '0x1111111111111111111111111111111111111111';
const STORE = '0x2222222222222222222222222222222222222222';
const ZERO = '0x0000000000000000000000000000000000000000';
const ABI = getABI('JB721TiersHookStore');
const CHAINS = [{ id: 1, name: 'Ethereum' }, { id: 10, name: 'Optimism' }];
function tier(overrides = {}) {
  return {
    id: 7, price: 1000n, remainingSupply: 8, initialSupply: 10, votingUnits: 0n,
    reserveFrequency: 0, reserveBeneficiary: ZERO, encodedIpfsUri: `0x${'ab'.repeat(32)}`,
    category: 1, discountPercent: 20, splitPercent: 0, resolvedUri: '',
    flags: { allowOwnerMint: false, transfersPausable: false, cantBeRemoved: false,
      cantIncreaseDiscountPercent: false, cantBuyWithCredits: false },
    ...overrides,
  };
}
function resolved(destination = tier()) {
  return { hooks: { 1: HOOK, 10: HOOK }, stores: { 1: STORE, 10: STORE },
    tiers: { 1: tier(), 10: destination }, pricing: { 1: { currency: 1, decimals: 18 }, 10: { currency: 1, decimals: 18 } } };
}

describe('live shop tier semantic identity', () => {
  it('allows matching items despite different local mint counts and discounts', () => {
    expect(() => assertShopTierIdentity(tier(), 1, CHAINS, resolved(tier({ remainingSupply: 1, discountPercent: 90 }))))
      .not.toThrow();
  });

  it.each([
    ['content URI', { encodedIpfsUri: `0x${'cd'.repeat(32)}` }],
    ['resolver output', { resolvedUri: 'ipfs://a-different-product' }],
    ['price', { price: 2000n }],
    ['supply limit', { initialSupply: 100 }],
    ['voting units', { votingUnits: 1000n }],
    ['category', { category: 2 }],
    ['reserve beneficiary', { reserveFrequency: 5, reserveBeneficiary: HOOK }],
    ['split percentage', { splitPercent: 1 }],
    ['tier flags', { flags: { ...tier().flags, allowOwnerMint: true } }],
  ])('blocks an unrelated same-ID tier with different %s', (_label, change) => {
    expect(() => assertShopTierIdentity(tier(), 1, CHAINS, resolved(tier(change))))
      .toThrow(/different content or terms on Optimism.*Choose one chain/);
  });

  it.each([{ currency: 2, decimals: 18 }, { currency: 1, decimals: 6 }])('binds the numeric tier price to its exact pricing context %j', pricing => {
    const live = resolved(); live.pricing[10] = pricing;
    expect(() => assertShopTierIdentity(tier(), 1, CHAINS, live)).toThrow(/different content or terms/);
  });

  it('compares the displayed source item with its live content before permitting a local mutation', () => {
    const displayed = { ...tier(), initial: 10 }; delete displayed.initialSupply;
    expect(() => assertShopTierIdentity(displayed, 1, [CHAINS[0]], resolved())).not.toThrow();
    const changed = resolved(); changed.tiers[1] = tier({ encodedIpfsUri: `0x${'ef'.repeat(32)}` });
    expect(() => assertShopTierIdentity(displayed, 1, [CHAINS[0]], changed)).toThrow(/displayed chain changed/);
  });

  it('allows the chosen local item when another chain has a different item at the same ID', () => {
    expect(() => assertShopTierIdentity(tier(), 1, [CHAINS[0]], resolved(tier({ price: 5000n }))))
      .not.toThrow();
  });

  it('requires content evidence for a multichain item whose encoded URI is empty', () => {
    const empty = tier({ encodedIpfsUri: `0x${'00'.repeat(32)}` });
    const live = resolved(empty); live.tiers[1] = empty;
    expect(() => assertShopTierIdentity(empty, 1, CHAINS, live)).toThrow(/no verifiable shared content identity/);
    live.tiers[1] = { ...empty, resolvedUri: 'data:application/json,shared-product' };
    live.tiers[10] = { ...empty, resolvedUri: 'data:application/json,shared-product' };
    expect(() => assertShopTierIdentity(empty, 1, CHAINS, live)).not.toThrow();
  });

  it('rechecks the reviewed hook, store, and resolver output before mutation', () => {
    const reviewed = resolved();
    const movedHook = resolved(); movedHook.hooks[10] = STORE;
    const movedStore = resolved(); movedStore.stores[10] = HOOK;
    const changedResolver = resolved(tier({ resolvedUri: 'new-metadata' }));
    for (const fresh of [movedHook, movedStore, changedResolver]) {
      expect(() => assertShopTierMutationFresh(CHAINS, reviewed, fresh, 40)).toThrow(/reviewed item identity changed/);
    }
  });

  it('rechecks discount caps against the latest local discount while tolerating mint progress', () => {
    const capped = tier({ flags: { ...tier().flags, cantIncreaseDiscountPercent: true } });
    const reviewed = resolved(capped); reviewed.tiers[1] = capped;
    const fresh = resolved({ ...capped, discountPercent: 10, remainingSupply: 1 }); fresh.tiers[1] = capped;
    expect(() => assertShopTierMutationFresh(CHAINS, reviewed, fresh, 20)).toThrow(/no longer allowed on Optimism/);
    expect(() => assertShopTierMutationFresh(CHAINS, reviewed, fresh, 10)).not.toThrow();
  });

  it('can recheck only the remaining direct destination after an earlier chain removed its item', () => {
    const reviewed = resolved(), fresh = resolved();
    delete fresh.tiers[1];
    expect(() => assertShopTierMutationFresh([CHAINS[1]], reviewed, fresh, null)).not.toThrow();
  });
});

describe('bounded live shop identity read', () => {
  it('reads exactly one live tier with a gas cap and bounded resolver output', async () => {
    const live = tier({ resolvedUri: 'ipfs://same-product' });
    const request = vi.fn().mockResolvedValue(encodeFunctionResult({ abi: ABI, functionName: 'tiersOf', result: [live] }));
    await expect(readBoundedShopTier({ request }, STORE, HOOK, 7, true)).resolves.toMatchObject(live);
    const call = request.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'eth_call', params: [{ to: STORE, gas: '0x7a120' }, 'latest'] });
    expect(decodeFunctionData({ abi: ABI, data: call.params[0].data })).toMatchObject({
      functionName: 'tiersOf', args: [HOOK, [], true, 7n, 1n],
    });
  });

  it('rejects oversized metadata before decoding the RPC result', async () => {
    const request = vi.fn().mockResolvedValue('0x' + '00'.repeat(32769));
    await expect(readBoundedShopTier({ request }, STORE, HOOK, 7, true)).rejects.toThrow(/too large/);
  });

  it.each([[], [tier({ id: 8 })], [tier(), tier({ id: 8 })]].map(rows => [rows]))('rejects a missing, replaced, or extra tier response', async rows => {
    const request = vi.fn().mockResolvedValue(encodeFunctionResult({ abi: ABI, functionName: 'tiersOf', result: rows }));
    await expect(readBoundedShopTier({ request }, STORE, HOOK, 7, true)).rejects.toThrow(/not live/);
  });
});
