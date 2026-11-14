// The tool forms open their review at the click and fill it in: the reads that decide the exact call still gate the
// send, and a failed read ends the dialog with its reason instead of sending a default.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseEther } from 'viem';

const h = vi.hoisted(() => ({ executeRead: undefined, executeTransaction: undefined }));

vi.mock('../src/wallet.js', () => ({
  getAccount: vi.fn(() => '0x1111111111111111111111111111111111111111'),
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

vi.mock('../src/component-base.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    executeRead: (...args) => h.executeRead(...args),
    executeTransaction: (...args) => h.executeTransaction(...args),
    discoverChains: (pid, cb) => cb([1]),
  };
});

import { renderBurnComponent } from '../src/burn-component.js';
import { renderLaunchComponent } from '../src/launch-component.js';

const CONTROLLER = '0x3333333333333333333333333333333333333333';
const dialog = () => document.querySelector('dialog.modal-dialog');
const rows = () => Array.from(dialog().querySelectorAll('.tx-decoded-arg')).map(n => n.textContent);
const primary = () => dialog().querySelector('.create-modal-foot .create-btn.primary');
const failure = () => dialog().querySelector('.tx-confirm-status.error');
const transact = root => [...root.querySelectorAll('button.btn-transact')].pop();
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred() { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }

beforeEach(() => { h.executeTransaction = vi.fn(); document.body.innerHTML = ''; });
afterEach(() => { window.location.hash = ''; document.querySelectorAll('dialog').forEach(node => node.remove()); });

describe('burn form', () => {
  async function mount() {
    window.location.hash = '#burn?projectId=5&chain=1';
    const root = renderBurnComponent();
    document.body.appendChild(root);
    await flush();
    const input = root.querySelector('input[placeholder="100"]');
    input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true }));
    return root;
  }

  it('shows a balance placeholder until the balance is read', async () => {
    const balance = deferred();
    h.executeRead = vi.fn(() => balance.promise);
    window.location.hash = '#burn?projectId=5&chain=1';
    const root = renderBurnComponent();
    document.body.appendChild(root);
    await flush();
    expect(root.querySelector('.pay-preview .preview-value').textContent).toBe('Loading…');
    balance.resolve(parseEther('5'));
    await flush();
    expect(root.querySelector('.pay-preview .preview-value').textContent).not.toBe('Loading…');
  });

  it('opens the review at the click, reads balance and controller together, and sends only after both', async () => {
    h.executeRead = vi.fn(() => Promise.resolve(parseEther('5')));
    const root = await mount();
    const balance = deferred(), controller = deferred();
    h.executeRead = vi.fn(request => (request.functionName === 'controllerOf' ? controller.promise : balance.promise));
    transact(root).click();
    expect(dialog()).not.toBeNull();
    expect(rows()[0]).toBe('Burning: 5 tokens: gone for good');
    expect(primary().disabled).toBe(true);
    expect(dialog().querySelector('.tx-confirm-agree input').disabled).toBe(true);
    expect(h.executeRead.mock.calls.map(call => call[0].functionName).sort()).toEqual(['controllerOf', 'totalBalanceOf']);
    balance.resolve(parseEther('5'));
    await flush();
    expect(h.executeTransaction).not.toHaveBeenCalled();
    controller.resolve(CONTROLLER);
    await vi.waitFor(() => expect(h.executeTransaction).toHaveBeenCalledTimes(1));
    const request = h.executeTransaction.mock.calls[0][0];
    expect(request.address).toBe(CONTROLLER);
    expect(request.confirmSession.fail).toBeTypeOf('function');
    expect(request.reverify).toBeTypeOf('function');
  });

  it('ends the review with the reason when a check fails', async () => {
    h.executeRead = vi.fn(() => Promise.resolve(parseEther('5')));
    const root = await mount();
    h.executeRead = vi.fn(request => (request.functionName === 'controllerOf' ? Promise.reject(new Error('rpc')) : Promise.resolve(parseEther('5'))));
    transact(root).click();
    await vi.waitFor(() => expect(failure()).not.toBeNull());
    expect(failure().textContent).toBe('Could not verify the current balance and project controller.');
    expect(primary().disabled).toBe(true);
    expect(h.executeTransaction).not.toHaveBeenCalled();
  });

  it('ends the review when the balance fell below the amount', async () => {
    h.executeRead = vi.fn(() => Promise.resolve(parseEther('5')));
    const root = await mount();
    h.executeRead = vi.fn(request => Promise.resolve(request.functionName === 'controllerOf' ? CONTROLLER : parseEther('4')));
    transact(root).click();
    await vi.waitFor(() => expect(failure()).not.toBeNull());
    expect(failure().textContent).toBe('Your balance changed. Review the amount before burning.');
    expect(h.executeTransaction).not.toHaveBeenCalled();
  });
});

describe('launch form', () => {
  it('never sends with a fee it could not read', async () => {
    h.executeRead = vi.fn(() => Promise.reject(new Error('rpc')));
    const root = renderLaunchComponent();
    document.body.appendChild(root);
    transact(root).click();
    expect(dialog()).not.toBeNull();
    expect(rows()).toContain('Creation fee: Loading…');
    await vi.waitFor(() => expect(failure()).not.toBeNull());
    expect(failure().textContent).toBe('Could not read the creation fee. Nothing was sent.');
    expect(rows()).toContain('Creation fee: Not loaded');
    expect(primary().disabled).toBe(true);
    expect(h.executeTransaction).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Could not read the creation fee. Nothing was sent.');
  });

  it('sends the fee it read as the transaction value', async () => {
    h.executeRead = vi.fn(() => Promise.resolve(parseEther('0.01')));
    const root = renderLaunchComponent();
    document.body.appendChild(root);
    transact(root).click();
    await vi.waitFor(() => expect(h.executeTransaction).toHaveBeenCalledTimes(1));
    const request = h.executeTransaction.mock.calls[0][0];
    expect(request.value).toBe(parseEther('0.01'));
    expect(request.confirmSummary.rows).toContainEqual(['Creation fee', '0.01 ETH']);
    expect(request.confirmSession.fail).toBeTypeOf('function');
  });
});
