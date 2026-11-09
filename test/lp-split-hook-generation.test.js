import { describe, expect, it } from 'vitest';
import { getABI, getAddress } from '../src/abi-registry.js';
import { lpSplitHookNameFor } from '../src/discover.js';

const arity = (name, fn) => getABI(name, 8453).find(e => e.type === 'function' && e.name === fn).inputs.length;

describe('LP split hook card generation', () => {
  it('reads the instance generation a project splits to, with that generation\'s ABI', () => {
    const project = hook => ({ chainId: 8453, reservedSplits: [{ hook: '0x' + '11'.repeat(20) }, { hook }] });
    expect(lpSplitHookNameFor(project(getAddress('JBP6FeeLPSplitHook', 8453)))).toBe('JBP6FeeLPSplitHook');
    // BAN's reserved split routes to the 1.0.0 instance.
    expect(lpSplitHookNameFor(project('0x22988374AF49507fec1ee78811fbc47d10d5e639'))).toBe('JBP6FeeLPSplitHook_deprecated');
    expect(lpSplitHookNameFor(project(getAddress('JBUniswapV4LPSplitHook', 8453)))).toBe(null);
    expect(lpSplitHookNameFor({ chainId: 8453 })).toBe(null);
    expect([arity('JBP6FeeLPSplitHook', 'deployPool'), arity('JBP6FeeLPSplitHook', 'addLiquidity')]).toEqual([1, 2]);
    expect([arity('JBP6FeeLPSplitHook_deprecated', 'deployPool'), arity('JBP6FeeLPSplitHook_deprecated', 'addLiquidity')]).toEqual([2, 3]);
  });
});
