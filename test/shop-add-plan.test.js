import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';
const state = vi.hoisted(() => ({ prepared: null, saved: false, reads: [], decimals: { 8453: 18, 10: 18 } }));
const A = '0x1111111111111111111111111111111111111111';
const HOOKS = { 8453: '0x2222222222222222222222222222222222222222', 10: '0x3333333333333333333333333333333333333333' };
vi.mock('../src/component-base.js', async original => ({ ...await original(), getAccount: () => '0x1111111111111111111111111111111111111111', getViewAs: () => null, isSafeConnected: () => false,
  createPublicClientForChain: cid => ({ readContract: async r => {
    state.reads.push([cid, r.functionName]);
    if (r.functionName === 'tiered721HookOf') return cid === 8453 ? '0x2222222222222222222222222222222222222222' : '0x3333333333333333333333333333333333333333';
    if (r.functionName === 'owner') return '0x1111111111111111111111111111111111111111';
    if (r.functionName === 'STORE') return '0x4444444444444444444444444444444444444444';
    if (r.functionName === 'pricingContext') return { currency: 1, decimals: state.decimals[cid] };
    throw new Error('Unexpected read ' + r.functionName);
  } }),
}));
vi.mock('../src/ipfs-pin.js', async original => ({ ...await original(), hasPinata: () => true,
  pinJson: vi.fn(async () => 'ipfs://QmYwAPJzv5CZsnAzt8auVZRnGiULpZfw3xrYbWyR3kzLQx'), pinFile: vi.fn() }));
vi.mock('../src/action-plan.js', () => ({ hasSavedActionPlan: () => state.saved, acknowledgeSavedActionPlan: vi.fn(),
  runSavedActionPlan: async options => {
    if (state.saved) return { completed: true, resumed: true, rounds: 1, results: [{ relayr: true, session: { expectedCount: 2, records: [] } }] };
    state.prepared = await options.prepare(); return { cancelled: true };
  } }));
import { submitAddTiers } from '../src/discover.js';
import { pinJson, pinFile } from '../src/ipfs-pin.js';
const project = { id: 11, chainId: 8453, isRevnet: true, operator: A, idByChain: { 8453: 11, 10: 42 } };
const chains = [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }];
const form = { name: 'One item', price: '1.5', priceDecimals: 18, supply: '20', category: 0, flags: {}, splitOn: false };
beforeEach(() => { localStorage.clear(); state.prepared = null; state.saved = false; state.reads = []; state.decimals = { 8453: 18, 10: 18 }; vi.clearAllMocks(); });
describe('shop additions through frozen selected action plans', () => {
  it('pins each item once and preserves all items in one adjustTiers call per destination', async () => {
    await submitAddTiers(project, chains, A, [form, { ...form, name: 'Second item' }], vi.fn(), { pendingScope: 'shop-add-test' });
    expect(pinJson).toHaveBeenCalledTimes(2); expect(pinFile).not.toHaveBeenCalled();
    const calls = state.prepared.rounds[0]; expect(calls).toHaveLength(2);
    calls.forEach(call => {
      expect(call.to).toBe(HOOKS[call.chainId]);
      const decoded = decodeFunctionData({ abi: call.abi, data: call.data });
      expect(decoded.functionName).toBe('adjustTiers'); expect(decoded.args[0]).toHaveLength(2); expect(decoded.args[1]).toEqual([]);
      expect(decoded.args[0][0]).toMatchObject({ price: 1500000000000000000n, initialSupply: 20 });
      expect(call.shopAddValidation.projectId).toBe(BigInt(project.idByChain[call.chainId]));
    });
  });
  it('blocks mixed pricing before uploading any metadata', async () => {
    state.decimals[10] = 6;
    await expect(submitAddTiers(project, chains, A, [form], vi.fn(), { pendingScope: 'shop-add-test' })).rejects.toThrow('pricing differs');
    expect(pinJson).not.toHaveBeenCalled();
  });
  it('resumes saved additions without requiring files or reading changed shops', async () => {
    state.saved = true;
    await expect(submitAddTiers(project, [], A, [], vi.fn(), { pendingScope: 'shop-add-test' })).resolves.toMatchObject({ resumed: true, expectedCount: 2 });
    expect(pinJson).not.toHaveBeenCalled(); expect(state.reads).toEqual([]); expect(state.prepared).toBeNull();
  });
});
