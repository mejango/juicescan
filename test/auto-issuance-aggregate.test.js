import { describe, expect, it, vi } from 'vitest';
import { encodeFunctionData } from 'viem';
import { MAX_AUTO_ISSUANCE_CALLS, autoIssuanceRounds, prepareAutoIssuanceCalls, verifyAutoIssuanceCall } from '../src/auto-issuance-aggregate.js';
import { acknowledgeSavedActionPlan, runSavedActionPlan } from '../src/action-plan.js';

const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const REV = '0x3333333333333333333333333333333333333333';
const CONTROLLER = '0x4444444444444444444444444444444444444444';

function row(chainId = 1, stageId = '100', beneficiary = ALICE, extra = {}) {
  return { chainId, stageId, beneficiary, count: 1n, ...extra };
}

function options(rows, overrides = {}) {
  return {
    rows, chainIds: [1, 8453],
    resolveProjectId: (chainId) => chainId === 1 ? 7n : 19n,
    readChain: vi.fn(async () => ({ revOwnerAddr: REV, owner: REV, controller: CONTROLLER, timestamp: 1000n })),
    readAllocation: vi.fn(async (allocation) => ({ stage: { id: allocation.stageId, start: 900n }, remaining: 50n })),
    buildCall: (allocation) => ({ to: allocation.revOwnerAddr, args: [allocation.projectId, allocation.stageId, allocation.beneficiary] }),
    ...overrides,
  };
}

describe('aggregate auto issuance', () => {
  it('preserves different stage IDs, project IDs and every beneficiary on each selected chain', async () => {
    const plan = await prepareAutoIssuanceCalls(options([
      row(1, '100', ALICE), row(1, '100', BOB), row(1, '101', ALICE),
      row(8453, '200', ALICE), row(8453, '201', BOB),
    ]));
    expect(plan.rounds.map((round) => round.map((call) => call.chainId))).toEqual([[1, 8453], [1, 8453], [1]]);
    expect(plan.calls.map((call) => call.args)).toEqual([
      [7n, 100n, ALICE], [7n, 100n, BOB], [7n, 101n, ALICE], [19n, 200n, ALICE], [19n, 201n, BOB],
    ]);
    expect(plan.rounds.flat()).toHaveLength(5);
  });

  it('coalesces repeated storage events for the same slot and uses its live accumulated amount once', async () => {
    const opts = options([row(1, '100', ALICE, { count: 12n }), row(1, '100', ALICE, { count: 38n })]);
    const plan = await prepareAutoIssuanceCalls(opts);
    expect(opts.readAllocation).toHaveBeenCalledTimes(1);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0].autoIssue.remaining).toBe('50');
  });

  it('reads and calls only selected chains', async () => {
    const opts = options([row(1), row(8453)], { chainIds: [8453] });
    const plan = await prepareAutoIssuanceCalls(opts);
    expect(opts.readChain).toHaveBeenCalledExactlyOnceWith(8453, 19n);
    expect(plan.calls.map((call) => call.chainId)).toEqual([8453]);
  });

  it('uses the live chain timestamp, not indexed remaining flags or the browser clock', async () => {
    const opts = options([
      row(1, '100', ALICE, { distributed: true, remaining: 0n }),
      row(1, '101'), row(8453, '200'),
    ], { readAllocation: vi.fn(async (allocation) => ({
      stage: { id: allocation.stageId, start: allocation.stageId === 101n ? 1001n : 1000n },
      remaining: allocation.chainId === 8453 ? 0n : 50n,
    })) });
    const plan = await prepareAutoIssuanceCalls(opts);
    expect(plan.calls.map((call) => call.autoIssue.stageId)).toEqual(['100']);
  });

  it('rejects the whole preparation on a failed allocation read', async () => {
    const opts = options([row(1), row(8453)], { readAllocation: async (allocation) => {
      if (allocation.chainId === 8453) throw new Error('RPC offline');
      return { stage: { id: allocation.stageId, start: 900n }, remaining: 50n };
    } });
    await expect(prepareAutoIssuanceCalls(opts)).rejects.toThrow('RPC offline');
  });

  it('rejects a changed destination project mapping before any live reads', async () => {
    const opts = options([row(8453, '200', ALICE, { projectId: '7' })]);
    await expect(prepareAutoIssuanceCalls(opts)).rejects.toThrow('project ID changed');
    expect(opts.readChain).not.toHaveBeenCalled();
  });

  it('rejects an unresolved destination project ID', async () => {
    await expect(prepareAutoIssuanceCalls(options([row(8453)], { resolveProjectId: () => undefined })))
      .rejects.toThrow('project ID');
  });

  it('requires the exact live stage ID rather than substituting a similarly positioned stage', async () => {
    await expect(prepareAutoIssuanceCalls(options([row(1)], {
      readAllocation: async () => ({ stage: { id: 999n, start: 900n }, remaining: 50n }),
    }))).rejects.toThrow('stage');
  });

  it.each([null, -1n, 'unavailable'])('rejects unreadable remaining amount %s instead of silently skipping it', async (remaining) => {
    await expect(prepareAutoIssuanceCalls(options([row(1)], {
      readAllocation: async (allocation) => ({ stage: { id: allocation.stageId, start: 900n }, remaining }),
    }))).rejects.toThrow('remaining auto issuance');
  });

  it('verifies REVOwner still owns every selected project', async () => {
    await expect(prepareAutoIssuanceCalls(options([row(1)], {
      readChain: async () => ({ revOwnerAddr: REV, owner: ALICE, controller: CONTROLLER, timestamp: 1000n }),
    }))).rejects.toThrow('live revnet deployment');
  });

  it.each(['bad-address', '0x' + '00'.repeat(20)])('rejects invalid beneficiary %s', async (beneficiary) => {
    await expect(prepareAutoIssuanceCalls(options([row(1, '100', beneficiary)]))).rejects.toThrow('beneficiary');
  });

  it('rejects oversized requests without truncating or silently dropping any allocations', async () => {
    const rows = Array.from({ length: MAX_AUTO_ISSUANCE_CALLS + 1 }, (_, i) => row(1, String(100 + i)));
    await expect(prepareAutoIssuanceCalls(options(rows))).rejects.toThrow('at most ' + MAX_AUTO_ISSUANCE_CALLS);
  });

  it('bounds indexed input before making transaction-critical reads', async () => {
    const opts = options(Array.from({ length: 257 }, (_, i) => row(1, String(100 + i))));
    await expect(prepareAutoIssuanceCalls(opts)).rejects.toThrow('Too many auto-issuance rows');
    expect(opts.readChain).not.toHaveBeenCalled();
  });

  it('does not create a plan for only locked or consumed allocations', async () => {
    await expect(prepareAutoIssuanceCalls(options([row(1)], {
      readAllocation: async (allocation) => ({ stage: { id: allocation.stageId, start: 1100n }, remaining: 50n }),
    }))).rejects.toThrow('No unlocked auto issuance remains');
  });
});

describe('reviewed auto-issuance revalidation', () => {
  it('accepts an unchanged reviewed allocation', async () => {
    const plan = await prepareAutoIssuanceCalls(options([row(1)]));
    expect(() => verifyAutoIssuanceCall(plan.calls[0], plan.allocations[0])).not.toThrow();
  });

  it.each([
    { chainId: 8453 }, { projectId: 19n }, { stageId: 101n }, { beneficiary: BOB },
    { remaining: 49n }, { stageStart: 901n }, { revOwnerAddr: ALICE }, { controller: BOB },
  ])('blocks changed reviewed details %o', async (change) => {
    const plan = await prepareAutoIssuanceCalls(options([row(1)]));
    expect(() => verifyAutoIssuanceCall(plan.calls[0], { ...plan.allocations[0], ...change })).toThrow('reviewed auto issuance changed');
  });

  it('keeps every same-chain call in a later round', () => {
    const calls = Array.from({ length: 4 }, (_, i) => ({ chainId: 1, allocation: i }));
    expect(autoIssuanceRounds(calls)).toEqual(calls.map((call) => [call]));
  });

  it('resumes the original remaining round before rereading changed balances or rebuilding calls', async () => {
    const scope = 'auto-issuance-test:resume';
    const abi = [{ type: 'function', name: 'autoIssueFor', stateMutability: 'nonpayable', outputs: [],
      inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }] }];
    const prepare = vi.fn(async () => prepareAutoIssuanceCalls(options([
      row(1, '100', ALICE), row(1, '100', BOB), row(8453, '200', ALICE),
    ], { buildCall: (allocation) => {
      const args = [allocation.projectId, allocation.stageId, allocation.beneficiary];
      return { to: REV, abi, functionName: 'autoIssueFor', args,
        data: encodeFunctionData({ abi, functionName: 'autoIssueFor', args }) };
    } })));
    await expect(runSavedActionPlan({ scope, account: ALICE, prepare, executeRound: async (_, index) => {
      if (index === 1) throw new Error('Wallet request pending');
      return { confirmed: true };
    } }, true)).rejects.toThrow('Wallet request pending');
    expect(prepare).toHaveBeenCalledTimes(1);

    const changedBalances = vi.fn(() => { throw new Error('All displayed amounts have since changed'); });
    const executeRound = vi.fn(async (calls, index) => {
      expect(index).toBe(1);
      expect(calls).toHaveLength(1);
      expect(calls[0].args).toEqual([7n, 100n, BOB]);
      expect(calls[0].autoIssue.remaining).toBe('50');
      return { confirmed: true };
    });
    const result = await runSavedActionPlan({ scope, account: ALICE, prepare: changedBalances, executeRound }, true);
    expect(result).toMatchObject({ completed: true, resumed: true, rounds: 2 });
    expect(executeRound).toHaveBeenCalledTimes(1);
    expect(changedBalances).not.toHaveBeenCalled();
    acknowledgeSavedActionPlan(scope, ALICE);
  });
});
