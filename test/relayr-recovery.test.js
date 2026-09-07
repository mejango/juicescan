import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111' }));
vi.mock('../src/component-base.js', async importOriginal => ({
  ...await importOriginal(),
  getAccount: () => h.account,
  confirmTransactionModal: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/relayr.js', async importOriginal => ({
  ...await importOriginal(),
  relayrPostBundle: vi.fn(),
  relayrResumeQuotedBundle: vi.fn(),
  relayrPay: vi.fn(),
  relayrPoll: vi.fn(),
  verifyRelayrDestinationRecords: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/relayr-ui.js', async importOriginal => ({
  ...await importOriginal(),
  chooseRelayrPayment: vi.fn().mockResolvedValue({ chain: 1 }),
}));

import { fundRelayrQuotedSession, monitorRelayrSession, runProjectPayerRelayrDeploys } from '../src/discover.js';
import {
  clearRelayrPendingSession, loadRelayrPendingSession, relayrPay, relayrPoll, relayrPostBundle, relayrResumeQuotedBundle,
  saveRelayrPendingSession, verifyRelayrDestinationRecords,
} from '../src/relayr.js';
import { chooseRelayrPayment } from '../src/relayr-ui.js';

const SCOPE = 'recovery-test';
const BUNDLE = '01234567-89ab-cdef-0123-456789abcdef';
const HASH = `0x${'aa'.repeat(32)}`;
const BINDINGS = [{ txUuid: '00000000-0000-4000-8000-000000000001', requestHash: `0x${'bb'.repeat(32)}`, chain: 1 }];
const RECORDS = [{ tx_uuid: BINDINGS[0].txUuid, status: { state: 'Completed', data: { hash: HASH } } }];
function session() {
  return { bundleUuid: BUNDLE, account: h.account, paymentHash: HASH, expectedCount: 1,
    expectedTransactions: BINDINGS, chains: [{ id: 1, name: 'Ethereum' }], records: [] };
}
function timeout() { return Object.assign(new Error('Still processing'), { code: 'RELAYR_TIMEOUT', records: [] }); }
function persistQuote(quote, opts = {}) {
  saveRelayrPendingSession(opts.scope || SCOPE, { ...session(), paymentHash: null, paymentState: 'quoted',
    expectedTransactions: quote.expected_transactions, chains: opts.chains || session().chains });
  return quote;
}

beforeEach(() => {
  h.account = '0x1111111111111111111111111111111111111111';
  vi.clearAllMocks();
  localStorage.clear();
  relayrPostBundle.mockImplementation(async (_entries, opts) => persistQuote({ bundle_uuid: BUNDLE, expected_transactions: BINDINGS }, opts));
  relayrResumeQuotedBundle.mockReset().mockReturnValue(null);
  relayrPay.mockReset();
  chooseRelayrPayment.mockReset().mockResolvedValue({ chain: 1 });
  verifyRelayrDestinationRecords.mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  clearRelayrPendingSession(SCOPE);
});

describe('Relayr recovery after payment submission', () => {
  it('retains every paid receipt when the API reports that all destinations failed', async () => {
    const paid = session();
    const failure = Object.assign(new Error('Relayr reported failure'), {
      code: 'RELAYR_FAILED', records: [{ tx_uuid: BINDINGS[0].txUuid, status: { state: 'Failed' } }],
    });
    relayrPoll.mockRejectedValue(failure);
    await expect(monitorRelayrSession(paid, vi.fn(), { pendingScope: SCOPE })).rejects.toBe(failure);
    expect(loadRelayrPendingSession(SCOPE)).toMatchObject({ bundleUuid: BUNDLE, paymentHash: HASH });
    expect(verifyRelayrDestinationRecords).not.toHaveBeenCalled();
  });

  it.each(['RELAYR_NOT_FOUND', 'RELAYR_STATUS_MISMATCH', 'RELAYR_STATUS_UNBOUND'])('retains the receipt after %s', async code => {
    const failure = Object.assign(new Error('Bundle status is not verified'), { code, records: [] });
    relayrPoll.mockRejectedValue(failure);
    await expect(monitorRelayrSession(session(), vi.fn(), { pendingScope: SCOPE })).rejects.toBe(failure);
    expect(loadRelayrPendingSession(SCOPE).bundleUuid).toBe(BUNDLE);
  });

  it('keeps an uncertain publication blocked without polling a nonexistent bundle or storing signatures', async () => {
    const publication = { ...session(), bundleUuid: 'publication-pending:unique-attempt', paymentHash: null,
      paymentState: 'publication', publicationRequestHashes: [BINDINGS[0].requestHash],
      expectedTransactions: [], signedCalldata: 'must-not-be-stored' };
    await expect(monitorRelayrSession(publication, vi.fn(), { pendingScope: SCOPE }))
      .rejects.toMatchObject({ code: 'RELAYR_PUBLICATION_PENDING' });
    expect(relayrPoll).not.toHaveBeenCalled();
    expect(loadRelayrPendingSession(SCOPE)).toMatchObject({ paymentState: 'publication', publicationRequestHashes: [BINDINGS[0].requestHash] });
    expect(JSON.stringify(loadRelayrPendingSession(SCOPE))).not.toContain('must-not-be-stored');
  });

  it('clears the original account receipt only after exact destination verification succeeds', async () => {
    const paid = session();
    saveRelayrPendingSession(SCOPE, paid);
    h.account = '0x2222222222222222222222222222222222222222';
    saveRelayrPendingSession(SCOPE, { ...session(), bundleUuid: 'another-wallet-bundle' });
    relayrPoll.mockResolvedValue(RECORDS);
    await expect(monitorRelayrSession(paid, vi.fn(), { pendingScope: SCOPE })).resolves.toMatchObject({ bundleUuid: BUNDLE });
    expect(verifyRelayrDestinationRecords).toHaveBeenCalledWith(expect.any(Array), RECORDS);
    expect(loadRelayrPendingSession(SCOPE).bundleUuid).toBe('another-wallet-bundle');
    clearRelayrPendingSession(SCOPE);
    h.account = paid.account;
    expect(loadRelayrPendingSession(SCOPE)).toBeNull();
  });

  it('keeps a successful API report pending when its destination receipt cannot be verified', async () => {
    relayrPoll.mockResolvedValue(RECORDS);
    verifyRelayrDestinationRecords.mockRejectedValue(new Error('Different destination calldata'));
    await expect(monitorRelayrSession(session(), vi.fn(), { pendingScope: SCOPE }))
      .rejects.toMatchObject({ code: 'RELAYR_POSTCONDITION_PENDING' });
    expect(loadRelayrPendingSession(SCOPE).paymentHash).toBe(HASH);
  });

  it.each([false, true])('does not repay after a wallet/RPC timeout with storage denied (hash returned: %s)', async hashReturned => {
    relayrPay.mockImplementation(async (_payment, _account, onSubmitted, _uuid, _reverify, onSending) => {
      onSending();
      // The durable journal was written before the wallet opened. Storage fails only after submission.
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied'); });
      if (hashReturned) onSubmitted(HASH);
      throw Object.assign(new Error('Payment submission is uncertain'), {
        code: hashReturned ? 'RELAYR_PAYMENT_SUBMITTED' : 'RELAYR_PAYMENT_UNCERTAIN',
      });
    });
    relayrPoll.mockRejectedValue(timeout());
    const calls = [{ chainId: 1, to: '0x3333333333333333333333333333333333333333', data: '0x' }];
    await expect(runProjectPayerRelayrDeploys(calls, vi.fn(), SCOPE)).rejects.toMatchObject({
      code: 'RELAYR_TIMEOUT', relayrSession: { bundleUuid: BUNDLE, persisted: false },
    });
    expect(loadRelayrPendingSession(SCOPE)).toMatchObject({
      bundleUuid: BUNDLE, persisted: false, paymentHash: hashReturned ? HASH : null,
    });
    await expect(runProjectPayerRelayrDeploys(calls, vi.fn(), SCOPE)).rejects.toMatchObject({ code: 'RELAYR_TIMEOUT' });
    expect(relayrPay).toHaveBeenCalledOnce();
    expect(relayrPostBundle).toHaveBeenCalledOnce();
    expect(relayrPoll).toHaveBeenCalledTimes(2);
  });

  it('resumes the same quote after chooser cancellation even if the new form selects different calls', async () => {
    const quote = { bundle_uuid: BUNDLE, expected_transactions: BINDINGS };
    relayrPostBundle.mockImplementation(async (_entries, opts) => persistQuote(quote, opts));
    chooseRelayrPayment.mockResolvedValueOnce(null).mockResolvedValueOnce({ chain: 1 });
    const originalCalls = [{ chainId: 1, to: '0x3333333333333333333333333333333333333333', data: '0x' }];
    await expect(runProjectPayerRelayrDeploys(originalCalls, vi.fn(), SCOPE)).rejects.toThrow(/cancelled/i);
    expect(loadRelayrPendingSession(SCOPE)).toMatchObject({ bundleUuid: BUNDLE, paymentState: 'quoted', expectedCount: 1 });
    expect(relayrPay).not.toHaveBeenCalled();

    relayrResumeQuotedBundle.mockReturnValue(quote);
    relayrPay.mockImplementation(async (_payment, _account, onSubmitted, _uuid, _reverify, onSending) => {
      onSending(); onSubmitted(HASH); return HASH;
    });
    relayrPoll.mockResolvedValue(RECORDS);
    const resumed = await runProjectPayerRelayrDeploys([{ ...originalCalls[0], chainId: 10, data: '0x1234' }], vi.fn(), SCOPE);
    expect(resumed).toMatchObject({ resumed: true, expectedCount: 1, chains: [{ id: 1, name: 'Ethereum' }] });
    expect(relayrPostBundle).toHaveBeenCalledOnce();
    expect(chooseRelayrPayment).toHaveBeenNthCalledWith(1, quote);
    expect(chooseRelayrPayment).toHaveBeenNthCalledWith(2, quote);
    expect(relayrPay).toHaveBeenCalledOnce();
  });

  it('retains the original quote checks when a later form tries to supply different checks', async () => {
    const quote = { bundle_uuid: BUNDLE, expected_transactions: BINDINGS };
    const quoted = { ...session(), paymentState: 'quoted', paymentHash: null };
    const originalCheck = vi.fn().mockResolvedValue(undefined);
    const changedCheck = vi.fn();
    saveRelayrPendingSession(SCOPE, quoted);
    chooseRelayrPayment.mockResolvedValueOnce(null).mockResolvedValueOnce({ chain: 1 });
    await expect(fundRelayrQuotedSession(quote, quoted, vi.fn(), { pendingScope: SCOPE, reverify: originalCheck }))
      .rejects.toThrow(/cancelled/i);
    relayrPay.mockImplementation(async (_payment, _account, onSubmitted, _uuid, reverify, onSending) => {
      await reverify(); onSending(); onSubmitted(HASH); return HASH;
    });
    relayrPoll.mockResolvedValue(RECORDS);
    await fundRelayrQuotedSession(quote, loadRelayrPendingSession(SCOPE), vi.fn(), { pendingScope: SCOPE, resumeQuoted: true, reverify: changedCheck });
    expect(originalCheck).toHaveBeenCalledOnce();
    expect(changedCheck).not.toHaveBeenCalled();
  });

  it('keeps a reloaded quote blocked when its exact in-memory funding options are unavailable', async () => {
    saveRelayrPendingSession(SCOPE, { ...session(), paymentState: 'quoted', paymentHash: null });
    await expect(runProjectPayerRelayrDeploys([], vi.fn(), SCOPE))
      .rejects.toMatchObject({ code: 'RELAYR_QUOTE_RECOVERY_PENDING' });
    expect(relayrPostBundle).not.toHaveBeenCalled();
    expect(relayrPay).not.toHaveBeenCalled();
    expect(relayrPoll).not.toHaveBeenCalled();
    expect(loadRelayrPendingSession(SCOPE).paymentState).toBe('quoted');
  });

  it('restores quoted state and stops before wallet submission if the sending journal cannot persist', async () => {
    const walletSend = vi.fn();
    relayrPay.mockImplementation(async (_payment, _account, _onSubmitted, _uuid, _reverify, onSending) => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
      onSending();
      walletSend();
    });
    const quote = { bundle_uuid: BUNDLE, expected_transactions: BINDINGS };
    persistQuote(quote);
    await expect(fundRelayrQuotedSession(quote, { ...session(), paymentState: 'quoted', paymentHash: null }, vi.fn(), { pendingScope: SCOPE }))
      .rejects.toMatchObject({ code: 'RELAYR_STORAGE_UNAVAILABLE' });
    expect(walletSend).not.toHaveBeenCalled();
    expect(loadRelayrPendingSession(SCOPE)).toMatchObject({ paymentState: 'quoted', paymentHash: null, persisted: false });
  });

  it('refuses a stale quote modal after another window started paying the same bundle', async () => {
    const stale = { ...session(), paymentHash: null, paymentState: 'quoted' };
    saveRelayrPendingSession(SCOPE, { ...stale, paymentState: 'sending' });
    await expect(fundRelayrQuotedSession({ bundle_uuid: BUNDLE, expected_transactions: BINDINGS }, stale, vi.fn(), { pendingScope: SCOPE }))
      .rejects.toMatchObject({ code: 'RELAYR_PENDING_CONFLICT' });
    expect(loadRelayrPendingSession(SCOPE).paymentState).toBe('sending');
    expect(relayrPay).not.toHaveBeenCalled();
    expect(chooseRelayrPayment).not.toHaveBeenCalled();
  });

  it('refreshes a stale quoted monitor from the newer sending journal before persisting or classifying it', async () => {
    const stale = { ...session(), paymentHash: null, paymentState: 'quoted' };
    saveRelayrPendingSession(SCOPE, { ...stale, paymentState: 'sending' });
    relayrPoll.mockRejectedValue(timeout());
    await expect(monitorRelayrSession(stale, vi.fn(), { pendingScope: SCOPE }))
      .rejects.toMatchObject({ code: 'RELAYR_TIMEOUT' });
    expect(relayrPoll).toHaveBeenCalledOnce();
    expect(loadRelayrPendingSession(SCOPE).paymentState).toBe('sending');
    expect(relayrPay).not.toHaveBeenCalled();
  });

  it('rechecks the journal after the funding chooser before a competing same-bundle payment can open the wallet', async () => {
    const quote = { bundle_uuid: BUNDLE, expected_transactions: BINDINGS };
    const quoted = { ...session(), paymentHash: null, paymentState: 'quoted' };
    saveRelayrPendingSession(SCOPE, quoted);
    chooseRelayrPayment.mockImplementation(async () => {
      saveRelayrPendingSession(SCOPE, { ...quoted, paymentState: 'sending' });
      return { chain: 1 };
    });
    const walletSend = vi.fn();
    relayrPay.mockImplementation(async (_payment, _account, _onSubmitted, _uuid, _reverify, onSending) => {
      onSending(); walletSend();
    });
    await expect(fundRelayrQuotedSession(quote, quoted, vi.fn(), { pendingScope: SCOPE }))
      .rejects.toMatchObject({ code: 'RELAYR_PENDING_CONFLICT' });
    expect(walletSend).not.toHaveBeenCalled();
    expect(loadRelayrPendingSession(SCOPE).paymentState).toBe('sending');
  });
});


it('retains exact paid receipts when distribution semantics fail before the parent checkpoint', async () => {
  relayrPoll.mockResolvedValue(RECORDS);
  const onVerified = vi.fn();
  await expect(monitorRelayrSession(session(), vi.fn(), { pendingScope: SCOPE,
    verifyCompletion: async () => { throw new Error('recipient hook underpulled'); }, onVerified,
  })).rejects.toMatchObject({ code: 'RELAYR_POSTCONDITION_PENDING' });
  expect(onVerified).not.toHaveBeenCalled(); expect(loadRelayrPendingSession(SCOPE).bundleUuid).toBe(BUNDLE);
});
it('retains exact paid receipts until the parent checkpoint is durably written', async () => {
  relayrPoll.mockResolvedValue(RECORDS);
  await expect(monitorRelayrSession(session(), vi.fn(), { pendingScope: SCOPE,
    onVerified: async () => { throw new Error('checkpoint storage unavailable'); },
  })).rejects.toThrow('checkpoint storage unavailable');
  expect(loadRelayrPendingSession(SCOPE).bundleUuid).toBe(BUNDLE);
  const onVerified = vi.fn();
  await expect(monitorRelayrSession(loadRelayrPendingSession(SCOPE), vi.fn(), { pendingScope: SCOPE, onVerified })).resolves.toMatchObject({ bundleUuid: BUNDLE });
  expect(onVerified).toHaveBeenCalledOnce(); expect(loadRelayrPendingSession(SCOPE)).toBeNull();
});

it.each([true, false])('retains frozen-round receipts without exposing legacy manual clear: %s', retainPendingReceipt => {
  const status = vi.fn(); status.element = document.createElement('div');
  const container = document.createElement('div'); container.appendChild(status.element); document.body.appendChild(container);
  relayrPoll.mockRejectedValue(Object.assign(new Error('Destination failed'), { code: 'RELAYR_FAILED', records: [] }));
  return expect(monitorRelayrSession(session(), status, { pendingScope: SCOPE, retainPendingReceipt })).rejects.toThrow('Destination failed').then(() => {
    expect(!!container.querySelector('.relayr-pending-clear')).toBe(!retainPendingReceipt);
    expect(loadRelayrPendingSession(SCOPE).bundleUuid).toBe(BUNDLE); container.remove();
  });
});
