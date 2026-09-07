import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAbi, encodeFunctionData } from 'viem';
import { runSavedActionPlan, hasSavedActionPlan, acknowledgeSavedActionPlan } from '../src/action-plan.js';
import { snapshotKnownSafeProposal, reconcileSelectedSafeResult } from '../src/discover.js';
import { safeTxHashForQueuedTx } from '../src/safe.js';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const SAFE = '0x2222222222222222222222222222222222222222';
const TARGET = '0x3333333333333333333333333333333333333333';
const ABI = parseAbi(['function claimTokensFor(address,uint256,uint256,address)']);
const SCOPE = 'safe-reconciliation-test';
function call(chainId) { const args = [SAFE, BigInt(chainId), 12n, SAFE]; return { chainId, to: TARGET, abi: ABI, functionName: 'claimTokensFor', args, data: encodeFunctionData({ abi: ABI, functionName: 'claimTokensFor', args }) }; }
function proposal(call0) { const tx = { to: call0.to, data: call0.data, value: 0, nonce: 7 }; return snapshotKnownSafeProposal(call0.chainId, SAFE, tx, safeTxHashForQueuedTx(call0.chainId, SAFE, tx), 100n); }
function queued(proposals) { return { relayr: false, expectedCount: proposals.length, queued: proposals.length, immediateExecuted: 0, executedReady: 0, proposals }; }
function options(extra = {}) { return { scope: SCOPE, account: ACCOUNT, executionAccount: SAFE, safeMode: true, prepare: vi.fn(async () => ({ rounds: [[call(1), call(10)]] })), ...extra }; }
beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_k, _o, fn) => fn({}) } }); });

describe('known Safe proposal lifecycle', () => {
  it('marks only the proven destination and never mistakes a pending proposal for execution', async () => {
    const calls = [call(1), call(10)], result = queued(calls.map(proposal));
    const verify = vi.fn(), find = vi.fn(async record => record.chainId === 1 ? { status: 'success', transactionHash: '0xknown' } : null);
    const next = await reconcileSelectedSafeResult(result, calls, SAFE, verify, find);
    expect(next.executedReady).toBe(1); expect(next.proposals.map(p => p.executed)).toEqual([true, false]);
    expect(verify).toHaveBeenCalledOnce(); expect(verify.mock.calls[0][0].chainId).toBe(1);
    expect(result.proposals.map(p => p.executed)).toEqual([false, false]);
  });
  it('keeps caught distribution failures pending despite an exact Safe outer execution', async () => {
    const calls = [call(1)], result = queued(calls.map(proposal));
    await expect(reconcileSelectedSafeResult(result, calls, SAFE, async () => { throw new Error('hook underpulled'); }, async () => ({ status: 'success' }))).rejects.toThrow('hook underpulled');
    expect(result.executedReady).toBe(0);
  });
  it('rejects changed destinations, senders and native value before scanning receipts', async () => {
    for (const mutate of [p => { p.tx.to = SAFE; }, p => { p.tx.value = '1'; }, p => { p.safe = ACCOUNT; }]) {
      const result = queued([proposal(call(1))]); mutate(result.proposals[0]); const find = vi.fn();
      await expect(reconcileSelectedSafeResult(result, [call(1)], SAFE, null, find)).rejects.toThrow('original destination'); expect(find).not.toHaveBeenCalled();
    }
  });
  it('acknowledges later external executions without preparing or proposing another batch', async () => {
    const first = options({ executeRound: async (calls, _i, _p, control) => { const records = calls.map(proposal); records.forEach(record => { control.beforeSafe(); control.recordSafeProposal(record); }); return queued(records); } });
    await runSavedActionPlan(first); acknowledgeSavedActionPlan(SCOPE, ACCOUNT); expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
    const resumed = options({ executeRound: vi.fn(), reconcileResult: (result, calls) => reconcileSelectedSafeResult(result, calls, SAFE, null, async () => ({ status: 'success' })) });
    const result = await runSavedActionPlan(resumed); expect(result.results[0].executedReady).toBe(2);
    expect(resumed.prepare).not.toHaveBeenCalled(); expect(resumed.executeRound).not.toHaveBeenCalled();
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT); expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(false);
  });
  it('persists known proposals immediately and resumes only the remaining unsent chain after reload', async () => {
    const first = options({ executeRound: async (calls, _i, _p, control) => { control.beforeSafe({ fromBlock: '100' }); control.recordSafeProposal(proposal(calls[0])); throw new Error('review closed before next chain'); } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('review closed');
    const resumed = options({ executeRound: vi.fn(async (calls, _i, _p, control) => { expect(calls.map(c => c.chainId)).toEqual([10]); const record = proposal(calls[0]); control.beforeSafe(); control.recordSafeProposal(record); return queued([record]); }) });
    const result = await runSavedActionPlan(resumed); expect(result.results[0].queued).toBe(2); expect(result.results[0].proposals.map(p => p.chainId)).toEqual([1, 10]);
    expect(resumed.prepare).not.toHaveBeenCalled(); expect(resumed.executeRound).toHaveBeenCalledOnce();
  });
  it('does not strand a known full round when the page closes before its round checkpoint', async () => {
    await expect(runSavedActionPlan(options({ executeRound: async (calls, _i, _p, control) => { calls.forEach(c => { control.beforeSafe(); control.recordSafeProposal(proposal(c)); }); throw new Error('page closed'); } }))).rejects.toThrow('page closed');
    const resumed = options({ executeRound: vi.fn(), reconcileResult: (result, calls) => reconcileSelectedSafeResult(result, calls, SAFE, null, async () => ({ status: 'success' })) });
    const result = await runSavedActionPlan(resumed); expect(result.results[0].executedReady).toBe(2); expect(resumed.executeRound).not.toHaveBeenCalled();
  });
  it('keeps an unknown next proposal blocked without replaying an earlier known proposal', async () => {
    await expect(runSavedActionPlan(options({ executeRound: async (calls, _i, _p, control) => { control.beforeSafe(); control.recordSafeProposal(proposal(calls[0])); control.beforeSafe({ fromBlock: '101' }); throw new Error('POST outcome lost'); } }))).rejects.toThrow('POST outcome');
    const resumed = options({ executeRound: vi.fn() }); await expect(runSavedActionPlan(resumed)).rejects.toThrow('may have been submitted'); expect(resumed.executeRound).not.toHaveBeenCalled();
  });
  it('records an onchain approval once and marks its later execution without duplicate destinations', async () => {
    const result = await runSavedActionPlan(options({ prepare: async () => ({ rounds: [[call(1)]] }), executeRound: async (calls, _i, _p, control) => {
      const known = proposal(calls[0]); control.beforeSafe(); control.recordSafeProposal(known);
      control.beforeSafe({ chainId: 1, safeTxHash: known.safeTxHash }); control.recordSafeExecuted(1);
      return { ...queued([known]), executedReady: 1 };
    } }));
    expect(result.results[0]).toMatchObject({ queued: 1, immediateExecuted: 0, executedReady: 1 });
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT); expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(false);
  });
  it('recovers an unknown execution response through the already known proposal hash', async () => {
    await expect(runSavedActionPlan(options({ prepare: async () => ({ rounds: [[call(1)]] }), executeRound: async (calls, _i, _p, control) => {
      const known = proposal(calls[0]); control.beforeSafe(); control.recordSafeProposal(known);
      control.beforeSafe({ chainId: 1, safeTxHash: known.safeTxHash }); throw new Error('execution response lost');
    } }))).rejects.toThrow('execution response lost');
    const resumed = options({ executeRound: vi.fn(), reconcileResult: (result, calls) => reconcileSelectedSafeResult(result, calls, SAFE, null, async () => ({ status: 'success' })) });
    expect((await runSavedActionPlan(resumed)).results[0].executedReady).toBe(1); expect(resumed.executeRound).not.toHaveBeenCalled();
  });
  it('clears a proven unsubmitted attempt while retaining the prior known proposal', async () => {
    await expect(runSavedActionPlan(options({ executeRound: async (calls, _i, _p, control) => {
      control.beforeSafe(); control.recordSafeProposal(proposal(calls[0]));
      control.beforeSafe(); control.safeCancelled(); throw new Error('user rejected');
    } }))).rejects.toThrow('user rejected');
    const resumed = options({ executeRound: async (calls, _i, _p, control) => { expect(calls.map(c => c.chainId)).toEqual([10]); const known = proposal(calls[0]); control.recordSafeProposal(known); return queued([known]); } });
    expect((await runSavedActionPlan(resumed)).results[0].queued).toBe(2);
  });
  it('retains exact SDK hashes without inventing a Safe App nonce', () => {
    const tx = call(1), hash = '0x' + 'ab'.repeat(32);
    expect(snapshotKnownSafeProposal(1, SAFE, tx, hash, 10n, true)).toMatchObject({ hashOnly: true, nonce: null, safeTxHash: hash, fromBlock: '10', tx: { to: TARGET, data: tx.data } });
  });
});
