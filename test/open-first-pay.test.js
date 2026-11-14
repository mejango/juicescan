import { beforeEach, expect, it, vi } from 'vitest';

// The pay review opens at the click. Its Confirm stays locked until the project's terminal and the wallet's balance
// are verified, and a failed check ends the review without a send. The Cash out button answers its click while the
// NFT inventory read decides which modal opens.
const runtime = vi.hoisted(() => ({ prepare: vi.fn(), execute: vi.fn(), contractRead: vi.fn(), inventory: vi.fn(), balance: null, account: '0x1111111111111111111111111111111111111111' }));
vi.mock('../src/pay-prepare.js', async original => ({ ...await original(), prepareUserPay: runtime.prepare }));
vi.mock('../src/nft-inventory-read.js', async original => ({ ...await original(), getProjectNftInventory: (...args) => runtime.inventory(...args) }));
vi.mock('../src/component-base.js', async original => ({ ...await original(),
  getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account, getViewAs: () => null, isSafeConnected: () => false,
  executeTransaction: runtime.execute,
  createPublicClientForChain: chainId => ({ readContract: call => runtime.contractRead({ ...call, fixtureChainId: Number(chainId) }), getBalance: () => runtime.balance(), getCode: async () => '0x', getBlock: async () => ({ timestamp: 1_800_000_000n }) }) }));
import { getAddress } from '../src/abi-registry.js';
import { opsActionsRow, renderPayCard } from '../src/discover.js';

const NATIVE = '0x000000000000000000000000000000000000EEEe';
const terminal = getAddress('JBMultiTerminal', 8453);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let terminals;

beforeEach(() => {
  document.body.innerHTML = ''; vi.unstubAllGlobals();
  terminals = async () => [terminal];
  runtime.balance = async () => 10n ** 21n;
  runtime.prepare.mockReset().mockResolvedValue({ metadata: '0xaa', minReturnedTokens: 900n, preview: { beneficiaryTokenCount: 910n, reservedTokenCount: 0n } });
  runtime.execute.mockReset(); runtime.inventory.mockReset().mockResolvedValue(null);
  runtime.contractRead.mockReset().mockImplementation(async call => {
    if (call.functionName === 'accountingContextsOf') return [{ token: NATIVE, decimals: 18, currency: 61166 }];
    if (call.functionName === 'terminalsOf') return terminals();
    if (call.functionName === 'previewPayFor') return [{ id: 1n }, 1n, 0n, []];
    if (call.functionName === 'balanceOf') return 10n ** 12n;
    throw new Error('Unexpected read ' + call.functionName);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 40 }) });
});

const payButton = () => document.querySelector('.paybox > .paybox-amount-row .paybox-btn');
const confirmButton = () => [...document.querySelectorAll('dialog button')].find(b => b.textContent === 'Confirm & Pay');
const dialogStatus = () => document.querySelector('dialog .tx-confirm-status');
async function quotedCard(id) {
  document.body.append(renderPayCard({ id, chainId: 8453, ruleset: { start: 0, weight: 10n ** 18n }, isRevnet: false }));
  await vi.waitFor(() => expect(document.querySelector('.paybox-amount-row').hidden).toBe(false));
  await vi.waitFor(() => expect(runtime.contractRead.mock.calls.some(([c]) => c.functionName === 'accountingContextsOf')).toBe(true));
  await new Promise(resolve => setTimeout(resolve, 0));
  const input = document.querySelector('.paybox-amount-row input'); input.value = '1'; input.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(document.querySelector('.paybox-yg-val').textContent).not.toBe('…'));
}

it('opens the pay review at the click and unlocks Confirm only once the terminal and balance are verified', async () => {
  await quotedCard(701);
  const surface = deferred(), balance = deferred();
  terminals = () => surface.promise; runtime.balance = () => balance.promise;
  payButton().click();
  await vi.waitFor(() => expect(confirmButton()).toBeTruthy()); // neither read has answered yet
  expect(confirmButton().disabled).toBe(true);
  expect(dialogStatus().textContent).toBe('Checking the project terminal and your balance…');
  confirmButton().click();
  surface.resolve([terminal]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(confirmButton().disabled).toBe(true); // the terminal alone is not enough
  balance.resolve(10n ** 21n);
  await vi.waitFor(() => expect(confirmButton().disabled).toBe(false));
  expect(runtime.execute).not.toHaveBeenCalled();
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  expect(runtime.execute.mock.lastCall[0].args).toEqual([701n, NATIVE, 10n ** 18n, runtime.account, 900n, '', '0xaa']);
});

it('ends the pay review with the reason when the wallet cannot cover the amount, and sends nothing', async () => {
  await quotedCard(702);
  runtime.balance = async () => 10n ** 17n;
  payButton().click();
  await vi.waitFor(() => expect(dialogStatus().textContent).toContain('Not enough ETH'));
  expect(dialogStatus().className).toContain('error');
  expect(confirmButton().style.display).toBe('none');
  expect(document.querySelector('.paybox > .paybox-status').textContent).toContain('Not enough ETH');
  expect(runtime.execute).not.toHaveBeenCalled();
});

it('ends the pay review when the payment terminal cannot be read', async () => {
  await quotedCard(703);
  terminals = async () => { throw new Error('rpc down'); };
  payButton().click();
  await vi.waitFor(() => expect(dialogStatus().textContent).toBe('Could not verify this project’s payment terminal. Review the project contracts before paying.'));
  expect(confirmButton().style.display).toBe('none');
  expect(runtime.execute).not.toHaveBeenCalled();
});

it('marks the Cash out button busy while the inventory read decides which modal opens', async () => {
  const inventory = deferred();
  runtime.inventory.mockReturnValue(inventory.promise);
  const row = opsActionsRow({ id: 704, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false }, { noLoans: true }); document.body.append(row);
  const button = [...row.querySelectorAll('button')].find(b => b.textContent === 'Cash out');
  button.click();
  expect([button.disabled, button.getAttribute('aria-busy'), button.textContent]).toEqual([true, 'true', 'Loading…']);
  button.click();
  expect(document.querySelector('dialog')).toBeNull();
  inventory.resolve(null);
  await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
  expect([button.disabled, button.getAttribute('aria-busy'), button.textContent]).toEqual([false, null, 'Cash out']);
  expect(document.querySelectorAll('dialog').length).toBe(1);
});
