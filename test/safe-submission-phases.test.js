import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111',
  wallet: null, client: null, receipt: null, stages: [] }));
vi.mock('../src/component-base.js', () => ({
  getWalletClient: () => state.wallet, getAccount: () => state.account,
  createPublicClientForChain: () => state.client, switchChain: vi.fn(),
  getViewAs: () => null, VIEW_AS_TX_ERROR: 'View as is read-only.',
  waitForTrackedTransactionReceipt: () => state.receipt(), ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
}));
import { approveSafeHashOnChain, confirmSafeTx, executeSafeTx, proposeSafeTx,
  safeTxHashForQueuedTx, SAFE_EXECUTION_SUCCESS_TOPIC } from '../src/safe.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const SAFE = '0x2222222222222222222222222222222222222222';
const TARGET = '0x3333333333333333333333333333333333333333';
const HASH = '0x' + 'ab'.repeat(32), SIGNATURE = '0x' + '12'.repeat(65);
const tx = () => ({ to: TARGET, data: '0x1234', value: '0', operation: 0, nonce: 9,
  confirmations: [{ owner: OWNER, signature: SIGNATURE }] });
const proposal = (extra = {}) => ({ chainId: 1, safe: SAFE, to: TARGET, data: '0x1234', signer: OWNER, nonce: 9, ...extra });
const structuredRejection = () => Object.assign(new Error('Wallet refused'), { code: 4001 });
const reverify = () => { state.stages.push('reverify'); };
const onPublishing = () => { state.stages.push('publishing'); };
const onSending = () => { state.stages.push('sending'); };

beforeEach(() => {
  localStorage.clear(); state.account = OWNER; state.stages = [];
  state.wallet = {
    getChainId: vi.fn(async () => 1),
    signTypedData: vi.fn(async () => { state.stages.push('signature'); return SIGNATURE; }),
    writeContract: vi.fn(async () => { state.stages.push('wallet'); return HASH; }),
  };
  state.client = {
    request: vi.fn(async ({ params }) => { state.stages.push('simulation'); return params[0].data.startsWith('0x6a761202') ? '0x' + '0'.repeat(63) + '1' : '0x'; }),
    getBlock: vi.fn(async () => ({ baseFeePerGas: 1n })),
    estimateContractGas: vi.fn(async () => { state.stages.push('estimate'); return 100000n; }),
  };
  state.receipt = vi.fn(async () => ({ status: 'success', transactionHash: HASH, logs: [{ address: SAFE,
    topics: [SAFE_EXECUTION_SUCCESS_TOPIC, safeTxHashForQueuedTx(1, SAFE, tx())], data: '0x' + '0'.repeat(64) }] }));
  vi.stubGlobal('fetch', vi.fn(async () => { state.stages.push('POST'); return { ok: true, status: 201 }; }));
});

describe('Safe service publication phase', () => {
  it.each(['proposal', 'confirmation'])('journals %s only after signing and final verification, immediately before POST', async kind => {
    if (kind === 'proposal') await proposeSafeTx(proposal({ reverify, onPublishing }));
    else await confirmSafeTx(1, SAFE, { ...tx(), safeTxHash: HASH }, OWNER, reverify, onPublishing);
    expect(state.stages).toEqual(['signature', 'reverify', 'publishing', 'POST']);
  });

  it.each([4001, 'ACTION_REJECTED'])('marks structured signature rejection %s unsent without opening publication', async code => {
    state.wallet.signTypedData.mockRejectedValue(Object.assign(new Error('Wrapped'), { cause: Object.assign(new Error('Declined'), { code }) }));
    const publish = vi.fn();
    await expect(proposeSafeTx(proposal({ onPublishing: publish }))).rejects.toMatchObject({ safeRequestNotSubmitted: true });
    await expect(confirmSafeTx(1, SAFE, { ...tx(), safeTxHash: HASH }, OWNER, null, publish)).rejects.toMatchObject({ safeRequestNotSubmitted: true });
    expect(publish).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('does not journal a failed final verifier and lets publication persistence failure prevent POST', async () => {
    const publish = vi.fn();
    await expect(proposeSafeTx(proposal({ reverify: () => { throw new Error('Authority changed'); }, onPublishing: publish }))).rejects.toThrow('Authority changed');
    expect(publish).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    publish.mockRejectedValue(new Error('Storage unavailable'));
    await expect(proposeSafeTx(proposal({ onPublishing: publish }))).rejects.toThrow('Storage unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains POST uncertainty even if the HTTP error contains a rejection code', async () => {
    vi.mocked(fetch).mockRejectedValue(structuredRejection());
    let error;
    try { await proposeSafeTx(proposal({ onPublishing })); } catch (caught) { error = caught; }
    expect(state.stages).toEqual(['signature', 'publishing']);
    expect(error.code).toBe(4001); expect(error.safeRequestNotSubmitted).not.toBe(true);
  });

  it('starts the publication journal at actual queue dispatch, not while waiting for a service slot', async () => {
    const release = [];
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => release.push(() => resolve({ ok: true, status: 201 }))));
    const publish = vi.fn();
    const requests = Array.from({ length: 4 }, (_, nonce) => proposeSafeTx(proposal({ nonce, onPublishing: publish })));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(publish).toHaveBeenCalledTimes(3);
    release[0]();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(publish).toHaveBeenCalledTimes(4);
    release.slice(1).forEach(done => done());
    await Promise.all(requests);
  });
});

describe('Safe wallet submission phase', () => {
  it.each(['approval', 'execution'])('journals %s after simulation, gas estimate and final verification', async kind => {
    if (kind === 'approval') await approveSafeHashOnChain(1, SAFE, HASH, reverify, onSending);
    else await executeSafeTx(1, SAFE, tx(), reverify, null, onSending);
    expect(state.stages).toEqual(['reverify', 'simulation', 'estimate', 'reverify', 'sending', 'wallet']);
  });

  it.each([4001, 'ACTION_REJECTED'])('marks a definite write rejection %s with no hash as unsent', async code => {
    state.wallet.writeContract.mockRejectedValue(Object.assign(new Error('Wrapped'), { cause: Object.assign(new Error('Declined'), { code }) }));
    await expect(approveSafeHashOnChain(1, SAFE, HASH, null, onSending)).rejects.toMatchObject({ safeRequestNotSubmitted: true });
    expect(state.stages).toContain('sending'); expect(state.receipt).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error('Request rejected by RPC transport'), { code: -32603 }),
    Object.assign(new Error('Rejected but hash present'), { code: 4001, hash: HASH }),
    new Error('User rejected the request'),
  ])('does not infer no submission from ambiguous transport or wording %#', async error => {
    state.wallet.writeContract.mockRejectedValue(error);
    await expect(approveSafeHashOnChain(1, SAFE, HASH, null, onSending)).rejects.toBe(error);
    expect(error.safeRequestNotSubmitted).not.toBe(true);
  });

  it('does not mark receipt-tracking errors unsent after a wallet hash exists', async () => {
    state.receipt.mockRejectedValue(structuredRejection());
    let error;
    try { await executeSafeTx(1, SAFE, tx(), null, null, onSending); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: 'SAFE_TX_SUBMITTED', hash: HASH });
    expect(error.safeRequestNotSubmitted).not.toBe(true);
  });

  it('never opens a wallet request if the phase checkpoint fails', async () => {
    await expect(approveSafeHashOnChain(1, SAFE, HASH, null, () => { throw new Error('Storage failed'); })).rejects.toThrow('Storage failed');
    expect(state.wallet.writeContract).not.toHaveBeenCalled();
  });
});
