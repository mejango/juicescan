import { describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ prepareUserPay: vi.fn() }));
vi.mock('@bananapus/nana-sdk-core/v6', async importOriginal => ({ ...await importOriginal(), prepareUserPay: h.prepareUserPay }));
import { createHookMetadata } from '@bananapus/nana-sdk-core';
import { buildUserPayMetadata } from '@bananapus/nana-sdk-core/v6';
import { addToHookMetadata } from '../src/discover.js';
import { prepareCardPay } from '../src/pay-preview.js';

const terminal = '0x1111111111111111111111111111111111111111';
const token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe('pay card payment preparation', () => {
  it('sends prepareUserPay its tiers and slippage, and keeps its metadata and minimum', async () => {
    h.prepareUserPay.mockResolvedValueOnce({
      metadata: '0xabcd',
      preview: { beneficiaryTokenCount: 990n, reservedTokenCount: 0n },
      minReturnedTokens: 980n,
    });
    const prepared = await prepareCardPay({
      chainId: 8453, terminal, projectId: 6n, token, amount: 25_000_000n, beneficiary: undefined,
      shop: { hook: '0x2222222222222222222222222222222222222222', idTarget: '0x3333333333333333333333333333333333333333' },
      tierIds: [4, 4], slippageBps: 100,
    });
    const args = h.prepareUserPay.mock.lastCall[1];
    expect(args).toMatchObject({ chainId: 8453, terminal, projectId: 6n, token, amount: 25_000_000n, slippageBps: 100n });
    expect(args.beneficiary).toBe('0x000000000000000000000000000000000000dEaD');
    expect(args.tiers).toEqual({ metadataIdTarget: '0x3333333333333333333333333333333333333333', tierIdsToMint: [4n, 4n], allowOverspending: true });
    expect(prepared).toEqual({ received: 990n, reserved: 0n, minReturnedTokens: 980n, metadata: '0xabcd' });
  });

  it('reads a reverting preview as unavailable and sends no tiers for a plain payment', async () => {
    h.prepareUserPay.mockRejectedValueOnce(new Error('JBPrices_PriceFeedNotFound'));
    const prepared = await prepareCardPay({ chainId: 8453, terminal, projectId: 6n, token, amount: 1n, beneficiary: terminal, shop: null, tierIds: [], slippageBps: 100 });
    expect(h.prepareUserPay.mock.lastCall[1].tiers).toBeUndefined();
    expect(prepared.unavailable).toBe(true);
    expect(prepared.received).toBeNull();
    expect(prepared.metadata).toBeUndefined();
  });

  it('adds the router Permit2 allowance next to the buyback quote and 721 tiers', () => {
    const tiers = { metadataIdTarget: '0x3333333333333333333333333333333333333333', tierIdsToMint: [1n] };
    const base = buildUserPayMetadata({ chainId: 8453, tiers, minimumSwapAmountOut: 5n });
    const permit = '0x' + '11'.repeat(32) + '22'.repeat(40);
    const id = '0xdeadbeef';
    const ids = ['0x' + base.slice(66, 74), '0x' + base.slice(76, 84)];
    const both = addToHookMetadata(base, id, permit);
    expect(addToHookMetadata(createHookMetadata(ids, ['0x01', '0x02']), id, permit)).toBe(createHookMetadata(ids.concat(id), ['0x01', '0x02', permit]));
    expect(addToHookMetadata('0x', id, permit)).toBe(createHookMetadata([id], [permit]));
    // The original entries survive byte for byte.
    expect(both.includes(base.slice(2 + 64 * 2))).toBe(true);
  });
});
