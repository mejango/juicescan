import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';
import { mergeProjectMetadataForm, appendProjectCategoriesAcrossChains, prepareProjectMetadataUpdates } from '../src/discover.js';

const PROJECT = { id: 11, chainId: 8453, idByChain: { 8453: 11, 10: 42 } };
const CHAINS = [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }];
const CONTROLLERS = { 8453: '0x1111111111111111111111111111111111111111', 10: '0x2222222222222222222222222222222222222222' };

describe('project metadata across chains', () => {
  it('applies edited identity fields while preserving peer-specific fields and nested custom values', () => {
    const baseline = { name: 'Old', logoUri: 'ipfs://base-logo', extensions: { season: 1, local: 'base' }, removeMe: 'old', storeCategories: { 1: 'Common' } };
    const peer = { name: 'Peer old', logoUri: 'ipfs://op-logo', extensions: { season: 1, local: 'op', peerOnly: true }, removeMe: 'peer', privateField: 'keep', storeCategories: { 1: 'OP common', 7: 'OP only' } };
    const result = mergeProjectMetadataForm(peer, {
      preloadedMeta: baseline, name: 'Shared name', dirty: { name: true, storeCategories: true },
      baselineStoreCategories: baseline.storeCategories, storeCategories: { 1: 'Renamed' },
      customProperties: { dirty: true, value: { extensions: { season: 2, local: 'base' } } },
    });
    expect(result).toEqual({ name: 'Shared name', logoUri: 'ipfs://op-logo', extensions: { season: 2, local: 'op', peerOnly: true }, privateField: 'keep', storeCategories: { 1: 'Renamed', 7: 'OP only' } });
    expect(peer.name).toBe('Peer old');
  });

  it('allocates new category IDs above every destination while retaining each chain’s metadata', () => {
    const result = appendProjectCategoriesAcrossChains([
      { name: 'Base', storeCategories: { 1: 'Base only' } },
      { name: 'OP', extra: 'retain', storeCategories: { 9: 'OP only' } },
    ], ['Shared', 'More']);
    expect(result.ids).toEqual([10, 11]);
    expect(result.metadata).toEqual([
      { name: 'Base', storeCategories: { 1: 'Base only', 10: 'Shared', 11: 'More' } },
      { name: 'OP', extra: 'retain', storeCategories: { 9: 'OP only', 10: 'Shared', 11: 'More' } },
    ]);
  });

  function dependencies(metadata) {
    return {
      controllerFor: vi.fn(async cid => CONTROLLERS[cid]),
      loadMetadata: vi.fn(async cid => ({ uri: 'ipfs://old-' + cid, meta: metadata[cid] })),
      readUri: vi.fn(async cid => 'ipfs://old-' + cid),
      pinMetadata: vi.fn(async meta => 'ipfs://new-' + (meta.local || 'shared')),
    };
  }

  it('uses destination-local IDs/controllers and distinct URIs when untouched JSON differs', async () => {
    const deps = dependencies({ 8453: { name: 'Old', local: 'base' }, 10: { name: 'Other', local: 'op' } });
    const plan = await prepareProjectMetadataUpdates(PROJECT, CHAINS, metadata => metadata.map(meta => ({ ...meta, name: 'Shared' })), deps);
    expect(deps.pinMetadata).toHaveBeenCalledTimes(2);
    for (const [cid, pid, uri] of [[8453, 11n, 'ipfs://new-base'], [10, 42n, 'ipfs://new-op']]) {
      const call = plan.buildCall(cid);
      expect(call.to).toBe(CONTROLLERS[cid]);
      expect(decodeFunctionData({ abi: call.abi, data: call.data })).toMatchObject({ functionName: 'setUriOf', args: [pid, uri] });
    }
    await expect(plan.reverify()).resolves.toBeUndefined();
    deps.readUri.mockImplementation(async cid => cid === 10 ? 'ipfs://someone-elses-update' : 'ipfs://new-base');
    await expect(plan.reverify()).rejects.toThrow(/metadata changed on Optimism/);
    deps.readUri.mockImplementation(async cid => 'ipfs://old-' + cid);
    deps.controllerFor.mockResolvedValue('0x3333333333333333333333333333333333333333');
    await expect(plan.reverify()).rejects.toThrow(/metadata changed/);
  });

  it('pins identical resulting JSON once, including different source key order', async () => {
    const deps = dependencies({ 8453: { name: 'Same', tag: 1 }, 10: { tag: 1, name: 'Same' } });
    const plan = await prepareProjectMetadataUpdates(PROJECT, CHAINS, metadata => metadata, deps);
    expect(deps.pinMetadata).toHaveBeenCalledTimes(1);
    expect(plan.entries[0].uri).toBe(plan.entries[1].uri);
  });

  it('does not pin or construct a partial update when any destination metadata is unavailable', async () => {
    const deps = dependencies({ 8453: {}, 10: {} });
    deps.loadMetadata.mockImplementation(async cid => cid === 10 ? { error: 'Could not load the current project metadata' } : { uri: '', meta: {} });
    await expect(prepareProjectMetadataUpdates(PROJECT, CHAINS, metadata => metadata, deps)).rejects.toThrow(/Optimism: Could not load/);
    expect(deps.pinMetadata).not.toHaveBeenCalled();
  });
});
