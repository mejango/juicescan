import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAbi, encodeFunctionData } from 'viem';
import { runSavedActionPlan, acknowledgeSavedActionPlan, hasSavedActionPlan } from '../src/action-plan.js';
import { normalizeSelectedSafeResult, reconcileSelectedProjectResult } from '../src/discover.js';
import { relayrRequestFingerprint } from '../src/relayr.js';

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
    executeRound: vi.fn(async (_calls, _index, _plan, control) => { control.checkpoint({ confirmed: true }); return { confirmed: true }; }), ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
});

describe('durable selected action rounds', () => {
  it('adversarial: revalidates a checkpointed direct round after reload', async () => {
    const hash = '0x' + 'ab'.repeat(32);
    const first = options({ prepare: async () => ({ rounds: [[call(8453)], [call(8453, 5n)]] }), executeRound: async (_calls, index, _plan, control) => {
      if (index === 1) throw new Error('page closed');
      control.checkpoint({ relayr: true, session: { expectedCount: 1, records: [{ status: { state: 'Completed' }, data: { hash } }] } });
      return { confirmed: true };
    } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('page closed');
    // Direct round results use relayr:true in the production adapter too.
    const reconcileResult = vi.fn(async () => { throw new Error('receipt no longer canonical'); });
    const resumed = options({ reconcileResult });
    const outcome = await runSavedActionPlan(resumed).then(
      value => ({ value, error: null }), error => ({ value: null, error }),
    );
    expect(resumed.prepare).not.toHaveBeenCalled();
    expect(outcome.error, 'must revalidate the original receipt before completing').toBeTruthy();
    expect(resumed.executeRound).not.toHaveBeenCalled();
  });

  it('rechecks earlier receipts at final completion and preserves their hashes when verification fails', async () => {
    let reorg = false;
    const reconcileResult = vi.fn(async result => { if (reorg) throw new Error('orphaned receipt'); return result; });
    const first = options({ reconcileResult, executeRound: async (_calls, index, _plan, control) => {
      if (index === 1) reorg = true;
      const result = { confirmed: true, hash: '0x' + 'ab'.repeat(32) };
      control.checkpoint(result); return result;
    } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('orphaned receipt');
    expect(JSON.parse(localStorage.getItem(KEY))).toMatchObject({ nextRound: 2, results: [{ hash: '0x' + 'ab'.repeat(32) }, { hash: '0x' + 'ab'.repeat(32) }] });
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT); expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
    const resumed = options({ reconcileResult });
    await expect(runSavedActionPlan(resumed)).rejects.toThrow('orphaned receipt');
    expect(resumed.executeRound).not.toHaveBeenCalled();
    reorg = false;
    await expect(runSavedActionPlan(resumed)).resolves.toMatchObject({ completed: true });
    expect(resumed.executeRound).not.toHaveBeenCalled();
  });

  it('retains partially pruned keeper decisions across an interrupted unsigned round', async () => {
    const first = options({ executeRound: async (calls, index, _plan, control) => {
      control.replaceUnsubmittedRound([calls[0]]); throw new Error('review closed');
    } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('review closed');
    const reconcileResult = vi.fn(async (result, _calls, skipped) => {
      if (skipped.length) throw new Error('keeper decision reverted'); return result;
    });
    await expect(runSavedActionPlan(options({ reconcileResult }))).rejects.toThrow('keeper decision reverted');
    expect(reconcileResult.mock.calls[0][2]).toEqual([call(10)]);
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT); expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('retains every allocation and skips verified rounds after an interruption', async () => {
    const first = options({ executeRound: vi.fn(async (_calls, index, _plan, control) => {
      if (index === 1) throw new Error('wallet unavailable');
      control.checkpoint({ confirmed: true }); return { confirmed: true };
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
      control.checkpoint({ confirmed: true }); throw new Error('page closed before receipt cleanup');
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

  it('cannot acknowledge an old completion after another window starts revalidation', async () => {
    await runSavedActionPlan(options());
    const saved = JSON.parse(localStorage.getItem(KEY));
    saved.verificationId = crypto.randomUUID();
    localStorage.setItem(KEY, JSON.stringify(saved));
    acknowledgeSavedActionPlan(SCOPE, ACCOUNT);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('cannot acknowledge a legacy completed checkpoint before recovering it in this window', async () => {
    await runSavedActionPlan(options());
    const saved = JSON.parse(localStorage.getItem(KEY));
    delete saved.verificationId;
    localStorage.clear(); localStorage.setItem(KEY, JSON.stringify(saved));
    const fresh = await import('../src/action-plan.js?legacy-ack');
    fresh.acknowledgeSavedActionPlan(SCOPE, ACCOUNT);
    expect(hasSavedActionPlan(SCOPE, ACCOUNT)).toBe(true);
  });

  it('retains unknown Safe publication and does not run new preparation or proposals', async () => {
    const first = options({ safeMode: true, executionAccount: SAFE, executeRound: vi.fn(async (_c, _i, _p, control) => {
      control.beforeSafe(); throw new Error('lost proposal response');
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
      if (!index) { control.checkpoint({ confirmed: true }); return { confirmed: true }; }
      control.replaceUnsubmittedRound([call(8453, 99n)]);
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
      control.beforeSafe();
      control.replaceUnsubmittedRound([call(8453, 99n)]);
    } });
    await expect(runSavedActionPlan(first)).rejects.toThrow('submitted Safe round cannot be changed');
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

describe('selected action production receipt reconciliation', () => {
  function fixture(transport = 'direct') {
    const original = call(8453), hash = '0x' + 'ab'.repeat(32), blockHash = '0x' + 'cd'.repeat(32);
    const request = { chain: '8453', target: SAFE, data: original.data, value: '0', virtual_nonce: 0 };
    const receipt = { status: 'success', transactionHash: hash, blockHash, blockNumber: 123n, logs: [] };
    const transaction = { hash, from: ACCOUNT, to: SAFE, input: original.data, value: 0n, blockHash, blockNumber: 123n };
    const client = { getTransaction: vi.fn(async () => transaction), getTransactionReceipt: vi.fn(async () => receipt),
      getBlock: vi.fn(async () => ({ hash: blockHash, number: 123n })) };
    const result = { relayr: true, transport, session: { expectedCount: 1,
      expectedTransactions: [{ requestHash: relayrRequestFingerprint(request) }],
      records: [{ request, status: { state: 'Completed', data: { hash } }, data: { hash } }] } };
    return { original, hash, receipt, transaction, client, result, factory: () => client };
  }

  it.each(['direct', 'relayr'])('verifies the exact %s receipt, canonical block and application outcome', async transport => {
    const f = fixture(transport), verifyReceipt = vi.fn(async () => ({ outcome: 'routed' }));
    const result = await reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, { verifyReceipt }, f.factory);
    expect(result.session.records[0]).toMatchObject({ data: { hash: f.hash }, receipt: { transactionHash: f.hash, blockNumber: '123', blockHash: f.receipt.blockHash, outcome: { outcome: 'routed' } } });
    expect(f.client.getBlock).toHaveBeenCalledWith({ blockNumber: 123n });
    expect(verifyReceipt).toHaveBeenCalledWith(f.original, f.receipt);
  });

  it.each(['direct', 'relayr'])('rejects an orphaned %s receipt even when status still says success', async transport => {
    const f = fixture(transport);
    f.client.getBlock.mockResolvedValue({ hash: '0x' + 'ef'.repeat(32), number: 123n });
    const verifyReceipt = vi.fn();
    await expect(reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, { verifyReceipt }, f.factory)).rejects.toThrow('no longer canonical');
    expect(verifyReceipt).not.toHaveBeenCalled();
    expect(f.result.session.records[0].data.hash).toBe(f.hash);
  });

  it.each(['missing', 'reverted', 'sender', 'calldata', 'transaction-block'])('keeps a direct checkpoint unresolved for %s evidence', async kind => {
    const f = fixture();
    if (kind === 'missing') f.client.getTransactionReceipt.mockResolvedValue(null);
    if (kind === 'reverted') f.receipt.status = 'reverted';
    if (kind === 'sender') f.transaction.from = SAFE;
    if (kind === 'calldata') f.transaction.input = '0x1234';
    if (kind === 'transaction-block') f.transaction.blockHash = '0x' + 'ef'.repeat(32);
    await expect(reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, {}, f.factory)).rejects.toThrow('not confirmed');
  });

  it('rechecks the application result even when the exact transaction remains canonical', async () => {
    const f = fixture();
    await expect(reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, {
      verifyReceipt: async () => { throw new Error('routing event missing'); },
    }, f.factory)).rejects.toThrow('routing event missing');
  });

  it('blocks old checkpoints that lost the original transport and request bindings', async () => {
    const f = fixture(); delete f.result.transport; delete f.result.session.records[0].request;
    await expect(reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, {}, f.factory)).rejects.toThrow('original transaction bindings');
    expect(f.client.getTransaction).not.toHaveBeenCalled();
  });

  it('recovers old forced-direct payment hashes only after verifying their original frozen call', async () => {
    const f = fixture(); delete f.result.transport; delete f.result.session.records[0].request;
    const recovered = await reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, { forceDirect: true }, f.factory);
    expect(recovered).toMatchObject({ transport: 'direct', session: { records: [{ request: { chain: '8453', target: SAFE, data: f.original.data }, receipt: { transactionHash: f.hash } }] } });
    f.transaction.input = '0x1234';
    await expect(reconcileSelectedProjectResult(f.result, [f.original], ACCOUNT, { forceDirect: true }, f.factory)).rejects.toThrow('not confirmed');
  });

  it('rechecks keeper-resolved rounds and rejects a reverted skip without submitting them again', async () => {
    const f = fixture(), refreshUnsubmittedRound = vi.fn(async () => []);
    const skipped = { relayr: true, alreadyResolved: true, session: { expectedCount: 0, records: [] } };
    await expect(reconcileSelectedProjectResult(skipped, [f.original], ACCOUNT, { refreshUnsubmittedRound }, f.factory)).resolves.toBe(skipped);
    refreshUnsubmittedRound.mockResolvedValue([f.original]);
    await expect(reconcileSelectedProjectResult(skipped, [f.original], ACCOUNT, { refreshUnsubmittedRound }, f.factory)).rejects.toThrow('previously resolved');
    expect(f.client.getTransaction).not.toHaveBeenCalled();
  });
});
