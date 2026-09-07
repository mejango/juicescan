import { afterEach, describe, expect, it, vi } from 'vitest';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const rpc = vi.hoisted(() => ({ request: vi.fn(async () => '0x') }));
vi.mock('../src/component-base.js', () => ({
  getAccount: () => '0x1111111111111111111111111111111111111111', getWalletClient: () => null,
  createPublicClientForChain: () => rpc, getAddress: () => '0x2222222222222222222222222222222222222222', switchChain: vi.fn(),
  getViewAs: () => null, VIEW_AS_TX_ERROR: 'View as is read-only.',
  waitForTrackedTransactionReceipt: vi.fn(), confirmTransactionModal: vi.fn(),
}));
import {
  relayrPostBundle, relayrResumeQuotedBundle, loadRelayrPendingSession, verifyRelayrQuotedRequests,
  RELAYR_PAYMENT_ADDRESS, RELAYR_PAYMENT_SELECTOR, RELAYR_NATIVE_TOKEN,
} from '../src/relayr.js';

const REQUESTS = [{ chain: 8453, target: '0x3333333333333333333333333333333333333333', data: '0x12345678', value: '0' }];
function quote() {
  const id = '01234567-89ab-cdef-0123-456789abcdef';
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  return { bundle_uuid: id, tx_uuids: ['11234567-89ab-cdef-0123-456789abcdef'], payment_info: [{
    chain: 8453, target: RELAYR_PAYMENT_ADDRESS, token: RELAYR_NATIVE_TOKEN, amount: '123', payment_deadline: String(deadline),
    calldata: RELAYR_PAYMENT_SELECTOR + id.replace(/-/g, '').padEnd(64, '0') + BigInt(deadline).toString(16).padStart(64, '0'),
  }] };
}
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); rpc.request.mockReset().mockResolvedValue('0x'); });

describe('Relayr publication recovery', () => {
  it('writes a durable fingerprint guard before exposing signed entries and blocks another publication after an unknown response', async () => {
    const scope = 'publication-unknown';
    const fetch = vi.fn(async () => {
      const saved = loadRelayrPendingSession(scope);
      expect(saved.paymentState).toBe('publication');
      expect(saved.publicationRequestHashes).toHaveLength(1);
      expect(JSON.stringify(saved)).not.toContain(REQUESTS[0].data);
      throw new Error('Connection lost after POST');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(relayrPostBundle(REQUESTS, { scope, account: ACCOUNT })).rejects.toMatchObject({ code: 'RELAYR_PUBLICATION_PENDING' });
    await expect(relayrPostBundle(REQUESTS, { scope, account: ACCOUNT })).rejects.toMatchObject({ code: 'RELAYR_PUBLICATION_PENDING' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retains the exact known quote for another explicit funding choice and preserves a reload guard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => quote() })));
    const scope = 'publication-quoted';
    const result = await relayrPostBundle(REQUESTS, { scope, account: ACCOUNT });
    expect(loadRelayrPendingSession(scope)).toMatchObject({ paymentState: 'quoted', bundleUuid: result.bundle_uuid });
    expect(relayrResumeQuotedBundle(scope)).toBe(result);
    expect(relayrResumeQuotedBundle(scope).payment_info[0].amount).toBe('123');
    vi.resetModules();
    const reloaded = await import('../src/relayr.js');
    expect(reloaded.relayrResumeQuotedBundle(scope)).toBeNull();
    expect(reloaded.loadRelayrPendingSession(scope).paymentState).toBe('quoted');
    await expect(reloaded.relayrPostBundle(REQUESTS, { scope, account: ACCOUNT })).rejects.toMatchObject({ code: 'RELAYR_PUBLICATION_PENDING' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not publish when its guard cannot be persisted', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(relayrPostBundle(REQUESTS, { scope: 'publication-no-storage', account: ACCOUNT })).rejects.toThrow(/Nothing was published or paid/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('re-simulates the original quoted calldata/value and rejects stale signed requests with only a balance override', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => quote() })));
    const requests = [{ ...REQUESTS[0], value: '123' }];
    const quoted = await relayrPostBundle(requests, { scope: 'publication-reverify', account: ACCOUNT });
    requests[0].data = '0xdeadbeef'; requests[0].value = '999';
    await verifyRelayrQuotedRequests(quoted.bundle_uuid, ACCOUNT);
    expect(rpc.request).toHaveBeenCalledWith({ method: 'eth_call', params: [
      { from: ACCOUNT, to: REQUESTS[0].target, data: REQUESTS[0].data, value: '0x7b', gas: '0x1c9c380' },
      'latest', { [ACCOUNT]: { balance: '0x7b' } },
    ] });
    rpc.request.mockRejectedValue(new Error('Forwarder nonce changed'));
    await expect(verifyRelayrQuotedRequests(quoted.bundle_uuid, ACCOUNT)).rejects.toThrow(/no longer simulates/);
  });
});
