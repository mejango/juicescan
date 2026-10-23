import { describe, expect, it, vi } from 'vitest';
import { resolveSuckerGroup } from '../src/sucker-group.js';
import { resolveItemSplitProjects, __test } from '../src/create-flow.js';

vi.mock('../src/sucker-group.js', async (importOriginal) => ({ ...(await importOriginal()), resolveSuckerGroup: vi.fn() }));

const { initState, itemDraft, itemSplits, verifyLegacyItemSplitIds } = __test;
const BASE = 8453, OP = 10;

function stateWithProjectSplit() {
  const state = initState();
  state.chainIds = [BASE, OP];
  const item = itemDraft();
  item.price = '1';
  item.splitOn = true;
  item.splitRecipients = [{ pct: '10', recip: '12', benef: '' }];
  state.shopEnabled = true;
  state.nfts = [item];
  return state;
}

describe('item sale splits use each chain’s own recipient project ID', () => {
  it('routes the Optimism split to the project the sucker registry names there', async () => {
    resolveSuckerGroup.mockResolvedValueOnce([{ chainId: BASE, projectId: 12n }, { chainId: OP, projectId: 47n }]);
    const state = stateWithProjectSplit();
    await resolveItemSplitProjects(state);
    expect(resolveSuckerGroup).toHaveBeenLastCalledWith(expect.any(Function), BASE, 12n);
    expect(itemSplits(state.nfts[0], state, BASE, 0).splits[0].projectId).toBe(12n);
    expect(itemSplits(state.nfts[0], state, OP, 0).splits[0].projectId).toBe(47n);
  });

  it('fails closed on a chain where the recipient cannot be verified', async () => {
    resolveSuckerGroup.mockRejectedValueOnce(new Error('rpc down'));
    const state = stateWithProjectSplit();
    await resolveItemSplitProjects(state);
    expect(itemSplits(state.nfts[0], state, BASE, 0).splits[0].projectId).toBe(12n);
    expect(() => itemSplits(state.nfts[0], state, OP, 0)).toThrow('Could not verify project #12 on Optimism.');
  });

  it('never copies the entered ID to another chain without a resolution', () => {
    const state = stateWithProjectSplit();
    expect(() => itemSplits(state.nfts[0], state, OP, 0)).toThrow('Could not verify project #12 on Optimism.');
  });
});

describe('reference chain and saved launches', () => {
  it('uses the caller’s first selected chain as the reference', async () => {
    resolveSuckerGroup.mockResolvedValueOnce([{ chainId: OP, projectId: 12n }, { chainId: BASE, projectId: 30n }]);
    const state = stateWithProjectSplit();
    await resolveItemSplitProjects(state, OP);
    expect(resolveSuckerGroup).toHaveBeenLastCalledWith(expect.any(Function), OP, 12n);
    expect(itemSplits(state.nfts[0], state, OP, 0).splits[0].projectId).toBe(12n);
    expect(itemSplits(state.nfts[0], state, BASE, 0).splits[0].projectId).toBe(30n);
  });

  it('refuses a result whose reference chain changed while it was read', async () => {
    let resolve;
    resolveSuckerGroup.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const state = stateWithProjectSplit();
    const pending = resolveItemSplitProjects(state);
    state.chainIds = [OP];
    resolve([{ chainId: BASE, projectId: 12n }, { chainId: OP, projectId: 47n }]);
    await expect(pending).rejects.toThrow('The selected chains changed');
    expect(state._itemSplitIds).toBeUndefined();
  });

  const legacy = (pid) => ({ plans: [
    { chainId: BASE, args: [{ tiersConfig: { tiers: [{ splits: [{ projectId: 12n }] }] } }] },
    { chainId: OP, args: [{ tiersConfig: { tiers: [{ splits: [{ projectId: pid }] }] } }] },
  ] });

  it('continues a legacy saved launch only where the registry confirms the copied ID', async () => {
    resolveSuckerGroup.mockResolvedValueOnce([{ chainId: BASE, projectId: 12n }, { chainId: OP, projectId: 12n }]);
    const session = legacy(12n);
    await expect(verifyLegacyItemSplitIds(session, session.plans)).resolves.toBeUndefined();
    resolveSuckerGroup.mockResolvedValueOnce([{ chainId: BASE, projectId: 12n }, { chainId: OP, projectId: 47n }]);
    await expect(verifyLegacyItemSplitIds(session, session.plans)).rejects.toThrow('Could not verify project #12 on Optimism.');
    resolveSuckerGroup.mockRejectedValueOnce(new Error('rpc down'));
    await expect(verifyLegacyItemSplitIds(session, session.plans)).rejects.toThrow('Could not verify project #12 on Optimism.');
  });
});
