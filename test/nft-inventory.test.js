import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@bananapus/nana-sdk-core/v6', () => ({ getProjectNftInventory: vi.fn() }));
import { getProjectNftInventory } from '@bananapus/nana-sdk-core/v6';
import { readProjectNftInventory, requireGenericInventory, renderNativeInventory, isNativeInventory, nativeMarketUrl } from '../src/nft-inventory.js';
const args = { chainId: 8453, projectId: 27n };
const native = { protocol: 'defifa', hook: '0x123', blockNumber: 123n, phase: 1, pricing: { currency: 61166, decimals: 18 }, tiers: [{ id: 1, name: 'Rekt', price: 1000000000000n, currentSupply: 3n }], capabilities: { genericPay: false, genericCashOut: false, manageTiers: false }, nextStartingId: null };
beforeEach(() => getProjectNftInventory.mockReset());
describe('shared protocol inventory adoption', () => {
  it('returns absent inventory without pretending transport failures mean absence', async () => {
    getProjectNftInventory.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('RPC unavailable'));
    expect(await readProjectNftInventory({}, args)).toBeNull();
    await expect(readProjectNftInventory({}, args)).rejects.toThrow('RPC unavailable');
  });
  it('retains native names, exact supply/pricing and fixed-block nonnumeric store cursors', async () => {
    getProjectNftInventory.mockResolvedValueOnce({ ...native, nextStartingId: 5n }).mockResolvedValueOnce({ ...native, tiers: [{ id: 5, name: 'Moon', currentSupply: 97n }], nextStartingId: 2n }).mockResolvedValueOnce({ ...native, tiers: [{ id: 2, name: 'FUD' }] });
    const inventory = await readProjectNftInventory({}, args);
    expect(inventory.tiers.map(t => t.id)).toEqual([1, 5, 2]);
    expect(getProjectNftInventory.mock.calls[2][1]).toEqual({ ...args, startingId: 2n, blockNumber: 123n });
    expect(inventory.pricing.decimals).toBe(18);
  });
  it('rejects a changed family, duplicate tier or cyclic store page', async () => {
    for (const page of [{ ...native, protocol: 'jb721' }, native, { ...native, tiers: [], nextStartingId: 5n }]) {
      getProjectNftInventory.mockResolvedValueOnce({ ...native, nextStartingId: 5n }).mockResolvedValueOnce(page);
      await expect(readProjectNftInventory({}, args)).rejects.toThrow(/identity|duplicate|cursor/);
    }
  });
  it.each(['genericPay', 'genericCashOut', 'manageTiers'])('blocks native %s before writer execution', async capability => {
    getProjectNftInventory.mockResolvedValueOnce(native);
    await expect(requireGenericInventory({}, args, capability)).rejects.toThrow('https://metalog.money/markets/8453/27');
  });
  it('retains ordinary JB721 transaction context and allows its compatible calldata', async () => {
    const shop = { ...native, protocol: 'jb721', metadataIdTarget: '0xabc', capabilities: { genericPay: true, genericCashOut: true, manageTiers: true } };
    getProjectNftInventory.mockResolvedValue(shop);
    expect(await readProjectNftInventory({}, args)).toEqual(shop);
    expect(await requireGenericInventory({}, args, 'genericPay')).toEqual(shop);
    expect(isNativeInventory(shop)).toBe(false);
  });
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/metadata'])('rejects unsafe native metadata URL %s', metadataUrl => {
    const output = renderNativeInventory(native, 8453, 27n, () => '0.000001 ETH', metadataUrl);
    expect(output.querySelectorAll('a')).toHaveLength(1);
  });
  it('keeps explicit revnet-only writer paths unchanged', async () => {
    expect(await requireGenericInventory({}, { ...args, isRevnet: true }, 'genericPay')).toBeNull();
    expect(getProjectNftInventory).not.toHaveBeenCalled();
  });
  it('renders onchain names/supplies as read-only text with native lifecycle link', () => {
    const output = renderNativeInventory({ ...native, tiers: [{ ...native.tiers[0], name: '<img onerror=alert(1)>' }] }, 8453, 27n, () => '0.000001 ETH');
    expect(output.querySelector('a').href).toBe(nativeMarketUrl(8453, 27n));
    expect(output.textContent).toContain('Current NFTs');
    expect(output.textContent).toContain('0.000001 ETH');
    expect(output.textContent).toContain('<img onerror=alert(1)>');
    expect(output.querySelector('img,button,input')).toBeNull();
    expect(output.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
