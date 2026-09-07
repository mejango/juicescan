import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  account: '0x1111111111111111111111111111111111111111',
  forwarder: '0x2222222222222222222222222222222222222222',
  nonce: 7n, timestamp: 2000000000n, client: null, wallet: null, inLock: false,
}));
vi.mock('../src/component-base.js', () => ({
  getAccount: () => state.account, getWalletClient: () => state.wallet,
  createPublicClientForChain: chainId => ({ ...state.client, readContract: request => state.client.readContract(request, chainId) }),
  getAddress: () => state.forwarder, switchChain: vi.fn(), getViewAs: () => null,
  VIEW_AS_TX_ERROR: 'View as is read-only.', waitForTrackedTransactionReceipt: vi.fn(), confirmTransactionModal: vi.fn(),
}));
import { buildForwardedTx, relayrPostBundle, relayrResumeQuotedBundle, verifyRelayrQuotedRequests,
  clearRelayrPendingSession, loadRelayrPendingSession, RELAYR_PAYMENT_ADDRESS, RELAYR_PAYMENT_SELECTOR,
  RELAYR_NATIVE_TOKEN } from '../src/relayr.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TARGET = '0x3333333333333333333333333333333333333333';
const NONCE_KEY = 'jb-relayr-forwarder-nonces-v1';
const NOW = 2000000000;
const reservations = () => JSON.parse(localStorage.getItem(NONCE_KEY) || '[]');
const journal = scope => ({ scope, account: state.account });
const entry = (chainId = 8453, data = '0x12345678') => buildForwardedTx(chainId, state.account, TARGET, data, 500000n);
let fetchQuote, locks;

function quote(count = 1) {
  const id = '01234567-89ab-cdef-0123-456789abcdef';
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  return { bundle_uuid: id, tx_uuids: Array.from({ length: count }, (_, i) => `11234567-89ab-cdef-0123-${String(i + 1).padStart(12, '0')}`),
    payment_info: [{ chain: 8453, target: RELAYR_PAYMENT_ADDRESS, token: RELAYR_NATIVE_TOKEN, amount: '123',
      payment_deadline: String(deadline), calldata: RELAYR_PAYMENT_SELECTOR + id.replace(/-/g, '').padEnd(64, '0')
        + BigInt(deadline).toString(16).padStart(64, '0') }] };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  state.account = ACCOUNT; state.forwarder = '0x2222222222222222222222222222222222222222';
  state.nonce = 7n; state.timestamp = BigInt(NOW); state.inLock = false;
  state.wallet = { getChainId: vi.fn(async () => 8453), signTypedData: vi.fn(async ({ message }) =>
    '0x' + BigInt(message.nonce).toString(16).padStart(128, '0') + '1b') };
  state.client = {
    getBlock: vi.fn(async () => ({ number: 99n, timestamp: state.timestamp })),
    readContract: vi.fn(async (request, chainId) => {
      if (request.functionName === 'isTrustedForwarder') return true;
      if (request.functionName === 'nonces') return state.nonce;
      if (request.functionName === 'eip712Domain') return ['0x0f', 'ERC2771Forwarder', '1', BigInt(chainId), state.forwarder, '0x' + '00'.repeat(32), []];
      throw new Error('Unexpected read');
    }),
    estimateGas: vi.fn(async () => 200000n), request: vi.fn(async () => '0x'),
  };
  let previous = Promise.resolve();
  locks = vi.fn((name, callback) => {
    const next = previous.then(async () => { state.inLock = true; try { return await callback({ name }); } finally { state.inLock = false; } });
    previous = next.catch(() => {});
    return next;
  });
  vi.stubGlobal('navigator', { locks: { request: locks } });
  fetchQuote = vi.fn(async (_, options) => ({ ok: true, json: async () => quote(JSON.parse(options.body).transactions.length) }));
  vi.stubGlobal('fetch', fetchQuote);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('forwarded nonce publication reservations', () => {
  it('binds creation-style buildForwardedTx entries before POST without sending metadata or persisting signatures', async () => {
    const tx = await entry();
    fetchQuote.mockImplementation(async (_, options) => {
      expect(state.inLock).toBe(true);
      expect(reservations()).toEqual([expect.objectContaining({ signer: ACCOUNT, forwarder: state.forwarder,
        chain: 8453, nonce: '7', deadline: String(NOW + 47 * 3600), scope: 'create' })]);
      expect(localStorage.getItem(NONCE_KEY)).not.toContain(tx.data);
      expect(loadRelayrPendingSession('create').paymentState).toBe('publication');
      expect(JSON.parse(options.body).transactions[0]).toEqual({ ...tx, virtual_nonce: 0 });
      return { ok: true, json: async () => quote() };
    });
    const result = await relayrPostBundle([tx], journal('create'));
    expect(locks).toHaveBeenCalledWith('jb-relayr-forwarder-publication-v1', expect.any(Function));
    expect(relayrResumeQuotedBundle('create')).toBe(result);
    await expect(verifyRelayrQuotedRequests(result.bundle_uuid, ACCOUNT)).resolves.toBeUndefined();
  });

  it.each(['0x12345678', '0xdeadbeef'])('blocks another action scope using the reserved nonce with calldata %s', async data => {
    await relayrPostBundle([await entry()], journal('claims'));
    await expect(relayrPostBundle([await entry(8453, data)], journal('set-metadata')))
      .rejects.toMatchObject({ code: 'RELAYR_NONCE_RESERVED', scope: 'claims' });
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(loadRelayrPendingSession('set-metadata')).toBeNull();
  });

  it('serializes two concurrently reviewed scopes through one shared publication lock', async () => {
    const a = await entry(), b = await entry(8453, '0xdeadbeef');
    const results = await Promise.allSettled([
      relayrPostBundle([a], journal('first')), relayrPostBundle([b], journal('second')),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'RELAYR_NONCE_RESERVED' } });
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it('retains unknown publication reservations across reload and manual action-receipt clearing', async () => {
    fetchQuote.mockRejectedValueOnce(new Error('Transport lost after POST'));
    await expect(relayrPostBundle([await entry()], journal('unknown'))).rejects.toMatchObject({ code: 'RELAYR_PUBLICATION_PENDING' });
    clearRelayrPendingSession('unknown', loadRelayrPendingSession('unknown'));
    vi.resetModules();
    const reloaded = await import('../src/relayr.js');
    const next = await reloaded.buildForwardedTx(8453, ACCOUNT, TARGET, '0xdeadbeef', 500000n);
    await expect(reloaded.relayrPostBundle([next], journal('other'))).rejects.toMatchObject({ code: 'RELAYR_NONCE_RESERVED' });
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it.each(['signer', 'chain', 'forwarder'])('keeps independent %s nonce domains separate', async field => {
    await relayrPostBundle([await entry()], journal('first'));
    if (field === 'signer') state.account = '0x4444444444444444444444444444444444444444';
    if (field === 'forwarder') state.forwarder = '0x5555555555555555555555555555555555555555';
    await expect(relayrPostBundle([await entry(field === 'chain' ? 10 : 8453)], journal('independent'))).resolves.toHaveProperty('bundle_uuid');
    expect(reservations()).toHaveLength(2);
  });

  it('allows a fresh signed nonce after chain-proven consumption and removes the old reservation', async () => {
    await relayrPostBundle([await entry()], journal('first'));
    state.nonce = 8n;
    await relayrPostBundle([await entry()], journal('next-round'));
    expect(reservations()).toHaveLength(1);
    expect(reservations()[0]).toMatchObject({ nonce: '8', scope: 'next-round' });
  });

  it('requires the chain timestamp past the old deadline; wall-clock expiry and equality do not release it', async () => {
    await relayrPostBundle([await entry()], journal('first'));
    Date.now.mockReturnValue((NOW + 48 * 3600) * 1000);
    const next = await entry();
    await expect(relayrPostBundle([next], journal('later'))).rejects.toMatchObject({ code: 'RELAYR_NONCE_RESERVED' });
    state.timestamp = BigInt(NOW + 47 * 3600);
    await expect(relayrPostBundle([next], journal('later'))).rejects.toMatchObject({ code: 'RELAYR_NONCE_RESERVED' });
    state.timestamp++;
    await expect(relayrPostBundle([next], journal('later'))).resolves.toHaveProperty('bundle_uuid');
    expect(reservations()[0].scope).toBe('later');
  });

  it('rejects stale signed requests without substituting the new chain nonce', async () => {
    const old = await entry(); state.nonce++;
    await expect(relayrPostBundle([old], journal('stale'))).rejects.toThrow(/signed forwarder request is stale/);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it('rejects duplicate nonce entries within one bundle before publication', async () => {
    await expect(relayrPostBundle([await entry(), await entry(8453, '0xdeadbeef')], journal('duplicate')))
      .rejects.toThrow(/repeats a signed forwarder nonce/);
    expect(fetchQuote).not.toHaveBeenCalled();
    expect(reservations()).toEqual([]);
  });

  it('does not accept a raw forwarded entry or caller-invented nonce proof', async () => {
    await expect(relayrPostBundle([{ chain: 8453, target: state.forwarder, data: '0x12345678', value: '0',
      forwardRequest: { nonce: '7', signer: ACCOUNT } }], journal('forged'))).rejects.toThrow(/missing its original signed nonce proof/);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it('blocks forwarded publication without a durable scope or Web Locks', async () => {
    const tx = await entry();
    await expect(relayrPostBundle([tx])).rejects.toThrow(/durable action scope/);
    vi.stubGlobal('navigator', {});
    await expect(relayrPostBundle([tx], journal('no-lock'), true)).rejects.toThrow(/Web Locks/);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it.each(['getItem', 'setItem'])('does not publish when reservation storage %s fails', async method => {
    const tx = await entry();
    const original = Storage.prototype[method];
    vi.spyOn(Storage.prototype, method).mockImplementation(function (key, ...args) {
      if (key === NONCE_KEY) throw new Error('Denied');
      return original.call(this, key, ...args);
    });
    await expect(relayrPostBundle([tx], journal('denied'))).rejects.toThrow(/browser storage/);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it('fails closed on corrupt reservations or unavailable chain state', async () => {
    const tx = await entry();
    localStorage.setItem(NONCE_KEY, '{broken');
    await expect(relayrPostBundle([tx], journal('corrupt'))).rejects.toThrow(/cannot be read/);
    localStorage.removeItem(NONCE_KEY);
    state.client.getBlock.mockRejectedValue(new Error('RPC unavailable'));
    await expect(relayrPostBundle([tx], journal('offline'))).rejects.toThrow(/Could not verify/);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it('requires the original reservation again before funding a known quote', async () => {
    const result = await relayrPostBundle([await entry()], journal('original'));
    const saved = reservations(); saved[0].scope = 'other'; localStorage.setItem(NONCE_KEY, JSON.stringify(saved));
    await expect(verifyRelayrQuotedRequests(result.bundle_uuid, ACCOUNT)).rejects.toThrow(/reservation no longer matches/);
    expect(state.client.request).not.toHaveBeenCalled();
  });

  it('exempts raw payer and Safe target calls from forwarder reservations', async () => {
    vi.stubGlobal('navigator', {});
    await expect(relayrPostBundle([{ chain: 8453, target: TARGET, data: '0x1234', value: '0' }], journal('raw')))
      .resolves.toHaveProperty('bundle_uuid');
    expect(reservations()).toEqual([]);
    expect(state.client.getBlock).not.toHaveBeenCalled();
  });
});
