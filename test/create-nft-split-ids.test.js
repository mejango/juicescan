import { describe, expect, it, vi } from 'vitest';
import { resolveSuckerGroup } from '../src/sucker-group.js';
import { resolveItemSplitProjects, __test } from '../src/create-flow.js';

vi.mock('../src/sucker-group.js', async (importOriginal) => ({ ...(await importOriginal()), resolveSuckerGroup: vi.fn() }));

const { initState, itemDraft, itemSplits } = __test;
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
