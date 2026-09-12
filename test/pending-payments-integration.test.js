import { beforeEach, expect, it, vi } from 'vitest';
import { encodeFunctionData } from 'viem';
import { getABI } from '../src/abi-registry.js';

const mocks = vi.hoisted(() => ({ run: vi.fn(), prepare: vi.fn(), refresh: vi.fn(), verify: vi.fn(), outcome: vi.fn(),
  direct: vi.fn(), hasDirect: vi.fn(), clearUnsubmitted: vi.fn(), savedRelay: vi.fn(), client: null, account: '0x1111111111111111111111111111111111111111' }));
vi.mock('../src/action-plan.js', async original => ({ ...await original(), runSavedActionPlan: mocks.run }));
vi.mock('../src/pending-payments.js', async original => ({ ...await original(), preparePendingPayment: mocks.prepare,
  refreshPendingPayment: mocks.refresh, reverifyPendingPayment: mocks.verify, pendingPaymentReceiptOutcome: mocks.outcome }));
vi.mock('../src/direct-batch.js', async original => ({ ...await original(), runDirectBatch: mocks.direct, hasDirectBatch: mocks.hasDirect, clearUnsubmittedDirectBatch: mocks.clearUnsubmitted }));
vi.mock('../src/relayr.js', async original => ({ ...await original(), loadRelayrPendingSession: mocks.savedRelay }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), getAccount: () => mocks.account,
  getViewAs: () => null, isSafeConnected: () => false, createPublicClientForChain: () => mocks.client,
}));

import { runPendingProjectPayments } from '../src/discover.js';

const gateway = '0x4a56aef5b6a5b9742abb02ca67c5a85ba183d901';
const rows = [1, 2, 3].map((id, index) => ({ pendingCallId: '0x' + String(id).padStart(64, '0'), chainId: index === 1 ? 10 : 1,
  amount: 100n, sourceProjectId: 7, projectId: 1, token: '0x000000000000000000000000000000000000eeee', beneficiary: mocks.account }));
const project = { id: 7, chainId: 1, idByChain: { 1: 7, 10: 7 }, chains: [{ id: 1 }, { id: 10 }] };
function call(row, finalizes = false) {
  const functionName = finalizes ? 'finalizePendingCall' : 'processPendingCall';
  const abi = getABI('JBRouterTerminalGateway').filter(entry => entry.type === 'function' && entry.name === functionName);
  const args = [row.pendingCallId, { amount: row.amount, preferAddToBalance: false, shouldReturnHeldFees: false,
    beneficiary: row.beneficiary, projectId: 1n, refundTo: mocks.account, sourceProjectId: 7n, token: row.token }, '', '0x' + '0'.repeat(63) + '7'];
  return { chainId: row.chainId, to: gateway, abi, functionName, args, data: encodeFunctionData({ abi, functionName, args }), value: 0n,
    pendingPayment: row, expectedState: { pendingPayment: true }, gas: 6579366n };
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
  mocks.prepare.mockImplementation(async row => call(row));
  mocks.refresh.mockImplementation(async descriptor => call(descriptor.pendingPayment));
  mocks.hasDirect.mockReturnValue(false); mocks.savedRelay.mockReturnValue(null);
  mocks.clearUnsubmitted.mockResolvedValue(true);
  mocks.direct.mockResolvedValue([]);
});

it('revalidates an interrupted production direct checkpoint before any remaining payment can be sent', async () => {
  const { runSavedActionPlan } = await vi.importActual('../src/action-plan.js');
  mocks.run.mockImplementation(runSavedActionPlan);
  const original = call(rows[0]), hash = '0x' + 'ab'.repeat(32), blockHash = '0x' + 'cd'.repeat(32);
  const receipt = { status: 'success', transactionHash: hash, blockHash, blockNumber: 123n };
  mocks.client = { getTransaction: vi.fn(async () => ({ hash, from: mocks.account, to: original.to, input: original.data, value: 0n, blockHash, blockNumber: 123n })),
    getTransactionReceipt: vi.fn(async () => receipt), getBlock: vi.fn(async () => ({ hash: blockHash, number: 123n })) };
  mocks.outcome.mockReturnValue({ outcome: 'routed' });
  mocks.direct.mockImplementationOnce(async (_calls, options) => { await options.onComplete([receipt]); return [receipt]; })
    .mockRejectedValueOnce(new Error('page closed'));
  await expect(runPendingProjectPayments(project, [rows[0], rows[2]], vi.fn())).rejects.toThrow('page closed');
  const key = Object.keys(localStorage).find(key => key.startsWith('jb-selected-action-v1:'));
  const checkpoint = JSON.parse(localStorage.getItem(key));
  expect(checkpoint.results[0]).toMatchObject({ transport: 'direct', session: { direct: true, records: [{
    request: { chain: '1', target: original.to, data: original.data }, receipt: { transactionHash: hash, blockHash, blockNumber: '123' },
  }] } });
  mocks.direct.mockClear(); mocks.prepare.mockClear();
  mocks.client.getBlock.mockResolvedValue({ hash: '0x' + 'ef'.repeat(32), number: 123n });
  await expect(runPendingProjectPayments(project, [rows[0], rows[2]], vi.fn())).rejects.toThrow('no longer canonical');
  expect(mocks.direct).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.client.getTransactionReceipt).toHaveBeenCalledWith({ hash });
  expect(JSON.parse(localStorage.getItem(key)).results[0].session.records[0].data.hash).toBe(hash);
});

it('checkpoints every selected payment separately with no token value', async () => {
  let prepared;
  mocks.run.mockImplementation(async options => { prepared = await options.prepare(); return { completed: false }; });
  await runPendingProjectPayments(project, rows, vi.fn());
  expect(prepared.rounds.map(round => round.map(call => call.chainId))).toEqual([[1], [10], [1]]);
  expect(prepared.rounds.flat().every(call => call.value === 0n)).toBe(true);
  expect(mocks.run.mock.calls[0][0].maxCalls).toBe(256);
});

it('skips a keeper-resolved unsigned round without a wallet request and checkpoints the result', async () => {
  const control = { checkpoint: vi.fn(), replaceUnsubmittedRound: vi.fn(), hasSafeProgress: false };
  mocks.refresh.mockResolvedValue(null);
  mocks.run.mockImplementation(async options => {
    const prepared = await options.prepare();
    const result = await options.executeRound(prepared.rounds[0], 0, { id: 'plan', ...prepared }, control);
    expect(result.alreadyResolved).toBe(true);
    return { completed: true, results: [result], rounds: 1 };
  });
  await runPendingProjectPayments(project, [rows[0]], vi.fn());
  expect(control.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ alreadyResolved: true }));
  expect(mocks.direct).not.toHaveBeenCalled();
});

it('restages an unsigned payment with its fresh finalization method before review', async () => {
  const control = { checkpoint: vi.fn(), replaceUnsubmittedRound: vi.fn(), hasSafeProgress: false };
  mocks.refresh.mockImplementation(async descriptor => call(descriptor.pendingPayment, true));
  mocks.run.mockImplementation(async options => {
    const prepared = await options.prepare();
    await options.executeRound(prepared.rounds[0], 0, { id: 'plan', ...prepared }, control);
    return { completed: false };
  });
  await runPendingProjectPayments(project, [rows[0]], vi.fn());
  expect(control.replaceUnsubmittedRound.mock.calls[0][0][0].functionName).toBe('finalizePendingCall');
  expect(mocks.direct.mock.calls[0][0][0].functionName).toBe('finalizePendingCall');
});

it.each(['direct', 'safe'])('does not restage a round with an existing %s publication record', async mode => {
  const control = { checkpoint: vi.fn(), replaceUnsubmittedRound: vi.fn(), hasSafeProgress: mode === 'safe' };
  if (mode === 'direct') { mocks.hasDirect.mockReturnValue(true); mocks.clearUnsubmitted.mockResolvedValue(false); }
  mocks.run.mockImplementation(async options => {
    const prepared = await options.prepare();
    await options.executeRound(prepared.rounds[0], 0, { id: 'plan', ...prepared }, control);
    return { completed: false };
  });
  await runPendingProjectPayments(project, [rows[0]], vi.fn());
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(control.replaceUnsubmittedRound).not.toHaveBeenCalled();
});
