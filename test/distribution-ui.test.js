import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ saved: false, prepared: null, reads: [], simulations: [] }));
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';

vi.mock('../src/component-base.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAccount: () => '0x1111111111111111111111111111111111111111',
    getEffectiveAccount: () => '0x1111111111111111111111111111111111111111',
    getViewAs: () => null,
    isSafeConnected: () => false,
    createPublicClientForChain: cid => ({
      readContract: async request => {
        runtime.reads.push({ cid, ...request });
        const token = cid === 8453 ? '0x2222222222222222222222222222222222222222' : '0x3333333333333333333333333333333333333333';
        if (request.functionName === 'accountingContextsOf') return [{ token, decimals: cid === 8453 ? 6 : 18, currency: cid === 8453 ? 123n : 456n }];
        if (request.functionName === 'symbol') return cid === 8453 ? 'SIX' : 'EIGHTEEN';
        if (request.functionName === 'name') return 'Test accounting token';
        if (request.functionName === 'controllerOf') return token;
        if (request.functionName === 'currentRulesetOf') return [{ id: 77n, cycleNumber: 1n }, {}];
        if (request.functionName === 'balanceOf') return 100000000000000000000n;
        if (request.functionName === 'payoutLimitsOf') return [{ currency: cid === 8453 ? 123n : 456n, amount: 100000000000000000000n }, { currency: 2n, amount: 100000000000000000000n }];
        if (request.functionName === 'usedPayoutLimitOf') return 0n;
        if (request.functionName === 'pricePerUnitOf') return 1000000000000000000n;
        if (request.functionName === 'pendingReservedTokenBalanceOf') return cid === 8453 ? 100n : 200n;
        if (request.functionName === 'TOKENS') return '0x4444444444444444444444444444444444444444';
        throw new Error('Unexpected read: ' + request.functionName);
      },
      simulateContract: async request => {
        runtime.simulations.push({ cid, ...request });
        return { result: request.args[2] * 2n };
      },
    }),
  };
});

// Keep the actual selected-call adapter and preparation. Stop at its saved-plan boundary so tests
// inspect the reviewed destinations without publishing signatures or opening a wallet prompt.
vi.mock('../src/action-plan.js', () => ({
  hasSavedActionPlan: () => runtime.saved,
  acknowledgeSavedActionPlan: () => { runtime.saved = false; },
  runSavedActionPlan: async options => {
    if (runtime.saved) return { completed: true, resumed: true, rounds: 1, results: [{ relayr: true, session: { expectedCount: 2, records: [] } }] };
    runtime.prepared = await options.prepare();
    return { cancelled: true };
  },
}));

import { openDistributionAcrossChains } from '../src/discover.js';

const project = { id: 12, chainId: 8453, idByChain: { 8453: 12, 10: 99 }, tokenSymbol: 'TEST',
  chains: [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }] };
const submit = () => Array.from(document.querySelectorAll('button')).find(button => /on selected chains|Resume distribution/.test(button.textContent));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  runtime.saved = false; runtime.prepared = null; runtime.reads = []; runtime.simulations = [];
});

describe('aggregate distribution controls', () => {
  it('collects independent chain currencies and amounts into correct local calls', async () => {
    openDistributionAcrossChains(project, 'payouts');
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Payout amount on Base"]').disabled).toBe(false));
    document.querySelector('[aria-label="Payout amount on Base"]').value = '1.25';
    document.querySelector('[aria-label="Payout amount on Optimism"]').value = '2.5';
    document.querySelector('[aria-label="Payout currency on Optimism"]').value = '2';
    submit().click();
    await vi.waitFor(() => expect(runtime.prepared).not.toBeNull());
    const calls = runtime.prepared.rounds[0];
    expect(calls.map(call => call.chainId)).toEqual([8453, 10]);
    expect(calls[0].args).toEqual([12n, B, 1250000n, 123n, 2500000n]);
    expect(calls[1].args).toEqual([99n, C, 2500000000000000000n, 2n, 4950000000000000000n]);
    expect(runtime.simulations.every(sim => sim.account === A)).toBe(true);
    expect(calls[0].validation).toMatchObject({ projectId: '12', currency: '123', amount: '1250000' });
  });

  it('omits deselected reserved destinations and uses the selected local controller', async () => {
    openDistributionAcrossChains(project, 'reserved');
    const choices = document.querySelectorAll('.operator-chain-addresses input[type="checkbox"]');
    choices[0].checked = false; choices[0].dispatchEvent(new Event('change'));
    submit().click();
    await vi.waitFor(() => expect(runtime.prepared).not.toBeNull());
    expect(runtime.prepared.rounds[0]).toHaveLength(1);
    expect(runtime.prepared.rounds[0][0]).toMatchObject({ chainId: 10, to: C, args: [99n],
      validation: { sender: A, tokens: '0x4444444444444444444444444444444444444444' } });
  });

  it('resumes a saved payout action without reading changed balances or requiring new amounts', async () => {
    runtime.saved = true;
    openDistributionAcrossChains(project, 'payouts');
    expect(submit().textContent).toBe('Resume distribution');
    expect(runtime.reads).toEqual([]);
    submit().click();
    await vi.waitFor(() => expect(runtime.saved).toBe(false));
    expect(runtime.prepared).toBeNull();
    expect(runtime.reads).toEqual([]);
    expect(document.body.textContent).toContain('previously paid Relayr request is confirmed');
  });
});
