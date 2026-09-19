// The two new wallet primitives: an operation-1 SafeTx proposal (hash, typed message, POST body) and the ordered
// MultiSend proposal through the Safe App — plus the simulation gate in front of both.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashTypedData } from 'viem';

const runtime = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111', wallet: null, client: null }));
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(), getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account,
  getWalletClient: () => runtime.wallet, switchChain: vi.fn(), createPublicClientForChain: () => runtime.client,
}));
vi.mock('../src/safe-app.js', async importOriginal => ({ ...await importOriginal(), proposeSafeTransactions: vi.fn(async () => '0x' + 'ab'.repeat(32)) }));
vi.mock('../src/safe.js', async importOriginal => ({
  ...await importOriginal(), proposeSafeTx: vi.fn(async () => ({ safeTxHash: '0x' + 'cd'.repeat(32) })),
  getSafeNextNonce: vi.fn(async () => 5), listPendingSafeTxs: vi.fn(async () => [{ nonce: 7 }, { nonce: 6 }]),
}));

import { proposeSafeTransactions } from '../src/safe-app.js';
import { proposeSafeTx, getSafeNextNonce, safeTxHashForCall } from '../src/safe.js';
import { buildStep, composeBatch, dependsOnPrior, encodeMultiSend, MULTI_SEND_CALL_ONLY, NATIVE_TOKEN } from '../src/safe-batch.js';
import { proposeBatchAsOwner, proposeBatchThroughSafeApp, simulateBatchCalls } from '../src/safe-batch-ui.js';

const OWNER = runtime.account, SAFE = '0x2222222222222222222222222222222222222222', ZERO = '0x0000000000000000000000000000000000000000';
const SIGNATURE = '0x' + '12'.repeat(65);
const steps = () => [
  buildStep('setHookFor', { chainId: 11155111, projectId: 2, values: { hook: '0xB222Da5A71e8FB89a5A38b7c920EaB5DfbC74B91' } }),
  buildStep('setPoolFor', { chainId: 11155111, projectId: 2, values: { fee: 10000, tickSpacing: 200, twapWindow: 1800, terminalToken: NATIVE_TOKEN } }),
  buildStep('setTerminalFor', { chainId: 11155111, projectId: 2, values: { terminal: '0x4a56AEf5b6A5b9742AbB02cA67C5a85ba183D901' } }),
];
const calls = () => composeBatch(steps()).calls;
const flags = () => steps().map((_, i) => dependsOnPrior(steps(), i));
const simulateOk = n => [{ calls: Array.from({ length: n }, () => ({ status: '0x1', returnData: '0x' })) }];
const unsupported = () => Object.assign(new Error('Method not found'), { code: -32601 });

beforeEach(() => {
  vi.clearAllMocks();
  runtime.wallet = { getChainId: vi.fn(async () => 11155111), signTypedData: vi.fn(async () => SIGNATURE) };
  runtime.client = { getCode: vi.fn(async () => '0x6080'), request: vi.fn(async ({ method, params }) => (method === 'eth_simulateV1' ? simulateOk(params[0].blockStateCalls[0].calls.length) : '0x')) };
});

describe('operation-1 SafeTx proposal', () => {
  it('signs, hashes, and POSTs the MultiSendCallOnly transaction with operation 1', async () => {
    const original = await vi.importActual('../src/safe.js');
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 201 }; }));
    const data = encodeMultiSend(calls());
    const result = await original.proposeSafeTx({ chainId: 1, safe: SAFE, to: MULTI_SEND_CALL_ONLY, data, value: 0, operation: 1, signer: OWNER, nonce: 9 });
    const expected = hashTypedData({
      domain: { chainId: 1, verifyingContract: SAFE },
      types: { SafeTx: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' }, { name: 'safeTxGas', type: 'uint256' }, { name: 'baseGas', type: 'uint256' }, { name: 'gasPrice', type: 'uint256' }, { name: 'gasToken', type: 'address' }, { name: 'refundReceiver', type: 'address' }, { name: 'nonce', type: 'uint256' }] },
      primaryType: 'SafeTx',
      message: { to: MULTI_SEND_CALL_ONLY, value: 0n, data, operation: 1, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: ZERO, refundReceiver: ZERO, nonce: 9n },
    });
    expect(result.safeTxHash).toBe(expected);
    expect(original.safeTxHashForCall(1, SAFE, { to: MULTI_SEND_CALL_ONLY, data, value: 0, nonce: 9, operation: 1 })).toBe(expected);
    expect(original.safeTxHashForCall(1, SAFE, { to: MULTI_SEND_CALL_ONLY, data, value: 0, nonce: 9 })).not.toBe(expected);
    expect(original.safeTxHashForQueuedTx(1, SAFE, result.tx)).toBe(expected);
    expect(result.tx.operation).toBe(1);
    expect(runtime.wallet.signTypedData.mock.calls[0][0].message.operation).toBe(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ to: MULTI_SEND_CALL_ONLY, operation: 1, data, value: '0', nonce: '9', contractTransactionHash: expected, signature: SIGNATURE, safeTxGas: '0', gasToken: ZERO });
    await expect(original.proposeSafeTx({ chainId: 1, safe: SAFE, to: MULTI_SEND_CALL_ONLY, data, operation: 2, signer: OWNER, nonce: 9 })).rejects.toThrow(/Unsupported Safe operation/);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('owner route', () => {
  it('simulates the whole sequence, then proposes ONE operation-1 SafeTx past the queued nonces', async () => {
    const status = vi.fn();
    const result = await proposeBatchAsOwner({ chainId: 11155111, chainName: 'Sepolia', safe: SAFE, signer: OWNER, calls: calls(), dependsOnPrior: flags(), setStatus: status });
    expect(runtime.client.getCode).toHaveBeenCalledWith({ address: MULTI_SEND_CALL_ONLY });
    expect(runtime.client.request.mock.calls[0][0].method).toBe('eth_simulateV1');
    expect(runtime.client.request.mock.calls[0][0].params[0].blockStateCalls[0].calls.map(c => c.from)).toEqual([SAFE, SAFE, SAFE]);
    expect(proposeSafeTx).toHaveBeenCalledOnce();
    expect(proposeSafeTx).toHaveBeenCalledWith({ chainId: 11155111, safe: SAFE, to: MULTI_SEND_CALL_ONLY, data: encodeMultiSend(calls()), value: 0, operation: 1, signer: OWNER, nonce: 8 });
    expect(result).toEqual({ safeTxHash: '0x' + 'cd'.repeat(32), nonce: 8, executed: false });
    expect(getSafeNextNonce).toHaveBeenCalledWith(11155111, SAFE);
  });

  it('refuses without MultiSendCallOnly code and never proposes a reverting sequence', async () => {
    runtime.client.getCode.mockResolvedValue('0x');
    await expect(proposeBatchAsOwner({ chainId: 11155111, chainName: 'Sepolia', safe: SAFE, signer: OWNER, calls: calls(), dependsOnPrior: flags(), setStatus: vi.fn() })).rejects.toThrow(/MultiSendCallOnly isn’t deployed on Sepolia/);
    runtime.client.getCode.mockResolvedValue('0x6080');
    runtime.client.request.mockResolvedValue([{ calls: [{ status: '0x1' }, { status: '0x0', error: { message: 'PoolAlreadySet' } }, { status: '0x1' }] }]);
    await expect(proposeBatchAsOwner({ chainId: 11155111, chainName: 'Sepolia', safe: SAFE, signer: OWNER, calls: calls(), dependsOnPrior: flags(), setStatus: vi.fn() })).rejects.toThrow(/Step 2 would revert: PoolAlreadySet/);
    expect(proposeSafeTx).not.toHaveBeenCalled();
  });
});

describe('Safe App route', () => {
  it('proposes the ordered {to, value, data} list as one Safe App transaction batch after simulating from the Safe', async () => {
    const result = await proposeBatchThroughSafeApp({ chainId: 11155111, chainName: 'Sepolia', authority: SAFE, calls: calls(), dependsOnPrior: flags(), setStatus: vi.fn() });
    expect(proposeSafeTransactions).toHaveBeenCalledOnce();
    expect(proposeSafeTransactions).toHaveBeenCalledWith(calls().map(c => ({ to: c.to, value: '0', data: c.data })));
    expect(result).toEqual({ safeTxHash: '0x' + 'ab'.repeat(32), executed: false });
    expect(runtime.client.request.mock.calls[0][0].params[0].blockStateCalls[0].calls[0].from).toBe(SAFE);
  });

  it('refuses when the Safe App is on another network', async () => {
    runtime.wallet.getChainId.mockResolvedValue(8453);
    await expect(proposeBatchThroughSafeApp({ chainId: 11155111, chainName: 'Sepolia', authority: SAFE, calls: calls(), dependsOnPrior: flags(), setStatus: vi.fn() })).rejects.toThrow(/Open this Safe on Sepolia/);
    expect(proposeSafeTransactions).not.toHaveBeenCalled();
  });
});

describe('simulation gate', () => {
  it('falls back to per-call eth_call when eth_simulateV1 is unavailable, skipping steps that depend on a prior step', async () => {
    runtime.client.request.mockImplementation(async ({ method }) => { if (method === 'eth_simulateV1') throw unsupported(); return '0x'; });
    const result = await simulateBatchCalls(runtime.client, SAFE, calls(), flags());
    expect(result).toEqual({ method: 'eth_call', simulated: 2 });
    const methods = runtime.client.request.mock.calls.map(c => c[0].method);
    expect(methods).toEqual(['eth_simulateV1', 'eth_call', 'eth_call']);
    expect(runtime.client.request.mock.calls[1][0].params[0].data).toBe(calls()[0].data);
    expect(runtime.client.request.mock.calls[2][0].params[0].data).toBe(calls()[2].data);
  });

  it('surfaces a reverting fallback call and any other simulation failure without proposing', async () => {
    runtime.client.request.mockImplementation(async ({ method, params }) => {
      if (method === 'eth_simulateV1') throw unsupported();
      if (params[0].data === calls()[2].data) throw new Error('TerminalNotAllowed');
      return '0x';
    });
    await expect(simulateBatchCalls(runtime.client, SAFE, calls(), flags())).rejects.toThrow(/Step 3 would revert: TerminalNotAllowed/);
    runtime.client.request.mockRejectedValue(new Error('rate limited'));
    await expect(simulateBatchCalls(runtime.client, SAFE, calls(), flags())).rejects.toThrow(/batch simulation failed: rate limited/);
    expect(runtime.client.request.mock.calls.at(-1)[0].params[0].validation).toBe(false);
    runtime.client.request.mockRejectedValue(Object.assign(new Error('Missing or invalid parameters.'), { shortMessage: 'Missing or invalid parameters.', details: 'intrinsic gas too high' }));
    await expect(simulateBatchCalls(runtime.client, SAFE, calls(), flags())).rejects.toThrow(/batch simulation failed: intrinsic gas too high/);
    runtime.client.request.mockResolvedValue([{ calls: [{ status: '0x1' }] }]);
    await expect(simulateBatchCalls(runtime.client, SAFE, calls(), flags())).rejects.toThrow(/unexpected shape/);
  });
});
