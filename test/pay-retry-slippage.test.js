import { describe, expect, it } from 'vitest';
import { payRetrySlippageBps } from '../src/slippage.js';

describe('payRetrySlippageBps', () => {
  it('adds the shortfall to the tolerance, rounded up to a half percent', () => {
    expect(payRetrySlippageBps({ reason: 'TERMINAL_UNDER_MIN', received: 880n, minimum: 900n }, 100)).toBe(350);
    expect(payRetrySlippageBps({ reason: 'BUYBACK_SLIPPAGE_EXCEEDED', received: 999n, minimum: 1000n }, 100)).toBe(150);
  });
  it('adds one percent when the amounts are unknown, and stays under the limit', () => {
    expect(payRetrySlippageBps({ reason: 'TERMINAL_UNDER_MIN' }, 100)).toBe(200);
    expect(payRetrySlippageBps({ reason: 'TERMINAL_UNDER_MIN', received: 1n, minimum: 1000n }, 100)).toBe(4950);
  });
  it('offers nothing when a lower minimum is not the fix', () => {
    expect(payRetrySlippageBps(null, 100)).toBeNull();
    expect(payRetrySlippageBps({ reason: 'BUYBACK_DERIVED_FLOOR_NOT_MET', received: 1n, minimum: 2n }, 100)).toBeNull();
    expect(payRetrySlippageBps({ reason: 'ROUTER_SLIPPAGE_EXCEEDED', received: 1n, minimum: 2n }, 100)).toBeNull();
  });
});
