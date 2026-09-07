import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, stringToHex } from 'viem';

const runtime = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111', transaction: null }));
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(),
  getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account, isSafeConnected: () => false,
  getWalletClient: () => ({ sendTransaction: vi.fn(() => { throw new Error('Unexpected wallet send'); }) }),
  confirmTransactionModal: vi.fn().mockResolvedValue(true),
  waitForTrackedTransactionReceipt: vi.fn(async (_client, hash) => ({ status: 'success', transactionHash: hash })),
  createPublicClientForChain: () => ({
    readContract: vi.fn().mockRejectedValue(new Error('Optional display read unavailable')),
    getBytecode: vi.fn().mockResolvedValue('0x'),
    getTransaction: vi.fn(async () => runtime.transaction),
    request: vi.fn().mockRejectedValue(new Error('Unexpected simulation')),
  }),
}));
vi.mock('../src/relayr.js', async importOriginal => ({
  ...await importOriginal(), relayrPoll: vi.fn(), relayrPostBundle: vi.fn(), relayrPay: vi.fn(),
  relayrResumeQuotedBundle: vi.fn(), verifyRelayrDestinationRecords: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/relayr-ui.js', async importOriginal => ({
  ...await importOriginal(), chooseRelayrPayment: vi.fn().mockResolvedValue(null),
}));

import { confirmTransactionModal, waitForTrackedTransactionReceipt } from '../src/component-base.js';
import { loadRelayrPendingSession, relayrPay, relayrPoll, relayrPostBundle, relayrResumeQuotedBundle, saveRelayrPendingSession } from '../src/relayr.js';
import { chooseRelayrPayment } from '../src/relayr-ui.js';
import { buildProjectPayerDeployCall, renderExtrasSection, runProjectPayerRelayrDeploys } from '../src/discover.js';

const ACCOUNT = runtime.account, ZERO = '0x0000000000000000000000000000000000000000';
const HASH = `0x${'aa'.repeat(32)}`, BUNDLE = '01234567-89ab-cdef-0123-456789abcdef';
const BINDINGS = [{ txUuid: '00000000-0000-4000-8000-000000000001', requestHash: `0x${'bb'.repeat(32)}`, chain: 8453 }];
const project = { id: 12, chainId: 8453, idByChain: { 8453: 12, 10: 99 }, tokenSymbol: 'TEST',
  chains: [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }] };
const scope = p => `action:${p.chainId}:${p.id}:deploy-payer-address`;
const saved = changes => ({ account: ACCOUNT, bundleUuid: BUNDLE, paymentHash: HASH, expectedCount: 1,
  expectedTransactions: BINDINGS, chains: [{ id: 8453, name: 'Base' }], records: [], ...changes });
const form = () => document.querySelector('dialog .extras-body');
const submit = () => form().querySelector('.operator-edit-submit');
const status = () => form().querySelector('.operator-edit-status').textContent;
function open(p = project) {
  const section = renderExtrasSection(p); document.body.appendChild(section);
  section.querySelector('.extras-card button').click();
  return section;
}
function spoilNewInputs() {
  form().querySelectorAll('.splits-edit-chains input').forEach(input => { input.checked = false; input.dispatchEvent(new Event('change')); });
  form().querySelector('input[placeholder="0x"]').value = 'invalid new metadata';
  form().querySelector('.extras-checkbox-row input').checked = false;
  form().querySelector('.extras-address').value = 'unresolved-new-name.eth';
  form().querySelector('.extras-editable-row input').checked = true;
  form().querySelector('.extras-owner-fields input').value = 'invalid new admin';
}

beforeEach(() => {
  document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks();
  runtime.account = ACCOUNT; runtime.transaction = null;
  relayrResumeQuotedBundle.mockReturnValue(null);
  chooseRelayrPayment.mockResolvedValue(null);
  relayrPoll.mockResolvedValue([{ tx_uuid: BINDINGS[0].txUuid, status: { state: 'Completed', data: { hash: HASH } } }]);
  confirmTransactionModal.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { projectPayers: { items: [], pageInfo: { hasNextPage: false } } } }) })));
});

describe('payer deployment form recovery', () => {
  it('checks the previous paid mainnet request before invalid changed fields or an empty selection', async () => {
    saveRelayrPendingSession(scope(project), saved());
    const section = open(); expect(section.querySelector('.extras-card button').textContent).toBe('Resume payer deployment');
    spoilNewInputs(); expect(submit().textContent).toBe('Resume payer deployment'); submit().click();
    await vi.waitFor(() => expect(status()).toContain('previously paid Relayr request is confirmed on 1 chain'));
    expect(relayrPoll).toHaveBeenCalledWith(BUNDLE, expect.any(Function), 2500, 60000, 1, expect.any(Array));
    expect(relayrPostBundle).not.toHaveBeenCalled(); expect(relayrPay).not.toHaveBeenCalled();
    expect(confirmTransactionModal).not.toHaveBeenCalled(); expect(loadRelayrPendingSession(scope(project))).toBeNull();
  });

  it('retains a publication guard before parsing newly edited metadata', async () => {
    saveRelayrPendingSession(scope(project), saved({ bundleUuid: 'publication-pending:original-attempt', paymentHash: null,
      paymentState: 'publication', expectedTransactions: [], publicationRequestHashes: [BINDINGS[0].requestHash] }));
    open(); spoilNewInputs(); submit().click();
    await vi.waitFor(() => expect(status()).toContain('no bundle ID was returned'));
    expect(loadRelayrPendingSession(scope(project))).toMatchObject({ paymentState: 'publication', bundleUuid: 'publication-pending:original-attempt' });
    expect(relayrPoll).not.toHaveBeenCalled(); expect(relayrPostBundle).not.toHaveBeenCalled(); expect(relayrPay).not.toHaveBeenCalled();
  });

  it('reopens the exact saved quote chooser without validating replacement inputs or posting again', async () => {
    const quote = { bundle_uuid: BUNDLE, expected_transactions: BINDINGS };
    saveRelayrPendingSession(scope(project), saved({ paymentHash: null, paymentState: 'quoted' }));
    relayrResumeQuotedBundle.mockReturnValue(quote);
    open(); spoilNewInputs(); submit().click();
    await vi.waitFor(() => expect(chooseRelayrPayment).toHaveBeenCalledWith(quote));
    await vi.waitFor(() => expect(status()).toContain('Payment cancelled'));
    expect(submit().textContent).toBe('Resume payer deployment');
    expect(relayrPostBundle).not.toHaveBeenCalled(); expect(relayrPay).not.toHaveBeenCalled();
  });

  it('keeps testnet direct receipts at the original stable scope and rejects changed calldata', async () => {
    const p = { id: 12, chainId: 84532, idByChain: { 84532: 12, 11155420: 99 },
      chains: [{ id: 84532, name: 'Base Sepolia' }, { id: 11155420, name: 'OP Sepolia' }] };
    const calls = p.chains.map(chain => buildProjectPayerDeployCall(chain.id, p.idByChain[chain.id], ZERO, '', '0x', false, ZERO));
    const identity = keccak256(stringToHex(JSON.stringify(calls.map(call => [call.chainId, call.to.toLowerCase(), call.data.toLowerCase(), '0']))));
    const key = `jb-direct-batch-v1:${ACCOUNT}:${scope(p)}`;
    localStorage.setItem(key, JSON.stringify({ identity, hashes: [HASH, 'sending'] }));
    runtime.transaction = { from: ACCOUNT, to: calls[0].to, input: calls[0].data, value: 0n };
    open(p); const memo = form().querySelector('input[placeholder="optional memo attached to payments"]');
    memo.value = 'changed request'; submit().click();
    await vi.waitFor(() => expect(status()).toContain('previous direct transaction batch is unfinished'));
    expect(JSON.parse(localStorage.getItem(key))).toEqual({ identity, hashes: [HASH, 'sending'] });
    expect(waitForTrackedTransactionReceipt).not.toHaveBeenCalled(); expect(confirmTransactionModal).not.toHaveBeenCalled();
    memo.value = ''; submit().click();
    await vi.waitFor(() => expect(status()).toContain('wallet request was interrupted'));
    expect(waitForTrackedTransactionReceipt).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem(key))).toEqual({ identity, hashes: [HASH, 'sending'] });
    expect(relayrPostBundle).not.toHaveBeenCalled(); expect(confirmTransactionModal).not.toHaveBeenCalled();
  });

  it('pins the reviewed account and stops if it changes before quote publication', async () => {
    confirmTransactionModal.mockImplementationOnce(async () => { runtime.account = ZERO; return true; });
    await expect(runProjectPayerRelayrDeploys([buildProjectPayerDeployCall(8453, 12, ZERO, '', '0x', false, ZERO)], vi.fn(), scope(project)))
      .rejects.toThrow(/Connected account changed/);
    expect(relayrPostBundle).not.toHaveBeenCalled();
  });

  it('publishes the exact calls reviewed even when their source array changes during confirmation', async () => {
    const calls = [buildProjectPayerDeployCall(8453, 12, ZERO, 'reviewed memo', '0x', false, ZERO)];
    const original = { chain: 8453, target: calls[0].to, data: calls[0].data, value: '0' };
    confirmTransactionModal.mockImplementationOnce(async () => { calls[0].chainId = 10; calls[0].data = '0x1234'; calls.push(calls[0]); return true; });
    relayrPostBundle.mockRejectedValueOnce(new Error('Stop after publication boundary'));
    await expect(runProjectPayerRelayrDeploys(calls, vi.fn(), scope(project))).rejects.toThrow(/publication boundary/);
    expect(relayrPostBundle).toHaveBeenCalledWith([original], { scope: scope(project), account: ACCOUNT, chains: [{ id: 8453, name: 'Base' }] });
  });
});
