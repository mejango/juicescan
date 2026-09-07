// Relayr pending receipts are device-local AND wallet-local: storage keys carry the connected
// account, so wallet B on the same browser never sees (or resumes) wallet A's paid bundles.
// Pre-existing unkeyed entries are adopted, best-effort, by the first wallet that reads them.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ account: null }));

vi.mock('../src/wallet.js', () => ({
  getAccount: vi.fn(() => h.account),
  getWalletClient: vi.fn(() => null),
  createPublicClientForChain: vi.fn(() => null),
  connect: vi.fn(() => Promise.resolve()),
  disconnect: vi.fn(),
  onWalletChange: vi.fn(),
  switchChain: vi.fn(),
  eagerConnect: vi.fn(),
  getProviders: vi.fn(() => []),
  refreshProviders: vi.fn(),
  isSafeConnected: vi.fn(() => false),
  proposeSafeTransactions: vi.fn(),
  waitForSafeInitialization: vi.fn(() => Promise.resolve()),
  initSafeApp: vi.fn(() => Promise.resolve(null)),
  getSafeInfo: vi.fn(() => null),
  dispatchWalletChangeListeners: vi.fn(),
}));

import {
  saveRelayrPendingSession, loadRelayrPendingSession, listRelayrPendingScopes, clearRelayrPendingSession,
} from '../src/relayr.js';

const A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const PREFIX = 'jb-relayr-pending-v1:';

function session(uuid) {
  return { bundleUuid: uuid, expectedCount: 2, chains: [{ id: 1, name: 'Ethereum' }], records: [], itemCount: 1 };
}

beforeEach(() => {
  localStorage.clear();
  h.account = null;
});

describe('account-keyed Relayr pending scopes', () => {
  it('keeps wallet A receipts invisible to wallet B, and intact for A', () => {
    h.account = A;
    saveRelayrPendingSession('create-project', session('bundle-a'));
    expect(listRelayrPendingScopes()).toEqual(['create-project']);
    expect(loadRelayrPendingSession('create-project').bundleUuid).toBe('bundle-a');

    h.account = B;
    expect(listRelayrPendingScopes()).toEqual([]);
    expect(loadRelayrPendingSession('create-project')).toBeNull();

    h.account = A;
    expect(loadRelayrPendingSession('create-project').bundleUuid).toBe('bundle-a');
  });

  it('stores under a key carrying the lowercased account address', () => {
    h.account = A;
    saveRelayrPendingSession('scope-x', session('bundle-x'));
    expect(localStorage.getItem(PREFIX + A.toLowerCase() + ':scope-x')).toBeTruthy();
    expect(localStorage.getItem(PREFIX + 'scope-x')).toBeNull();
  });

  it('adopts a legacy unkeyed receipt into the first connected wallet, best-effort', () => {
    localStorage.setItem(PREFIX + 'create-project', JSON.stringify(session('bundle-legacy')));
    h.account = A;
    expect(listRelayrPendingScopes()).toEqual(['create-project']);
    const restored = loadRelayrPendingSession('create-project');
    expect(restored.bundleUuid).toBe('bundle-legacy');
    // Migrated: legacy key gone, account key present; wallet B still sees nothing.
    expect(localStorage.getItem(PREFIX + 'create-project')).toBeNull();
    expect(localStorage.getItem(PREFIX + A.toLowerCase() + ':create-project')).toBeTruthy();
    h.account = B;
    expect(loadRelayrPendingSession('create-project')).toBeNull();
  });

  it('does not duplicate a scope while both a legacy and an adopted copy exist', () => {
    localStorage.setItem(PREFIX + 'create-project', JSON.stringify(session('bundle-legacy')));
    h.account = A;
    saveRelayrPendingSession('create-project', session('bundle-new'));
    expect(listRelayrPendingScopes()).toEqual(['create-project']);
  });

  it('clear removes both the account-keyed and any legacy copy', () => {
    localStorage.setItem(PREFIX + 'create-project', JSON.stringify(session('bundle-legacy')));
    h.account = A;
    saveRelayrPendingSession('create-project', session('bundle-new'));
    clearRelayrPendingSession('create-project');
    expect(localStorage.getItem(PREFIX + 'create-project')).toBeNull();
    expect(localStorage.getItem(PREFIX + A.toLowerCase() + ':create-project')).toBeNull();
    expect(loadRelayrPendingSession('create-project')).toBeNull();
  });

  it('falls back to unkeyed storage when no wallet is connected (nothing to key by)', () => {
    saveRelayrPendingSession('create-project', session('bundle-anon'));
    expect(localStorage.getItem(PREFIX + 'create-project')).toBeTruthy();
    expect(loadRelayrPendingSession('create-project').bundleUuid).toBe('bundle-anon');
    // Disconnected browsing lists nothing account-scoped.
    expect(listRelayrPendingScopes()).toEqual([]);
  });

  it('keeps submission, later polling, and clearing bound to the original wallet', () => {
    h.account = B;
    saveRelayrPendingSession('switch-during-payment', session('bundle-b'));
    // The payment captured A before opening the wallet, which switched to B before returning its hash.
    const paidByA = { ...session('bundle-a'), account: A };
    saveRelayrPendingSession('switch-during-payment', paidByA);
    expect(loadRelayrPendingSession('switch-during-payment').bundleUuid).toBe('bundle-b');

    paidByA.records = [{ status: { state: 'Pending' } }];
    saveRelayrPendingSession('switch-during-payment', paidByA);
    clearRelayrPendingSession('switch-during-payment', paidByA);
    expect(loadRelayrPendingSession('switch-during-payment').bundleUuid).toBe('bundle-b');
    h.account = A;
    expect(loadRelayrPendingSession('switch-during-payment')).toBeNull();
  });

  it('pins older account-keyed receipts when loading before an account change', () => {
    localStorage.setItem(PREFIX + A.toLowerCase() + ':older-receipt', JSON.stringify(session('bundle-old')));
    h.account = A;
    const restored = loadRelayrPendingSession('older-receipt');
    expect(restored.account).toBe(A.toLowerCase());
    h.account = B;
    saveRelayrPendingSession('older-receipt', restored);
    expect(loadRelayrPendingSession('older-receipt')).toBeNull();
    h.account = A;
    expect(loadRelayrPendingSession('older-receipt').bundleUuid).toBe('bundle-old');
  });

  it('retains an account-local receipt in memory when storage reads and writes are denied', () => {
    h.account = A;
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
    const reads = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied'); });
    try {
      expect(saveRelayrPendingSession('storage-denied', session('bundle-paid')).persisted).toBe(false);
      expect(loadRelayrPendingSession('storage-denied')).toMatchObject({ bundleUuid: 'bundle-paid', persisted: false });
      expect(listRelayrPendingScopes()).toContain('storage-denied');
      h.account = B;
      expect(loadRelayrPendingSession('storage-denied')).toBeNull();
      expect(listRelayrPendingScopes()).not.toContain('storage-denied');
      h.account = A;
      clearRelayrPendingSession('storage-denied');
      expect(loadRelayrPendingSession('storage-denied')).toBeNull();
    } finally {
      writes.mockRestore(); reads.mockRestore();
    }
  });

  it('drops its memory fallback after persistence succeeds and respects a later external clear', () => {
    h.account = A;
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    const paid = saveRelayrPendingSession('storage-recovers', session('bundle-paid'));
    writes.mockRestore();
    expect(saveRelayrPendingSession('storage-recovers', paid).persisted).toBe(true);
    localStorage.removeItem(PREFIX + A.toLowerCase() + ':storage-recovers');
    expect(loadRelayrPendingSession('storage-recovers')).toBeNull();
  });

  it('preserves a pre-hash payment journal and rejects another bundle in the same action scope', () => {
    h.account = A;
    const sending = { ...session('bundle-sending'), paymentState: 'sending' };
    saveRelayrPendingSession('same-action', sending);
    expect(loadRelayrPendingSession('same-action')).toMatchObject({ paymentState: 'sending', paymentHash: null });
    expect(() => saveRelayrPendingSession('same-action', session('bundle-new')))
      .toThrow(/different Relayr bundle is already saved/i);
    clearRelayrPendingSession('same-action', { ...session('bundle-new'), account: A });
    expect(loadRelayrPendingSession('same-action').bundleUuid).toBe('bundle-sending');
  });

  it('never overwrites sending or submitted state with a stale copy of the same quote', () => {
    h.account = A;
    const quoted = { ...session('bundle-monotonic'), paymentState: 'quoted' };
    saveRelayrPendingSession('monotonic', { ...quoted, paymentState: 'sending' });
    expect(saveRelayrPendingSession('monotonic', quoted)).toMatchObject({ paymentState: 'sending' });
    const hash = `0x${'ab'.repeat(32)}`;
    saveRelayrPendingSession('monotonic', { ...quoted, paymentState: null, paymentHash: hash });
    expect(saveRelayrPendingSession('monotonic', quoted)).toMatchObject({ paymentState: null, paymentHash: hash });
    expect(loadRelayrPendingSession('monotonic').paymentHash).toBe(hash);
  });

  it('prefers a newer durable payment over a failed-write quoted memory snapshot', () => {
    h.account = A;
    const quoted = { ...session('bundle-cross-tab'), paymentState: 'quoted' };
    saveRelayrPendingSession('cross-tab', quoted);
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    expect(saveRelayrPendingSession('cross-tab', { ...quoted, itemCount: 2 }).persisted).toBe(false);
    writes.mockRestore();
    // Another tab writes its sending journal while this tab still holds the failed quoted snapshot.
    localStorage.setItem(PREFIX + A.toLowerCase() + ':cross-tab', JSON.stringify({ ...quoted, paymentState: 'sending', persisted: true }));
    expect(loadRelayrPendingSession('cross-tab')).toMatchObject({ paymentState: 'sending', persisted: true });
    expect(saveRelayrPendingSession('cross-tab', quoted).paymentState).toBe('sending');
    clearRelayrPendingSession('cross-tab');
  });

  it('keeps a newer submitted memory receipt when readable storage only has the earlier sending marker', () => {
    h.account = A;
    const sending = { ...session('bundle-memory-newer'), paymentState: 'sending' };
    saveRelayrPendingSession('memory-newer', sending);
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    const hash = `0x${'cd'.repeat(32)}`;
    saveRelayrPendingSession('memory-newer', { ...sending, paymentState: null, paymentHash: hash });
    writes.mockRestore();
    expect(loadRelayrPendingSession('memory-newer')).toMatchObject({ paymentHash: hash, persisted: false });
    clearRelayrPendingSession('memory-newer');
  });
});
