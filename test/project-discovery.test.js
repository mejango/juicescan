import { describe, expect, it, vi } from 'vitest';

const pending = [];
vi.mock('../src/component-base.js', () => ({
  discoverChains: (projectId, callback) => { pending.push({ projectId, callback }); },
  firstChainForNetwork: () => null,
}));

import { projectDiscovery } from '../src/project-discovery.js';

describe('tool form project discovery', () => {
  it('a lookup started before the project id was cleared never lands', () => {
    const state = { projectId: '12', phase: 'idle', _defaultChain: null };
    const updateUI = vi.fn();
    const chosen = vi.fn();
    const discover = projectDiscovery(state, updateUI);

    discover(chosen);
    expect(state.phase).toBe('discovering');
    state.projectId = '';
    discover(chosen);
    expect(state.phase).toBe('idle');

    pending[0].callback([1, 8453]);
    expect(chosen).not.toHaveBeenCalled();
    expect(state.phase).toBe('idle');
    expect(state.liveChains).toBeUndefined();
  });

  it('only the latest lookup chooses the chain', () => {
    pending.length = 0;
    const state = { projectId: '12', phase: 'idle', _defaultChain: 8453 };
    const chosen = vi.fn();
    const discover = projectDiscovery(state, vi.fn());
    discover(chosen);
    state.projectId = '13';
    discover(chosen);
    pending[0].callback([1]);
    expect(chosen).not.toHaveBeenCalled();
    pending[1].callback([1, 8453]);
    expect(chosen).toHaveBeenCalledWith(8453);
    expect(state.phase).toBe('ready');
    expect(state._defaultChain).toBeNull();
  });
});
