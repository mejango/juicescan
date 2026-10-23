import { describe, expect, it, vi } from 'vitest';
import { resolveSuckerGroup, idMapFromGroup } from '../src/sucker-group.js';
import { attachProjectChainIds, pidOn, resolveSplitsEditByChain } from '../src/discover.js';

vi.mock('../src/sucker-group.js', async (importOriginal) => ({ ...(await importOriginal()), resolveSuckerGroup: vi.fn() }));

const ZERO = '0x0000000000000000000000000000000000000000';
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const BASE = { id: 8453, name: 'Base' };
const OP = { id: 10, name: 'Optimism' };
const split = (overrides = {}) => ({
  percent: 500000000, projectId: 12n, beneficiary: ALICE,
  preferAddToBalance: false, lockedUntil: 123456, hook: ZERO, ...overrides,
});
const chainValue = (fn) => Object.assign(fn, { _chainValue: true });

describe('split edits preserve recipient project identity across chains', () => {
  it('routes a Base recipient to its different Optimism project ID and retains each chain’s addresses', async () => {
    const original = split({
      beneficiary: chainValue(cid => cid === BASE.id ? ALICE : BOB),
      hook: chainValue(cid => cid === BASE.id ? ZERO : ALICE),
    });
    const resolveProject = vi.fn().mockResolvedValue({ byChain: { 8453: 12, 10: 47 } });
    const result = await resolveSplitsEditByChain([original], [BASE, OP], BASE.id, resolveProject);

    expect(resolveProject).toHaveBeenCalledWith(12, BASE.id);
    expect(result[BASE.id]).toEqual([split()]);
    expect(result[OP.id]).toEqual([split({ projectId: 47n, beneficiary: BOB, hook: ALICE })]);
    expect(original.projectId).toBe(12n);
    expect(typeof original.beneficiary).toBe('function');
  });

  it('uses the edited chain as the reference even when only a different destination is selected', async () => {
    const resolveProject = vi.fn().mockResolvedValue({ byChain: { 10: 12, 8453: 81 } });
    const result = await resolveSplitsEditByChain([split({ preferAddToBalance: true })], [BASE], OP.id, resolveProject);
    expect(resolveProject).toHaveBeenCalledWith(12, OP.id);
    expect(result[BASE.id][0]).toEqual(split({ projectId: 81n, preferAddToBalance: true }));
  });

  it('refuses an unverified destination instead of copying the source numeric ID', async () => {
    const resolveProject = vi.fn().mockResolvedValue({ byChain: { 8453: 12 } });
    await expect(resolveSplitsEditByChain([split()], [BASE, OP], BASE.id, resolveProject))
      .rejects.toThrow(/recipient project #12 on Optimism/);
  });

  it('refuses ambiguous sucker-group membership and incorrect source identity', async () => {
    const byChain = idMapFromGroup([
      { chainId: BASE.id, projectId: 12n },
      { chainId: OP.id, projectId: 47n },
      { chainId: OP.id, projectId: 48n },
    ]);
    await expect(resolveSplitsEditByChain([split()], [BASE, OP], BASE.id, async () => ({ byChain })))
      .rejects.toThrow(/recipient project #12 on Optimism/);
    await expect(resolveSplitsEditByChain([split()], [BASE, OP], BASE.id, async () => ({ byChain: { 8453: 99, 10: 47 } })))
      .rejects.toThrow(/recipient project #12 on Base/);
  });

  it('rejects indexer failures and IDs whose numeric mapping would lose precision', async () => {
    await expect(resolveSplitsEditByChain([split()], [BASE, OP], BASE.id, async () => null))
      .rejects.toThrow(/Could not verify recipient project/);
    await expect(resolveSplitsEditByChain([split()], [BASE, OP], BASE.id, async () => ({ byChain: { 8453: 12, 10: 2 ** 53 } })))
      .rejects.toThrow(/recipient project #12 on Optimism/);
    await expect(resolveSplitsEditByChain([split({ projectId: 9007199254740993n })], [BASE, OP], BASE.id, vi.fn()))
      .rejects.toThrow(/Could not verify recipient project/);
  });

  it('keeps source-chain-only edits independent of indexer availability', async () => {
    const resolveProject = vi.fn();
    const original = split({ projectId: 9007199254740993n });
    const result = await resolveSplitsEditByChain([original], [BASE], BASE.id, resolveProject);
    expect(result[BASE.id]).toEqual([original]);
    expect(resolveProject).not.toHaveBeenCalled();
  });

  it('preserves wallet splits and empty-group clears without any project lookup', async () => {
    const resolveProject = vi.fn();
    const result = await resolveSplitsEditByChain([split({ projectId: 0n })], [BASE, OP], BASE.id, resolveProject);
    expect(result[BASE.id]).toEqual([split({ projectId: 0n })]);
    expect(result[OP.id]).toEqual([split({ projectId: 0n })]);
    expect(await resolveSplitsEditByChain([], [BASE, OP], BASE.id, resolveProject)).toEqual({ 8453: [], 10: [] });
    expect(resolveProject).not.toHaveBeenCalled();
  });
});

describe('project chain IDs come from the sucker registry, never the indexer', () => {
  // The grid's Bendystraw grouping says Optimism holds project 9; the registry onchain says 7.
  const seeded = () => ({
    id: 5, chainId: 1,
    chains: [{ id: 1, name: 'Ethereum', projectId: 5 }, { id: OP.id, name: 'Optimism', projectId: 9 }],
  });

  it('indexer peer differs from registry: registry wins', async () => {
    resolveSuckerGroup.mockResolvedValueOnce([{ chainId: 1, projectId: 5n }, { chainId: OP.id, projectId: 7n }]);
    const project = await attachProjectChainIds(seeded());
    expect(resolveSuckerGroup).toHaveBeenLastCalledWith(expect.any(Function), 1, 5n);
    expect(pidOn(project, OP.id)).toBe(7n);
    expect(project.chains).toEqual([{ id: 1, name: 'Ethereum', projectId: 5 }, { id: OP.id, name: 'Optimism', projectId: 7 }]);
    expect(project.chainsUnverified).toBe(false);
  });

  it('registry read fails: home only, no throw on display', async () => {
    resolveSuckerGroup.mockRejectedValueOnce(new Error('rpc down'));
    const project = await attachProjectChainIds(seeded());
    expect(project.idByChain).toEqual({ 1: 5 });
    expect(project.chainsUnverified).toBe(true);
    expect(project.chains).toEqual([{ id: 1, name: 'Ethereum', projectId: 5 }]);
    expect(() => pidOn(project, OP.id)).toThrow(/Could not verify this project.s ID on Optimism\./);
  });

  it('display seed renders before chain resolution', async () => {
    let resolve;
    resolveSuckerGroup.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const project = seeded();
    const done = attachProjectChainIds(project);
    expect(project.chains.map((c) => c.id)).toEqual([1, OP.id]);
    expect(project.idByChain).toEqual({ 1: 5 });
    expect(() => pidOn(project, OP.id)).toThrow(/Could not verify/);
    resolve([{ chainId: 1, projectId: 5n }, { chainId: OP.id, projectId: 7n }]);
    await done;
    expect(project.idByChain).toEqual({ 1: 5, 10: 7 });
  });
});
