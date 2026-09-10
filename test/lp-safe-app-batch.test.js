// Adding liquidity from inside the Safe App proposes the whole sequence ONCE (approve → Permit2.approve → mint) as
// an ordered Safe App batch after simulating it from the Safe; every other connection keeps the per-step sends.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';

const runtime = vi.hoisted(() => ({ safeApp: true, erc20Allowance: 0n, permit2: [0n, 0n, 0n], pending: [], wallet: null, client: null }));
const SAFE = '0x2222222222222222222222222222222222222222';
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(), getAccount: () => SAFE, getEffectiveAccount: () => SAFE, getWalletClient: () => runtime.wallet,
  isSafeConnected: () => runtime.safeApp, createPublicClientForChain: () => runtime.client, switchChain: vi.fn(),
  waitForTrackedTransactionReceipt: vi.fn(async (_c, hash) => ({ status: 'success', transactionHash: hash })),
}));
vi.mock('../src/safe-app.js', async importOriginal => ({ ...await importOriginal(), proposeSafeTransactions: vi.fn(async () => '0x' + 'ab'.repeat(32)) }));
vi.mock('../src/safe.js', async importOriginal => ({ ...await importOriginal(), listPendingSafeTxs: vi.fn(async () => runtime.pending) }));

import { proposeSafeTransactions } from '../src/safe-app.js';
import { lpAddLiquidityCalls, runAddLiquidityTxs } from '../src/discover.js';
import { encodeMultiSend, MULTI_SEND_CALL_ONLY } from '../src/safe-batch.js';

const TOKEN = '0x3333333333333333333333333333333333333333', POSM = '0x4444444444444444444444444444444444444444';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const erc20Abi = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }];
const permit2Abi = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint160' }, { type: 'uint48' }], outputs: [] }];
const posmAbi = [{ type: 'function', name: 'modifyLiquidities', stateMutability: 'payable', inputs: [{ type: 'bytes' }, { type: 'uint256' }], outputs: [] }];
const NOW = 1_800_000_000, DL = 86400;
const prep = () => ({ acct: SAFE, posm: POSM, erc20: [{ currency: TOKEN, max: 1000n, approved: false, permitReady: false }], unlockData: '0x1234', value: 5n, smartWallet: true, deadlineSecs: DL, pair: { addr: null, symbol: 'ETH', decimals: 18, isNative: true } });
const plan = () => ({ now: NOW, deadline: BigInt(NOW + DL) });
const decode = (abi, data) => decodeFunctionData({ abi, data }).args;

beforeEach(() => {
  vi.clearAllMocks();
  runtime.safeApp = true; runtime.erc20Allowance = 0n; runtime.permit2 = [0n, 0n, 0n]; runtime.pending = [];
  runtime.wallet = { getChainId: vi.fn(async () => 8453), writeContract: vi.fn(async () => '0x' + 'cd'.repeat(32)) };
  runtime.client = {
    readContract: vi.fn(async ({ functionName, address }) => (functionName === 'allowance' && address === PERMIT2 ? runtime.permit2 : runtime.erc20Allowance)),
    request: vi.fn(async ({ method, params }) => (method === 'eth_simulateV1' ? [{ calls: params[0].blockStateCalls[0].calls.map(() => ({ status: '0x1' })) }] : '0x')),
    simulateContract: vi.fn(async (request) => ({ request })),
    estimateContractGas: vi.fn(async () => 100000n),
  };
});

describe('lpAddLiquidityCalls', () => {
  it('builds the ordered approve → Permit2.approve → mint calls from the needs list, marking only the mint dependent', () => {
    const calls = lpAddLiquidityCalls(prep(), [{ approve: true, permit2: true }], NOW, DL, BigInt(NOW + DL));
    expect(calls.map(c => [c.label, c.to, c.value, !!c.dependsOnPrior])).toEqual([
      ['Approve token for Permit2', TOKEN, 0n, false], ['Approve on Permit2', PERMIT2, 0n, false], ['Mint the position', POSM, 5n, true],
    ]);
    expect(decode(erc20Abi, calls[0].data)).toEqual([PERMIT2, 1000n]);
    expect(decode(permit2Abi, calls[1].data)).toEqual([TOKEN, POSM, 1000n, NOW + 30 * 24 * 3600]);
    expect(decode(posmAbi, calls[2].data)).toEqual(['0x1234', BigInt(NOW + DL)]);
    expect(lpAddLiquidityCalls(prep(), [{ approve: false, permit2: false }], NOW, DL, 1n).map(c => c.label)).toEqual(['Mint the position']);
  });
});

describe('runAddLiquidityTxs inside the Safe App', () => {
  it('simulates from the Safe, then proposes the ordered calls ONCE and never sends step by step', async () => {
    const queued = vi.fn(); document.addEventListener('jb:safe-queued', queued);
    const status = vi.fn();
    const result = await runAddLiquidityTxs(8453, prep(), status, plan());
    expect(result).toEqual({ safeTxHash: '0x' + 'ab'.repeat(32), calls: 3 });
    expect(proposeSafeTransactions).toHaveBeenCalledOnce();
    const txs = proposeSafeTransactions.mock.calls[0][0];
    expect(txs.map(t => [t.to, t.value, t.data.slice(0, 10)])).toEqual([[TOKEN, '0', '0x095ea7b3'], [PERMIT2, '0', '0x87517c45'], [POSM, '0x5', '0xdd46508f']]);
    expect(decode(permit2Abi, txs[1].data)).toEqual([TOKEN, POSM, 1000n, NOW + 30 * 24 * 3600]);
    expect(decode(posmAbi, txs[2].data)).toEqual(['0x1234', BigInt(NOW + DL)]);
    const simulate = runtime.client.request.mock.calls[0][0];
    expect(simulate.method).toBe('eth_simulateV1');
    expect(simulate.params[0].blockStateCalls[0].calls.map(c => [c.from, c.to, c.value])).toEqual([[SAFE, TOKEN, '0x0'], [SAFE, PERMIT2, '0x0'], [SAFE, POSM, '0x5']]);
    expect(runtime.wallet.writeContract).not.toHaveBeenCalled();
    expect(queued).toHaveBeenCalledOnce();
    expect(status.mock.calls.map(c => c[0])).toEqual(['Simulating the batch from your Safe…', 'Proposing the batch of 3 calls to your Safe — confirm in Safe{Wallet}…']);
    document.removeEventListener('jb:safe-queued', queued);
  });

  it('skips steps the live allowances already satisfy and falls back to the single direct send when one call remains', async () => {
    runtime.erc20Allowance = 1000n; runtime.permit2 = [1000n, BigInt(NOW + 10 * 86400), 0n];
    const result = await runAddLiquidityTxs(8453, prep(), vi.fn(), plan());
    expect(result).toBe('0x' + 'cd'.repeat(32));
    expect(proposeSafeTransactions).not.toHaveBeenCalled();
    expect(runtime.wallet.writeContract).toHaveBeenCalledOnce();
    expect(runtime.wallet.writeContract.mock.calls[0][0]).toMatchObject({ address: POSM, functionName: 'modifyLiquidities', value: 5n });
  });

  it('refuses to double-propose when the mint already sits inside a queued Safe batch', async () => {
    const mint = lpAddLiquidityCalls(prep(), [{ approve: true, permit2: true }], NOW, DL, BigInt(NOW + DL));
    runtime.pending = [{ nonce: 4, to: MULTI_SEND_CALL_ONLY, operation: 1, data: encodeMultiSend(mint) }];
    await expect(runAddLiquidityTxs(8453, prep(), vi.fn(), plan())).rejects.toThrow(/The token approval is already queued in your Safe \(nonce 4\)/);
    expect(proposeSafeTransactions).not.toHaveBeenCalled();
    expect(runtime.client.request).not.toHaveBeenCalled();
  });

  it('keeps stepping one transaction at a time for a smart wallet outside the Safe App', async () => {
    runtime.safeApp = false;
    const result = await runAddLiquidityTxs(8453, prep(), vi.fn(), plan());
    expect(result).toBe('0x' + 'cd'.repeat(32));
    expect(proposeSafeTransactions).not.toHaveBeenCalled();
    expect(runtime.wallet.writeContract.mock.calls.map(c => [c[0].address, c[0].functionName])).toEqual([[TOKEN, 'approve'], [PERMIT2, 'approve'], [POSM, 'modifyLiquidities']]);
    expect(runtime.client.simulateContract.mock.calls[1][0].args).toEqual([TOKEN, POSM, 1000n, BigInt(NOW + 30 * 24 * 3600)]);
  });
});
