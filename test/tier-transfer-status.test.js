import { describe, expect, it } from 'vitest';
import { tierTransferStatus } from '../src/discover.js';

describe('item transfer status', () => {
  it('says transfers are always allowed when the tier cannot be paused', () => {
    expect(tierTransferStatus({ transfersPaused: true, transfersPausedChainId: 8453 }, { flags: {} })).toBe('Always allowed');
  });

  it('reports the current ruleset state for pausable tiers', () => {
    const tier = { flags: { transfersPausable: true } };
    expect(tierTransferStatus({ transfersPaused: true, transfersPausedChainId: 8453 }, tier)).toBe('Paused by the current ruleset on Base');
    expect(tierTransferStatus({ transfersPaused: false }, tier)).toBe('Allowed by the current ruleset');
    expect(tierTransferStatus({ transfersPaused: null }, tier)).toBe('Current ruleset unavailable');
  });
});
