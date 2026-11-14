import { describe, expect, it, vi } from 'vitest';

const pending = [];
vi.mock('../src/component-base.js', () => ({
  discoverChains: (projectId, callback, onAnswer) => { pending.push({ projectId, callback, onAnswer }); },
  firstChainForNetwork: () => null,
}));
vi.mock('../src/chain.js', () => ({ getManifestChains: () => ({ 1: {}, 10: {}, 8453: {}, 11155111: { testnet: true } }) }));

import { projectDiscovery, settledChainChoice } from '../src/project-discovery.js';

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

  it('opens once the chain choice is settled, without waiting for a slower chain behind it', () => {
    pending.length = 0;
    const state = { projectId: '12', phase: 'idle', _defaultChain: null, network: 'mainnet' };
    const chosen = vi.fn(); const ready = vi.fn(); const updateUI = vi.fn();
    projectDiscovery(state, updateUI)(chosen, ready);
    // Base answers first, but Ethereum ranks ahead of it and is still out: nothing is chosen yet.
    pending[0].onAnswer({ 8453: true });
    expect(state.phase).toBe('discovering');
    pending[0].onAnswer({ 8453: true, 1: true });
    expect(chosen).toHaveBeenCalledWith(1);
    expect(ready).toHaveBeenCalledWith(1);
    expect(state.liveChains).toEqual([1, 8453]);
    expect(state.phase).toBe('ready');
    // Optimism answers last: it joins the list, the choice stands and nothing loads twice.
    const draws = updateUI.mock.calls.length;
    pending[0].callback([1, 10, 8453]);
    expect(state.liveChains).toEqual([1, 10, 8453]);
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(updateUI.mock.calls.length).toBe(draws + 1);
  });

  it('settles the choice exactly as the full answer would', () => {
    const ids = [1, 10, 8453, 11155111];
    expect(settledChainChoice(ids, { 10: true }, null, false)).toBeNull(); // Ethereum could still win
    expect(settledChainChoice(ids, { 1: false, 10: true }, null, false)).toBe(10);
    expect(settledChainChoice(ids, { 1: true }, 8453, false)).toBeNull(); // the linked chain is still out
    expect(settledChainChoice(ids, { 1: true, 8453: false }, 8453, false)).toBe(1);
    expect(settledChainChoice(ids, { 1: true, 8453: true }, 8453, false)).toBe(8453);
    expect(settledChainChoice(ids, { 1: true, 10: true, 8453: true }, null, true)).toBeNull(); // the testnet is still out
    expect(settledChainChoice(ids, { 1: true, 10: true, 8453: true, 11155111: false }, null, true)).toBe(1);
    expect(settledChainChoice(ids, { 1: false, 10: false, 8453: false, 11155111: false }, null, false)).toBeNull();
  });
});
