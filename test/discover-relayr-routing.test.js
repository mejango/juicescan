import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, stringToHex } from 'viem';

const runtime = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111', transactions: {}, wallet: null, rpc: vi.fn(), estimate: 100000n }));
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(), getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account,
  getWalletClient: () => runtime.wallet,
  confirmTransactionModal: vi.fn().mockResolvedValue(true), switchChain: vi.fn(),
  waitForTrackedTransactionReceipt: vi.fn(async (_client, hash) => ({ status: 'success', transactionHash: hash, blockNumber: 100n })),
  createPublicClientForChain: cid => ({ request: (...args) => runtime.rpc(...args), estimateGas: vi.fn(async () => runtime.estimate),
    getTransaction: vi.fn(async ({ hash }) => runtime.transactions[hash]),
  }),
}));
vi.mock('../src/relayr.js', async importOriginal => ({
  ...await importOriginal(),
  buildForwardedTx: vi.fn(async (cid, _account, to, data) => ({ chain: cid, target: to, data, value: '0' })),
  relayrSupportsForwarding: vi.fn().mockResolvedValue(true), relayrPostBundle: vi.fn(), relayrPay: vi.fn(), relayrPoll: vi.fn(),
}));

import { buildForwardedTx, relayrPay, relayrPoll, relayrPostBundle, relayrSupportsForwarding, saveRelayrPendingSession } from '../src/relayr.js';
import { confirmTransactionModal, waitForTrackedTransactionReceipt } from '../src/component-base.js';
import { runProjectPayerRelayrDeploys, runRelayrAcrossChains, shouldUseRelayrForChains } from '../src/discover.js';

const ACCOUNT = runtime.account, TARGET = '0x2222222222222222222222222222222222222222';
const A = `0x${'aa'.repeat(32)}`, B = `0x${'bb'.repeat(32)}`;
const CHAINS = [{ id: 84532, name: 'Base Sepolia' }, { id: 11155420, name: 'OP Sepolia' }];
const CALLS = CHAINS.map((chain, index) => ({ chainId: chain.id, to: TARGET, data: index ? '0x87654321' : '0x12345678' }));
const SCOPE = 'testnet-policy-upgrade';
function seed(hashes = [A, null]) {
  const identity = keccak256(stringToHex(JSON.stringify(CALLS.map(call => [call.chainId, call.to.toLowerCase(), call.data.toLowerCase(), '0']))));
  localStorage.setItem(`jb-direct-batch-v1:${ACCOUNT}:${SCOPE}`, JSON.stringify({ identity, hashes }));
  runtime.transactions[A] = { from: ACCOUNT, to: TARGET, input: CALLS[0].data, value: 0n };
}
const run = calls => runRelayrAcrossChains(CHAINS, ACCOUNT, cid => (calls || CALLS).find(call => call.chainId === cid), 500000n, vi.fn(), { pendingScope: SCOPE });

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); runtime.transactions = {};
  runtime.rpc.mockResolvedValue('0x'); runtime.estimate = 100000n;
  runtime.wallet = { getChainId: vi.fn(async () => 11155420), sendTransaction: vi.fn(async () => B) };
  relayrPostBundle.mockRejectedValue(new Error('Reached the Relayr quote boundary'));
  relayrSupportsForwarding.mockResolvedValue(true);
});

describe('Discover routing after testnet Relayr enablement', () => {
  it('selects fresh testnet multichain Relayr while rejecting mixed network families', async () => {
    expect(shouldUseRelayrForChains(CHAINS)).toBe(true);
    expect(shouldUseRelayrForChains([8453, 84532])).toBe(false);
    expect(shouldUseRelayrForChains([84532])).toBe(false);
    await expect(run()).rejects.toThrow(/Relayr quote boundary/);
    expect(buildForwardedTx.mock.calls.map(args => args[0])).toEqual([84532, 11155420]);
    expect(relayrPostBundle).toHaveBeenCalledOnce(); expect(runtime.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('keeps an old direct batch direct, verifies its completed leg, and sends only its remaining exact call', async () => {
    seed(); const result = await run();
    expect(result).toMatchObject({ direct: true, expectedCount: 2 });
    expect(waitForTrackedTransactionReceipt.mock.calls.map(args => args[1])).toEqual([A, B]);
    expect(runtime.wallet.sendTransaction).toHaveBeenCalledOnce();
    expect(runtime.wallet.sendTransaction).toHaveBeenCalledWith(expect.objectContaining({ to: TARGET, data: CALLS[1].data, account: ACCOUNT }));
    expect(buildForwardedTx).not.toHaveBeenCalled(); expect(relayrSupportsForwarding).not.toHaveBeenCalled(); expect(relayrPostBundle).not.toHaveBeenCalled();
  });

  it('blocks a changed old direct batch before Relayr signatures or a second direct send', async () => {
    seed(); await expect(run([{ ...CALLS[0], data: '0xaabb' }, CALLS[1]])).rejects.toThrow(/original inputs/);
    expect(buildForwardedTx).not.toHaveBeenCalled(); expect(relayrPostBundle).not.toHaveBeenCalled(); expect(runtime.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('retains an old hashless wallet submission instead of moving it to Relayr', async () => {
    seed([A, 'sending']); await expect(run()).rejects.toThrow(/wallet request was interrupted/);
    expect(waitForTrackedTransactionReceipt).toHaveBeenCalledOnce(); expect(runtime.wallet.sendTransaction).not.toHaveBeenCalled();
    expect(buildForwardedTx).not.toHaveBeenCalled(); expect(relayrPostBundle).not.toHaveBeenCalled();
  });

  it('sends an ordered array of calls for one chain sequentially with per-step labels, never through Relayr', async () => {
    runtime.wallet = { getChainId: vi.fn(async () => 84532), sendTransaction: vi.fn(async ({ data }) => (data === '0x12345678' ? A : B)) };
    const batch = [{ to: TARGET, data: '0x12345678', step: 'Set buyback hook' }, { to: TARGET, data: '0x87654321', step: 'Set router terminal' }];
    const result = await runRelayrAcrossChains([CHAINS[0]], ACCOUNT, () => batch, 500000n, vi.fn(), { pendingScope: 'batch-scope' });
    expect(result).toMatchObject({ direct: true, expectedCount: 2 });
    expect(runtime.wallet.sendTransaction.mock.calls.map(call => call[0].data)).toEqual(['0x12345678', '0x87654321']);
    expect(confirmTransactionModal.mock.calls.map(call => [call[1].steps, call[1].stepIndex])).toEqual([
      [['Set buyback hook on Base Sepolia', 'Set router terminal on Base Sepolia'], 0],
      [['Set buyback hook on Base Sepolia', 'Set router terminal on Base Sepolia'], 1],
    ]);
    expect(buildForwardedTx).not.toHaveBeenCalled(); expect(relayrPostBundle).not.toHaveBeenCalled();
  });

  it('keeps qualified retries direct across chains and bounds their larger gas allowance after review', async () => {
    runtime.estimate = 9000000n;
    const limit = vi.fn(async () => 16777216n);
    await runRelayrAcrossChains(CHAINS, ACCOUNT, cid => CALLS.find(call => call.chainId === cid), 500000n, vi.fn(), {
      pendingScope: 'qualified-routing', forceDirect: true, gasLimitForCall: limit,
    });
    expect(limit).toHaveBeenCalledTimes(2);
    expect(runtime.wallet.sendTransaction).toHaveBeenCalledTimes(2);
    expect(runtime.wallet.sendTransaction.mock.calls.every(([request]) => request.gas === 16777216n && request.value === 0n)).toBe(true);
    expect(runtime.rpc.mock.calls.every(([request]) => request.params[0].gas === '0x1000000')).toBe(true);
    expect(buildForwardedTx).not.toHaveBeenCalled();
    expect(relayrPostBundle).not.toHaveBeenCalled();
  });

  it('rejects excess gas on ordinary actions and rejects qualified caps above the transaction ceiling', async () => {
    await expect(runRelayrAcrossChains([CHAINS[0]], ACCOUNT, () => CALLS[0], 6000000n, vi.fn(), {
      pendingScope: 'ordinary-gas-limit',
    })).rejects.toThrow('outside the supported direct-send range');
    await expect(runRelayrAcrossChains([CHAINS[0]], ACCOUNT, () => CALLS[0], 500000n, vi.fn(), {
      pendingScope: 'invalid-qualified-gas', gasLimitForCall: async () => 16777217n,
    })).rejects.toThrow('outside the supported direct-send range');
    expect(runtime.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('also preserves the old direct transport at the permissionless payer helper boundary', async () => {
    seed(); await expect(runProjectPayerRelayrDeploys(CALLS, vi.fn(), SCOPE)).resolves.toMatchObject({ direct: true });
    expect(runtime.wallet.sendTransaction).toHaveBeenCalledOnce();
    expect(buildForwardedTx).not.toHaveBeenCalled(); expect(relayrPostBundle).not.toHaveBeenCalled();
  });

  it('quotes fresh testnet payer deployments directly without forwarded wallet signatures', async () => {
    await expect(runProjectPayerRelayrDeploys(CALLS, vi.fn(), SCOPE)).rejects.toThrow(/Relayr quote boundary/);
    expect(relayrPostBundle).toHaveBeenCalledWith(CALLS.map(call => ({ chain: call.chainId, target: call.to, data: call.data, value: '0' })),
      { scope: SCOPE, account: ACCOUNT, chains: CHAINS });
    expect(buildForwardedTx).not.toHaveBeenCalled(); expect(runtime.wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it('stops ambiguous scopes containing both direct receipts and a Relayr request', async () => {
    seed(); saveRelayrPendingSession(SCOPE, { bundleUuid: '01234567-89ab-cdef-0123-456789abcdef', account: ACCOUNT, paymentState: 'sending', expectedCount: 2, chains: CHAINS });
    await expect(run()).rejects.toThrow(/Both direct transaction receipts and a Relayr request/);
    await expect(runProjectPayerRelayrDeploys(CALLS, vi.fn(), SCOPE)).rejects.toThrow(/Both direct payer receipts/);
    expect(relayrPoll).not.toHaveBeenCalled(); expect(relayrPay).not.toHaveBeenCalled(); expect(runtime.wallet.sendTransaction).not.toHaveBeenCalled();
  });
});
