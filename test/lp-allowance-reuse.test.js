import { describe, expect, it } from 'vitest';
import { encodeFunctionData } from 'viem';
import { lpClampToAllowances, lpErc20ApprovePrefix } from '../src/discover.js';

// Fresh max carries 1% headroom over the exact need; a prior visit approved yesterday's max exactly.
const NEED = 1000n;
const MAX = 1010n;

describe('LP allowance reuse (multisig return visits)', () => {
  it('clamps down to an existing ERC20 allowance that covers the exact need', () => {
    const r = lpClampToAllowances(MAX, NEED, 1005n, null);
    expect(r.max).toBe(1005n);
    expect(r.approved).toBe(true);
    expect(r.permitReady).toBe(false);
  });

  it('re-asks when the existing allowance no longer covers the need', () => {
    const r = lpClampToAllowances(MAX, NEED, 999n, null);
    expect(r.max).toBe(MAX);
    expect(r.approved).toBe(false);
  });

  it('keeps the full headroom when the allowance already exceeds it', () => {
    const r = lpClampToAllowances(MAX, NEED, 5000n, 5000n);
    expect(r.max).toBe(MAX);
    expect(r.approved).toBe(true);
    expect(r.permitReady).toBe(true);
  });

  it('clamps to the smaller of both allowances so neither layer re-asks', () => {
    const r = lpClampToAllowances(MAX, NEED, 1008n, 1002n);
    expect(r.max).toBe(1002n);
    expect(r.approved).toBe(true);
    expect(r.permitReady).toBe(true);
  });

  it('ignores an expired/absent Permit2 allowance (passed as null)', () => {
    const r = lpClampToAllowances(MAX, NEED, 1008n, null);
    expect(r.max).toBe(1008n);
    expect(r.permitReady).toBe(false);
  });

  it('builds the exact calldata prefix a queued Safe ERC20 approve starts with', () => {
    const spender = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // Permit2
    const data = encodeFunctionData({
      abi: [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [spender, 123n],
    });
    expect(data.toLowerCase().startsWith(lpErc20ApprovePrefix(spender))).toBe(true);
  });
});
