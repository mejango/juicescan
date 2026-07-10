import { afterEach, describe, expect, it } from 'vitest';
import { getBendystrawNetwork } from '../src/bendystraw-client.js';
import { setDiscoverNetwork } from '../src/discover.js';

describe('Discover/Data network synchronization', () => {
  afterEach(() => {
    setDiscoverNetwork('mainnet');
    localStorage.setItem('jb-network', 'mainnet');
  });

  it('switches the Discover chain universe and Bendystraw host as one state change', () => {
    setDiscoverNetwork('testnet');
    expect(getBendystrawNetwork()).toBe('testnet');
    expect(localStorage.getItem('jb-network')).toBe('testnet');

    setDiscoverNetwork('mainnet');
    expect(getBendystrawNetwork()).toBe('mainnet');
    expect(localStorage.getItem('jb-network')).toBe('mainnet');
  });
});
