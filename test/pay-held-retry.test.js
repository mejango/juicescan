// The Pay tool with the real executeTransaction and write hold: a payment whose receipt watch gave up keeps
// holding the action, even when a retry would resolve to a different payment contract.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { walletInvocationFor } from './wallet-invocation-fixture.js';

const h = vi.hoisted(() => ({
  NATIVE: '0x000000000000000000000000000000000000eeee',
  ROUTER: '0x1111111111111111111111111111111111111111',
  TERMINAL: '0x2222222222222222222222222222222222222222',
  account: '0x3333333333333333333333333333333333333333',
  wallet: null, client: null, prepare: null,
}));
vi.mock('../src/wallet.js', async (original) => ({ ...await original(),
  getAccount: () => h.account, getWalletClient: () => h.wallet, createPublicClientForChain: () => h.client,
  invokeWallet: (...args) => walletInvocationFor(h)(...args), isSafeConnected: () => false, waitForSafeInitialization: async () => {} }));
vi.mock('../src/component-base.js', async (original) => ({ ...await original(),
  parseHashDefaults: () => ({ projectId: '7', chain: '1', amount: '1' }),
  discoverChains: (_projectId, callback) => callback([1]),
  createProjectAndChainInput: () => document.createElement('div'),
  getBeneficiaryAddress: () => h.account,
  getChainTokens: () => [{ address: h.NATIVE, symbol: 'ETH', decimals: 18 }],
  getAddress: (name) => name === 'JBRouterTerminalRegistry' ? h.ROUTER : h.TERMINAL,
  createPublicClientForChain: () => h.client,
}));
vi.mock('../src/fee-buyback-review.js', () => ({
  mountFeeBuybackReview: (_host, _call, changed) => { changed({ busy: false, label: null }); return { stop() {}, confirm: async () => true }; },
}));
vi.mock('../src/pay-preview.js', () => ({
  computePayPreview: () => new Promise(() => {}),
  prepareCardPay: (...args) => h.prepare(...args),
  formatTokenCount: (value) => String(value),
  renderRoutingTag: () => document.createElement('span'),
  renderAmmSub: () => null,
}));

import { renderPayComponent } from '../src/pay-component.js';

const HASH = '0x' + 'a'.repeat(64);
const quote = (received) => ({ received, reserved: 0n, minReturnedTokens: received * 99n / 100n, metadata: '0x', unavailable: false });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_key, _options, fn) => fn({})) } });
  h.wallet = { getChainId: vi.fn(async () => 1), writeContract: vi.fn(async () => HASH) };
  h.client = {
    simulateContract: vi.fn(async (request) => ({ request })),
    estimateContractGas: vi.fn(async () => 100000n),
    waitForTransactionReceipt: vi.fn(async () => { throw new Error('receipt watch lost'); }),
    getTransaction: vi.fn(async () => ({ hash: HASH, from: h.account, blockNumber: null })),
    readContract: vi.fn(async () => { throw new Error('no reads'); }),
  };
  h.prepare = vi.fn(async () => quote(100n));
});

async function pressPayAndConfirm(component) {
  component.querySelector('.pay-btn').click();
  for (let i = 0; i < 50 && !document.querySelector('dialog.modal-dialog'); i++) await flush();
  const dialog = document.querySelector('dialog.modal-dialog');
  if (!dialog) return false;
  dialog.querySelector('.create-modal-foot .create-btn.primary').click();
  for (let i = 0; i < 20; i++) await flush();
  return dialog;
}

describe('Pay tool retry after a lost receipt watch', () => {
  it('never signs a second payment while the first one is outstanding, even on another route', async () => {
    const component = renderPayComponent();
    document.body.appendChild(component);
    const first = await pressPayAndConfirm(component);
    expect(first).toBeTruthy();
    await vi.waitFor(() => expect(component.textContent).toContain('confirmation tracking is temporarily unavailable'));
    expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(h.wallet.writeContract.mock.calls[0][0].address).toBe(h.TERMINAL);
    first.querySelector('.modal-close').click();

    // The direct terminal's quote now fails, so a fresh route resolution would pick the router.
    h.prepare = vi.fn(async ({ terminal }) => { if (terminal === h.TERMINAL) throw new Error('quote failed'); return quote(100n); });
    const second = await pressPayAndConfirm(component);
    for (let i = 0; i < 20; i++) await flush();
    expect(h.wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(component.textContent).toMatch(/still pending/i);
    if (second) second.remove();
  });
});
