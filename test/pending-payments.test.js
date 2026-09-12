import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, keccak256, stringToHex } from 'viem';
import deployment from '../data/abis/JBRouterTerminalGateway.json';
import { fetchPendingPaymentRows, pendingPaymentKey, pendingPaymentReceiptOutcome, preparePendingPayment, readPendingPayment, refreshPendingPayment, reverifyPendingPayment } from '../src/pending-payments.js';

const ABI = deployment.abi;
const TUPLE = ABI.find(entry => entry.name === 'processPendingCall').inputs[1];
const GATEWAY = '0x4a56aef5b6a5b9742abb02ca67c5a85ba183d901';
const BENEFICIARY = '0x1111111111111111111111111111111111111111';
const REFUND_TO = '0x2222222222222222222222222222222222222222';
const TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ZERO_HASH = '0x' + '0'.repeat(64);
const ERROR_HASH = '0x' + 'ab'.repeat(32);
const EXHAUSTED = keccak256(stringToHex('JBRouterTerminalGateway: gas exhausted'));
const MAXIMUM_GAS = (16777216n - 1500000n) * 63n / 64n;
const CONTEXT = { chainId: 8453, sourceProjectId: 7, version: 6 };

function tuple(row) {
  return { amount: BigInt(row.amount), preferAddToBalance: row.preferAddToBalance, shouldReturnHeldFees: row.shouldReturnHeldFees,
    beneficiary: row.beneficiary, projectId: BigInt(row.projectId), refundTo: row.refundTo,
    sourceProjectId: BigInt(row.sourceProjectId), token: row.token };
}
function row(overrides = {}) {
  const value = { ...CONTEXT, gateway: GATEWAY, pendingCallId: '0x' + '1'.padStart(64, '0'),
    projectId: 1, token: TOKEN, amount: '25', retainedAmount: '25', preferAddToBalance: false, shouldReturnHeldFees: false,
    beneficiary: BENEFICIARY, refundTo: REFUND_TO, memo: 'Original fee memo',
    metadata: '0x' + BigInt(overrides.sourceProjectId ?? CONTEXT.sourceProjectId).toString(16).padStart(64, '0'), status: 'queued', ...overrides };
  value.callCommitment = keccak256(encodeAbiParameters([TUPLE, { type: 'string' }, { type: 'bytes' }], [tuple(value), value.memo, value.metadata]));
  return value;
}
function failure(count = 0, overrides = {}) {
  return { errorHash: count ? ERROR_HASH : ZERO_HASH, count, lastFailureAt: count ? 100000n : 0n, highestGasLimit: count ? 5000000n : 0n, ...overrides };
}
function dependencies(original = row(), options = {}) {
  const answers = { pendingCallCommitmentOf: original.callCommitment, pendingCallFailureOf: failure(), QUALIFIED_CALL_GAS: 5000000n,
    maximumQualifiedCallGas: MAXIMUM_GAS, RETRY_DELAY: 86400n, FINALIZATION_FAILURE_COUNT: 3n, ...options.answers };
  return { knownGateway: GATEWAY, client: { chain: { id: CONTEXT.chainId },
    getBlock: vi.fn(async () => ({ number: 123n, timestamp: 200000n, gasLimit: 60000000n, ...options.block })),
    readContract: vi.fn(async ({ functionName }) => answers[functionName]),
  } };
}
function eventLog(eventName, args, address = GATEWAY) {
  const event = ABI.find(entry => entry.type === 'event' && entry.name === eventName);
  const nonIndexed = event.inputs.filter(input => !input.indexed);
  return { address, topics: encodeEventTopics({ abi: [event], eventName, args }),
    data: encodeAbiParameters(nonIndexed, nonIndexed.map(input => args[input.name])) };
}
function receipt(logs) { return { status: 'success', logs }; }
async function descriptor(count = 0) {
  return preparePendingPayment(row(), dependencies(row(), { answers: { pendingCallFailureOf: failure(count) } }));
}

describe('complete pending payment discovery', () => {
  it('paginates every row and binds queries to one exact source project and chain', async () => {
    const rows = Array.from({ length: 251 }, (_, index) => row({ pendingCallId: '0x' + (index + 1).toString(16).padStart(64, '0') }));
    const query = vi.fn(async (_query, variables) => ({ routerPendingCalls: { totalCount: rows.length, items: rows.slice(variables.offset, variables.offset + variables.limit) } }));
    const result = await fetchPendingPaymentRows([CONTEXT, CONTEXT], query);
    expect(result).toHaveLength(251);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual({ ...CONTEXT, limit: 250, offset: 250 });
    expect(result[0].retainedAmount).toBe(25n);
  });

  it('distinguishes a valid empty list from an unavailable response', async () => {
    await expect(fetchPendingPaymentRows([CONTEXT], async () => ({ routerPendingCalls: { totalCount: 0, items: [] } }))).resolves.toEqual([]);
    await expect(fetchPendingPaymentRows([CONTEXT], async () => null)).rejects.toThrow('incomplete');
  });

  it.each(['missing-page', 'duplicate', 'changed-count', 'foreign-chain', 'foreign-project', 'over-count'])('rejects %s without returning a partial batch', async issue => {
    const first = row(), second = row({ pendingCallId: '0x' + '2'.padStart(64, '0') });
    const query = vi.fn(async (_query, { offset }) => {
      if (!offset) return { routerPendingCalls: { totalCount: 2, items: [first] } };
      if (issue === 'missing-page') return { routerPendingCalls: { totalCount: 2, items: [] } };
      if (issue === 'duplicate') return { routerPendingCalls: { totalCount: 2, items: [first] } };
      if (issue === 'changed-count') return { routerPendingCalls: { totalCount: 3, items: [second] } };
      if (issue === 'foreign-chain') return { routerPendingCalls: { totalCount: 2, items: [row({ chainId: 10 })] } };
      if (issue === 'foreign-project') return { routerPendingCalls: { totalCount: 2, items: [row({ sourceProjectId: 88 })] } };
      return { routerPendingCalls: { totalCount: 2, items: [second, first] } };
    });
    await expect(fetchPendingPaymentRows([CONTEXT], query)).rejects.toThrow();
  });

  it('preserves gateway identity even if an old gateway reused the same identifier', () => {
    expect(pendingPaymentKey(row())).not.toBe(pendingPaymentKey(row({ gateway: REFUND_TO })));
  });

  it.each([
    ['amount', '-1'], ['retainedAmount', '0'], ['retainedAmount', '24'], ['preferAddToBalance', 'false'], ['shouldReturnHeldFees', 0],
    ['metadata', '0x123'], ['metadata', ZERO_HASH], ['memo', 'x'.repeat(4097)], ['beneficiary', '0x1234'], ['status', 'settled'], ['version', 5],
    ['pendingCallId', ZERO_HASH], ['sourceProjectId', 0], ['amount', 1.5], ['amount', '1e6'],
  ])('rejects malformed indexed %s before any RPC or transaction', async (field, value) => {
    const invalid = { ...row(), [field]: value }, deps = dependencies();
    await expect(readPendingPayment(invalid, deps)).rejects.toThrow();
    expect(deps.client.readContract).not.toHaveBeenCalled();
  });
});

describe('authoritative gateway retry preparation', () => {
  it('encodes the deployed tuple and original memo/metadata with zero native value and no token approval', async () => {
    const original = row(), deps = dependencies(original), state = await readPendingPayment(original, deps);
    const call = state.descriptor;
    expect(state).toMatchObject({ eligible: true, finalizes: false, failureCount: 0, nextAttemptAt: 0n, qualifiedGas: 5000000n });
    expect(call).toMatchObject({ chainId: 8453, to: GATEWAY, value: 0n, functionName: 'processPendingCall' });
    expect(call.abi).toHaveLength(1);
    expect(call.gas).toBe(6579366n);
    expect(decodeFunctionData({ abi: ABI, data: call.data })).toEqual({ functionName: 'processPendingCall', args: [original.pendingCallId, { ...tuple(original), token: getAddress(original.token) }, original.memo, original.metadata] });
    expect(deps.client.readContract.mock.calls.every(([request]) => request.blockNumber === 123n)).toBe(true);
  });

  it('authenticates add-to-balance fields without losing the held-fee preference', async () => {
    const original = row({ preferAddToBalance: true, shouldReturnHeldFees: true });
    const call = await preparePendingPayment(original, dependencies(original));
    expect(decodeFunctionData({ abi: ABI, data: call.data }).args[1]).toMatchObject({ preferAddToBalance: true, shouldReturnHeldFees: true });
  });

  it('accepts recognized historical gateway deployments independently of selected project routing', async () => {
    const original = row({ gateway: REFUND_TO }), deps = dependencies(original);
    deps.knownGateway = [GATEWAY, REFUND_TO];
    await expect(preparePendingPayment(original, deps)).resolves.toMatchObject({ to: REFUND_TO });
  });

  it('never contacts or prepares an unrecognized gateway', async () => {
    const deps = dependencies(); deps.knownGateway = vi.fn(async () => false);
    await expect(readPendingPayment(row(), deps)).rejects.toThrow('recognized');
    expect(deps.client.getBlock).not.toHaveBeenCalled();
  });

  it('rejects a client connected to the wrong chain', async () => {
    const deps = dependencies(); deps.client.chain.id = 1;
    await expect(readPendingPayment(row(), deps)).rejects.toThrow('wrong chain');
  });

  it('drops indexed calls that have already resolved onchain', async () => {
    const deps = dependencies(row(), { answers: { pendingCallCommitmentOf: ZERO_HASH } });
    await expect(readPendingPayment(row(), deps)).resolves.toBeNull();
    expect(deps.client.readContract).toHaveBeenCalledTimes(1);
  });

  it('requires both the indexed and the authoritative live commitment', async () => {
    await expect(readPendingPayment({ ...row(), memo: 'changed memo' }, dependencies())).rejects.toThrow('commitment');
    await expect(readPendingPayment(row(), dependencies(row(), { answers: { pendingCallCommitmentOf: ERROR_HASH } }))).rejects.toThrow('commitment');
  });

  it.each([
    [0, 100n, true, false, 0n], [1, 186399n, false, false, 186400n], [1, 186400n, true, false, 186400n],
    [2, 200000n, true, false, 186400n], [3, 186399n, false, true, 186400n], [3, 186400n, true, true, 186400n],
  ])('uses live count %s and block time %s to select eligibility and finalization', async (count, timestamp, eligible, finalizes, nextAttemptAt) => {
    const deps = dependencies(row(), { answers: { pendingCallFailureOf: failure(count) }, block: { timestamp } });
    const state = await readPendingPayment(row(), deps);
    expect(state).toMatchObject({ eligible, finalizes, nextAttemptAt });
    if (eligible) expect(state.descriptor.functionName).toBe(finalizes ? 'finalizePendingCall' : 'processPendingCall');
    else {
      expect(state.descriptor).toBeNull();
      await expect(preparePendingPayment(row(), deps)).rejects.toThrow('cooldown');
    }
  });

  it.each([[1, 10000000n], [2, 15000000n], [3, MAXIMUM_GAS]])('funds gas exhaustion rung %s without exceeding the transaction cap', async (count, qualifiedGas) => {
    const deps = dependencies(row(), { answers: { pendingCallFailureOf: failure(count, { errorHash: EXHAUSTED }) } });
    const state = await readPendingPayment(row(), deps);
    expect(state.qualifiedGas).toBe(qualifiedGas);
    expect(state.gas).toBeLessThanOrEqual(16777216n);
    expect(state.gas).toBeGreaterThan(qualifiedGas + 750000n);
  });

  it('never lowers a prior qualified gas budget when the failure class changes', async () => {
    const state = await readPendingPayment(row(), dependencies(row(), { answers: { pendingCallFailureOf: failure(1, { highestGasLimit: 15000000n }) } }));
    expect(state.qualifiedGas).toBe(15000000n);
  });

  it('honors a lower live block ceiling while preserving the gateway gas reserves', async () => {
    const maximum = (12000000n - 1500000n) * 63n / 64n;
    const deps = dependencies(row(), { block: { gasLimit: 12000000n }, answers: { maximumQualifiedCallGas: maximum, pendingCallFailureOf: failure(3, { errorHash: EXHAUSTED, highestGasLimit: 15000000n }) } });
    const state = await readPendingPayment(row(), deps);
    expect(state.qualifiedGas).toBe(maximum);
    expect(state.gas).toBe(12000000n);
  });

  it.each([
    { pendingCallFailureOf: failure(0, { lastFailureAt: 1n }) },
    { pendingCallFailureOf: failure(1, { highestGasLimit: 1n }) },
    { pendingCallFailureOf: failure(4294967296) },
    { QUALIFIED_CALL_GAS: 1n }, { maximumQualifiedCallGas: 1n }, { RETRY_DELAY: 0n }, { FINALIZATION_FAILURE_COUNT: 4n },
  ])('rejects an unverified gateway failure state or configuration', async answers => {
    await expect(readPendingPayment(row(), dependencies(row(), { answers }))).rejects.toThrow();
  });
});

describe('saved pending payment verification', () => {
  it('reconstructs the canonical call for an unchanged saved payment', async () => {
    const call = await descriptor();
    await expect(reverifyPendingPayment(call, dependencies())).resolves.toEqual(call);
  });

  it('requires a fresh review after a competing retry, including a changed failure class at the same count', async () => {
    const call = await descriptor(1);
    const deps = dependencies(row(), { answers: { pendingCallFailureOf: failure(1, { errorHash: EXHAUSTED, highestGasLimit: 10000000n }) } });
    await expect(reverifyPendingPayment(call, deps)).rejects.toThrow('changed');
    await expect(reverifyPendingPayment(await descriptor(2), dependencies(row(), { answers: { pendingCallFailureOf: failure(3) } }))).rejects.toThrow('changed');
  });

  it('does not resend a saved call after settlement', async () => {
    await expect(reverifyPendingPayment(await descriptor(), dependencies(row(), { answers: { pendingCallCommitmentOf: ZERO_HASH } }))).rejects.toThrow('already been settled');
  });

  it('can restage the exact original call for a new review after its failure state changes', async () => {
    const original = await descriptor(2);
    const updated = await refreshPendingPayment(original, dependencies(row(), { answers: { pendingCallFailureOf: failure(3) } }));
    expect(updated.functionName).toBe('finalizePendingCall');
    expect(updated.args).toEqual(original.args);
    expect(updated.pendingPayment).toEqual(original.pendingPayment);
    expect(updated.expectedState.failure.count).toBe(3);
    await expect(refreshPendingPayment(original, dependencies(row(), { answers: { pendingCallCommitmentOf: ZERO_HASH } }))).resolves.toBeNull();
  });

  it.each(['amount', 'preferAddToBalance', 'shouldReturnHeldFees', 'beneficiary', 'projectId', 'refundTo', 'sourceProjectId', 'token', 'memo', 'metadata'])('never restages a changed original %s', async field => {
    const original = await descriptor(2);
    const mutations = { amount: 100n, preferAddToBalance: true, shouldReturnHeldFees: true, beneficiary: REFUND_TO,
      projectId: 99, refundTo: BENEFICIARY, sourceProjectId: 9, token: BENEFICIARY, memo: 'different memo', metadata: '0x123456' };
    original.pendingPayment[field] = mutations[field];
    await expect(refreshPendingPayment(original, dependencies())).rejects.toThrow();
  });

  it('rejects changed saved calldata before restaging even when its indexed row is intact', async () => {
    const original = await descriptor(); original.data = '0x12345678';
    await expect(refreshPendingPayment(original, dependencies())).rejects.toThrow('calldata changed');
  });

  it.each(['value', 'target', 'data', 'args', 'gas', 'original', 'failure'])('rejects tampered saved %s', async field => {
    const call = await descriptor();
    if (field === 'value') call.value = 1n;
    if (field === 'target') call.to = REFUND_TO;
    if (field === 'data') call.data = '0x12345678';
    if (field === 'args') call.args[1].amount = 123n;
    if (field === 'gas') call.gas = 500000n;
    if (field === 'original') call.pendingPayment.refundTo = BENEFICIARY;
    if (field === 'failure') call.expectedState.failure.count = 1;
    await expect(reverifyPendingPayment(call, dependencies())).rejects.toThrow();
  });
});

describe('gateway receipt outcomes', () => {
  it('proves settlement against the original call, gateway and identifier', async () => {
    const call = await descriptor();
    const log = eventLog('JBRouterTerminalGateway_ProcessPendingCall', { id: row().pendingCallId, call: tuple(row()), beneficiaryTokenCount: 123n, caller: BENEFICIARY });
    expect(pendingPaymentReceiptOutcome(call, receipt([log]))).toEqual({ status: 'settled', beneficiaryTokenCount: 123n });
    expect(() => pendingPaymentReceiptOutcome(call, receipt([{ ...log, address: REFUND_TO }]))).toThrow('does not prove');
    expect(() => pendingPaymentReceiptOutcome(call, receipt([{ ...log, topics: [log.topics[0], ZERO_HASH] }]))).toThrow('does not prove');
  });

  it('reports a qualified failed attempt as still pending even when its transaction succeeds', async () => {
    const log = eventLog('JBRouterTerminalGateway_RecordTerminalCallFailure', { id: row().pendingCallId, errorHash: ERROR_HASH, count: 1, nextAttemptAt: 286400n, caller: BENEFICIARY });
    expect(pendingPaymentReceiptOutcome(await descriptor(), receipt([log]))).toEqual({ status: 'pending', failureCount: 1, nextAttemptAt: 286400n, errorHash: ERROR_HASH });
  });

  it('distinguishes final settlement, accounting refund, and a changed failure class that remains pending', async () => {
    const call = await descriptor(3);
    const refund = eventLog('JBRouterTerminalGateway_RefundPendingCall', { id: row().pendingCallId, call: tuple(row()), caller: BENEFICIARY });
    expect(pendingPaymentReceiptOutcome(call, receipt([refund]))).toEqual({ status: 'refunded', beneficiaryTokenCount: 0n });
    const changed = eventLog('JBRouterTerminalGateway_RecordTerminalCallFailure', { id: row().pendingCallId, errorHash: EXHAUSTED, count: 1, nextAttemptAt: 286400n, caller: BENEFICIARY });
    expect(pendingPaymentReceiptOutcome(call, receipt([changed]))).toMatchObject({ status: 'pending', failureCount: 1 });
    expect(() => pendingPaymentReceiptOutcome({ ...call, functionName: 'processPendingCall', data: encodeFunctionData({ abi: ABI, functionName: 'processPendingCall', args: call.args }) }, receipt([refund]))).toThrow('unexpectedly reports');
  });

  it('rejects altered beneficiary, missing events, malformed logs and conflicting outcomes', async () => {
    const call = await descriptor();
    const log = eventLog('JBRouterTerminalGateway_ProcessPendingCall', { id: row().pendingCallId, call: tuple(row()), beneficiaryTokenCount: 1n, caller: BENEFICIARY });
    const redirected = eventLog('JBRouterTerminalGateway_ProcessPendingCall', { id: row().pendingCallId, call: { ...tuple(row()), beneficiary: REFUND_TO }, beneficiaryTokenCount: 1n, caller: BENEFICIARY });
    expect(() => pendingPaymentReceiptOutcome(call, receipt([redirected]))).toThrow('different original call');
    expect(() => pendingPaymentReceiptOutcome(call, receipt([]))).toThrow('does not prove');
    expect(() => pendingPaymentReceiptOutcome(call, receipt([{ ...log, data: '0x1234' }]))).toThrow('could not be verified');
    expect(() => pendingPaymentReceiptOutcome(call, receipt([{ ...log, removed: true }]))).toThrow('removed');
    expect(() => pendingPaymentReceiptOutcome(call, receipt([log, log]))).toThrow('conflicting');
    expect(() => pendingPaymentReceiptOutcome(call, { status: 'reverted', logs: [log] })).toThrow('not verified');
  });

  it('accepts an authoritative failure after another keeper retried before delayed Safe execution', async () => {
    const call = await descriptor();
    const log = eventLog('JBRouterTerminalGateway_RecordTerminalCallFailure', { id: row().pendingCallId, errorHash: ERROR_HASH, count: 2, nextAttemptAt: 386400n, caller: BENEFICIARY });
    expect(pendingPaymentReceiptOutcome(call, receipt([log]))).toMatchObject({ status: 'pending', failureCount: 2 });
  });

  it.each([{ count: 0 }, { errorHash: ZERO_HASH }, { nextAttemptAt: 0n }])('rejects malformed qualified failure evidence', async changed => {
    const log = eventLog('JBRouterTerminalGateway_RecordTerminalCallFailure', { id: row().pendingCallId, errorHash: ERROR_HASH, count: 1, nextAttemptAt: 286400n, caller: BENEFICIARY, ...changed });
    const call = await descriptor();
    expect(() => pendingPaymentReceiptOutcome(call, receipt([log]))).toThrow('malformed');
  });
});
