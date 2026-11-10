import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAbi, encodeFunctionData } from 'viem';
import { runSavedActionPlan, acknowledgeSavedActionPlan, hasSavedActionPlan } from '../src/action-plan.js';
import { normalizeSelectedSafeResult } from '../src/discover.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const SAFE = '0x2222222222222222222222222222222222222222';
const ABI = parseAbi(['function claimTokensFor(address holder, uint256 projectId, uint256 tokenCount, address beneficiary)']);
const SCOPE = 'action:8453:11:claim-credits';
const KEY = 'jb-selected-action-v1:' + ACCOUNT + ':' + SCOPE;
function call(chainId, count = 12n) {
  const args = [ACCOUNT, BigInt(chainId), count, ACCOUNT];
  return { chainId, to: SAFE, abi: ABI, functionName: 'claimTokensFor', args,
    data: encodeFunctionData({ abi: ABI, functionName: 'claimTokensFor', args }), expectedState: { token: SAFE } };
}
function options(overrides = {}) {
  return { scope: SCOPE, account: ACCOUNT,
    prepare: vi.fn(async () => ({ rounds: [[call(8453), call(10)], [call(8453, 5n)]] })),
    executeRound: vi.fn(async (_calls, _index, _plan, control) => { await control.checkpoint({ confirmed: true }); return { confirmed: true }; }), ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
});

describe('durable selected action rounds', () => {
  it('retains every allocation and skips verified rounds after an interruption', async () => {
    const first = options({ executeRound: vi.fn(async (_calls, index, _plan, control) => {
      if (index === 1) throw new Error('wallet unavailable');
      await control.checkpoint({ confirmed: true }); return { confirmed: true };
    }) });
    await expect(runSavedActionPlan(first)).rejects.toThrow('wallet unavailable');
    expect(JSON.parse(localStorage.getItem(KEY)).nextRound).toBe(1);
    const resumed = options();
    await expect(runSavedActionPlan(resumed)).resolves.toMatchObject({ completed: true, resumed: true, rounds: 2 });
    expect(resumed.prepare).not.toHaveBeenCalled();
    expect(resumed.executeRound).toHaveBeenCalledTimes(1);
    expect(resumed.executeRound.mock.calls[0][0][0]).toMatchObject({ chainId: 8453, args: [ACCOUNT, 8453n, 5n, ACCOUNT], expectedState: { token: SAFE } });
  });

  it('checkpoints before a child receipt is cleared, including a crash after verification', async () => {
    const first = options({ prepare: vi.fn(async () => ({ rounds: [[call(8453)]] })), executeRound: vi.fn(async (_c, _i, _p, control) => {
      await control.checkpoint({ confirmed: true }); throw new Error('page closed before receipt cleanup');
    }) });
    await expect(runSavedActionPlan(first)).rejects.toThrow('page closed');
    const resumed = options();
    await expect(runSavedActionPlan(resumed)).resolves.toMatchObject({ completed: true, resumed: true });
    expect(resumed.executeRound).not.toHaveBeenCalled();
    expect(resumed.prepare).not.toHaveBeenCalled();
  });

  it('uses unique plan IDs so old round receipts cannot satisfy a later action', async () => {
    const first = options(); await runSavedActionPlan(first);
    const oldId = JSON.parse(localStorage.getItem(KEY)).id;
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(false);
    await runSavedActionPlan(options());
    expect(JSON.parse(localStorage.getItem(KEY)).id).not.toBe(oldId);
  });

  it('retains unknown Safe publication and does not run new preparation or proposals', async () => {
    const first = options({ safeMode: true, executionAccount: SAFE, executeRound: vi.fn(async (_c, _i, _p, control) => {
      await control.beforeSafe(); throw new Error('lost proposal response');
    }) });
    await expect(runSavedActionPlan(first)).rejects.toThrow('lost proposal');
    const again = options({ safeMode: true, executionAccount: SAFE });
    await expect(runSavedActionPlan(again)).rejects.toThrow('Safe proposal or execution may have been submitted');
    expect(again.prepare).not.toHaveBeenCalled(); expect(again.executeRound).not.toHaveBeenCalled();
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('does not clear known queued Safe calls before their execution is confirmed', async () => {
    await runSavedActionPlan(options({ safeMode: true, executionAccount: SAFE,
      executeRound: async calls => ({ relayr: false, queued: calls.length, expectedCount: calls.length, executedReady: 0 }),
    }));
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('binds saved calls to their original execution account and Safe mode', async () => {
    const first = options({ executionAccount: SAFE, safeMode: true, executeRound: vi.fn(async () => { throw new Error('review closed'); }) });
    await expect(runSavedActionPlan(first)).rejects.toThrow('review closed');
    await expect(runSavedActionPlan(options())).rejects.toThrow('original execution account');
  });

  it.each(['duplicate-chain', 'nonzero-value', 'wrong-checkpoint'])('rejects a damaged restored plan: %s', async mutation => {
    await expect(runSavedActionPlan(options({ executeRound: vi.fn(async () => { throw new Error('cancelled'); }) }))).rejects.toThrow('cancelled');
    const plan = JSON.parse(localStorage.getItem(KEY));
    if (mutation === 'duplicate-chain') plan.rounds[0][1].chainId = plan.rounds[0][0].chainId;
    if (mutation === 'nonzero-value') plan.rounds[0][0].value = '1';
    if (mutation === 'wrong-checkpoint') plan.nextRound = 1;
    localStorage.setItem(KEY, JSON.stringify(plan));
    const resumed = options();
    await expect(runSavedActionPlan(resumed)).rejects.toThrow();
    expect(resumed.prepare).not.toHaveBeenCalled(); expect(resumed.executeRound).not.toHaveBeenCalled();
  });

  it('cannot dispatch if durable storage is unavailable', async () => {
    const options0 = options();
    const deny = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    await expect(runSavedActionPlan(options0)).rejects.toThrow('checkpoint could not be saved');
    expect(options0.executeRound).not.toHaveBeenCalled(); deny.mockRestore();
  });

  it('requires an available cross-window lock before preparing any calls', async () => {
    navigator.locks.request.mockImplementation((_key, _opts, fn) => fn(null));
    const options0 = options();
    await expect(runSavedActionPlan(options0)).rejects.toThrow('another window');
    expect(options0.prepare).not.toHaveBeenCalled();
  });

  it('retains the ordinary call limit while supporting an explicitly bounded pending-payment batch', async () => {
    const rounds = Array.from({ length: 25 }, (_, index) => [call(1, BigInt(index + 1))]);
    await expect(runSavedActionPlan(options({ prepare: async () => ({ rounds }) }))).rejects.toThrow('24 rounds');
    await expect(runSavedActionPlan(options({ maxCalls: 256, prepare: async () => ({ rounds }) }))).resolves.toMatchObject({ completed: true, rounds: 25 });
  });

  it('persists a refreshed unsigned round before a new review and preserves earlier completed rounds', async () => {
    const first = options({ executeRound: async (_calls, index, _plan, control) => {
      if (!index) { await control.checkpoint({ confirmed: true }); return { confirmed: true }; }
      await control.replaceUnsubmittedRound([call(8453, 99n)]);
      throw new Error('review closed');
    } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('review closed');
    const resumed = options();
    await runSavedActionPlan(resumed);
    expect(resumed.executeRound).toHaveBeenCalledTimes(1);
    expect(resumed.executeRound.mock.calls[0][0][0].args[2]).toBe(99n);
    expect(resumed.prepare).not.toHaveBeenCalled();
  });

  it('never replaces a round after a Safe proposal has begun publication', async () => {
    const first = options({ safeMode: true, executionAccount: SAFE, executeRound: async (_calls, _index, _plan, control) => {
      await control.beforeSafe();
      await control.replaceUnsubmittedRound([call(8453, 99n)]);
    } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('submitted Safe round cannot be changed');
  });
});

describe('lock fencing', () => {
  // Each request gets its own lock: `lapse()` loses the current one; a later request takes a fresh one.
  let handles;
  const lapse = () => { handles.at(-1).lost = true; };
  const saved = () => JSON.parse(localStorage.getItem(KEY));
  beforeEach(() => {
    handles = [];
    navigator.locks.request.mockImplementation((name, _opts, fn) => {
      const handle = { name, lost: false };
      handle.held = async () => !handle.lost;
      handle.assertHeld = async () => { if (handle.lost) throw Object.assign(new Error('The lock was lost.'), { name: 'LockLostError', code: 'LOCK_LOST' }); };
      handles.push(handle);
      return fn(handle);
    });
  });
  const safeRun = executeRound => options({ safeMode: true, executionAccount: SAFE, executeRound: vi.fn(executeRound) });
  it('hands the round the plan lock, so its Safe wallet calls fence it before the prompt', async () => {
    const run = safeRun(async (_calls, _index, _plan, control) => { expect(control.locks).toEqual([handles.at(-1)]); return { confirmed: true }; });
    await expect(runSavedActionPlan(run)).resolves.toMatchObject({ completed: true });
    expect(run.executeRound).toHaveBeenCalled();
  });
  it('never records a Safe attempt once its lock lapsed before the attempt', async () => {
    const run = safeRun(async (_calls, _index, _plan, control) => { lapse(); await control.beforeSafe({ chainId: 8453 }); return { confirmed: true }; });
    await expect(runSavedActionPlan(run)).rejects.toMatchObject({ code: 'LOCK_LOST' });
    expect(saved().safePending).toBe(false); expect(saved().safeProgress).toBeUndefined();
  });
  it('saves a round checkpoint reached after the lapse under a fresh lock, and a resume skips that round', async () => {
    const run = options({ executeRound: vi.fn(async (_calls, _index, _plan, control) => { lapse(); await control.checkpoint({ confirmed: true }); return { confirmed: true }; }) });
    await expect(runSavedActionPlan(run)).rejects.toMatchObject({ code: 'LOCK_LOST' });
    expect(saved()).toMatchObject({ nextRound: 1, results: [{ confirmed: true }] });
    const resumed = options();
    await expect(runSavedActionPlan(resumed)).resolves.toMatchObject({ completed: true, resumed: true });
    expect(resumed.executeRound.mock.calls.map(call => call[1])).toEqual([1]);
  });
  it('saves a Safe rejection after the lapse under a fresh lock, so the action can be retried', async () => {
    const run = safeRun(async (_calls, _index, _plan, control) => {
      await control.beforeSafe({ chainId: 8453 });
      lapse();
      // The wallet rejected (4001): the caller reports it and swallows a refused save.
      await control.safeCancelled().catch(() => {});
      return { cancelled: true };
    });
    await expect(runSavedActionPlan(run)).resolves.toMatchObject({ cancelled: true });
    expect(saved().safePending).toBe(false); expect(saved().safeProgress.attempt).toBeNull();
    const retry = safeRun(async () => ({ cancelled: true }));
    await expect(runSavedActionPlan(retry)).resolves.toMatchObject({ cancelled: true, resumed: true });
    expect(retry.executeRound).toHaveBeenCalledOnce();
  });
  it('saves a Safe proposal returned after the lapse under a fresh lock', async () => {
    const proposal = { chainId: 8453, safeTxHash: '0x' + 'ab'.repeat(32) };
    const run = safeRun(async (_calls, _index, _plan, control) => {
      await control.beforeSafe({ chainId: 8453 });
      lapse();
      await control.recordSafeProposal(proposal);
      return { confirmed: true };
    });
    await expect(runSavedActionPlan(run)).rejects.toMatchObject({ code: 'LOCK_LOST' });
    expect(saved().safePending).toBe(false);
    expect(saved().safeProgress).toMatchObject({ index: 0, attempt: null, proposals: [proposal] });
  });
  it('never applies a late Safe outcome to a newer attempt', async () => {
    const run = safeRun(async (_calls, _index, _plan, control) => {
      await control.beforeSafe({ chainId: 8453 });
      lapse();
      // Another window took the plan and started its own attempt.
      const current = saved(); current.safeProgress.attempt.id = 'other'; localStorage.setItem(KEY, JSON.stringify(current));
      await control.safeCancelled().catch(() => {});
      return { cancelled: true };
    });
    await runSavedActionPlan(run);
    expect(saved().safePending).toBe(true); expect(saved().safeProgress.attempt.id).toBe('other');
  });
});

describe('Safe round completion accounting', () => {
  it('keeps a fully queued service round distinct from execution', () => {
    expect(normalizeSelectedSafeResult({ queued: 2 }, 2)).toMatchObject({ expectedCount: 2, queued: 2, executedReady: 0 });
  });
  it('accounts for direct executions and later execution of service proposals', () => {
    expect(normalizeSelectedSafeResult({ queued: 1, executed: 1, executedReady: 1 }, 2)).toMatchObject({ expectedCount: 2, executedReady: 2 });
  });
  it.each([{ queued: 0, approved: 1 }, { queued: 1, partial: true }, { queued: 1 }, { queued: 0, cancelled: true }, { queued: 2, skipped: ['Base'] }])('does not drop unaccounted destinations for %j', result => {
    expect(() => normalizeSelectedSafeResult(result, 2)).toThrow('pending or unaccounted');
  });
});
