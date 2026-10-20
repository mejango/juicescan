import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ prepare: vi.fn(), execute: vi.fn(), contractRead: vi.fn(), account: '0x1111111111111111111111111111111111111111' }));
vi.mock('@bananapus/nana-sdk-core/v6', async original => ({ ...await original(), getProjectNftInventory: async () => null, prepareUserPay: runtime.prepare }));
vi.mock('../src/component-base.js', async original => ({ ...await original(),
  getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account, getViewAs: () => null, isSafeConnected: () => false,
  executeTransaction: runtime.execute,
  createPublicClientForChain: chainId => ({ readContract: call => runtime.contractRead({ ...call, fixtureChainId: Number(chainId) }), getBalance: async () => 10n ** 21n }) }));
import { getAddress } from '../src/abi-registry.js';
import { renderPayCard } from '../src/discover.js';

const NATIVE = '0x000000000000000000000000000000000000EEEe';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const terminal = getAddress('JBMultiTerminal', 8453);
let contexts;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const prepared = (metadata, minReturnedTokens) => ({ metadata, minReturnedTokens, preview: { beneficiaryTokenCount: minReturnedTokens + 10n, reservedTokenCount: 0n } });

beforeEach(() => {
  document.body.innerHTML = '';
  contexts = [{ token: NATIVE, decimals: 18, currency: 61166 }];
  runtime.prepare.mockReset(); runtime.execute.mockReset();
  runtime.contractRead.mockReset().mockImplementation(async call => {
    if (call.functionName === 'accountingContextsOf') return contexts;
    if (call.functionName === 'terminalsOf') return [terminal];
    if (call.functionName === 'balanceOf') return 10n ** 12n;
    throw new Error('Unexpected read ' + call.functionName);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 40 }) });
});

async function card(id) {
  document.body.append(renderPayCard({ id, chainId: 8453, ruleset: { start: 0, weight: 10n ** 18n }, isRevnet: false }));
  await vi.waitFor(() => expect(document.querySelector('.paybox-amount-row').hidden).toBe(false));
  await vi.waitFor(() => expect(runtime.contractRead.mock.calls.some(([c]) => c.functionName === 'accountingContextsOf')).toBe(true));
  await new Promise(resolve => setTimeout(resolve, 0));
}
function type(value) { const input = document.querySelector('.paybox-amount-row input'); input.value = value; input.dispatchEvent(new Event('input')); }
const payButton = () => document.querySelector('.paybox > .paybox-amount-row .paybox-btn');
const confirmButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Confirm & Pay');
async function review() { payButton().click(); await vi.waitFor(() => expect(confirmButton()).toBeTruthy()); }

it('sends prepareUserPay metadata and minimum to the terminal for exactly the reviewed amount', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n));
  await card(601); type('1');
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
  expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ chainId: 8453, terminal, projectId: 601n, token: NATIVE, amount: 10n ** 18n, beneficiary: runtime.account, slippageBps: 100n, tiers: undefined });
  await vi.waitFor(() => expect(document.querySelector('.paybox-yg-val').textContent).not.toBe('…'));
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  const tx = runtime.execute.mock.lastCall[0];
  expect(tx.address).toBe(terminal);
  expect(tx.functionName).toBe('pay');
  expect(tx.args).toEqual([601n, NATIVE, 10n ** 18n, runtime.account, 900n, '', '0xaa']);
  expect(tx.value).toBe(10n ** 18n);
  expect(tx.tokenAddr).toBeNull();
});

it('approves the terminal for exactly the amount of a directly accepted ERC-20', async () => {
  contexts = [{ token: USDC, decimals: 6, currency: 2 }];
  runtime.prepare.mockResolvedValue(prepared('0xbb', 5n));
  await card(602); type('25');
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
  expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ token: USDC, amount: 25_000_000n, terminal });
  await vi.waitFor(() => expect(document.querySelector('.paybox-yg-val').textContent).not.toBe('…'));
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  const tx = runtime.execute.mock.lastCall[0];
  expect(tx.args).toEqual([602n, USDC, 25_000_000n, runtime.account, 5n, '', '0xbb']);
  expect(tx.value).toBe(0n);
  expect([tx.tokenAddr, tx.spenderAddr, tx.approvalAmount]).toEqual([USDC, terminal, 25_000_000n]);
});

it('never sends while the quote loads, after it fails, or with a late quote for older inputs', async () => {
  const first = deferred(), second = deferred();
  runtime.prepare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockRejectedValueOnce(new Error('JBPrices_PriceFeedNotFound'));
  await card(603); type('1');
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
  payButton().click(); // still loading
  type('100');
  first.resolve(prepared('0x01', 1n)); // the 1 ETH quote lands after the amount changed
  await new Promise(resolve => setTimeout(resolve, 0));
  payButton().click();
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(confirmButton()).toBeFalsy();
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(2));
  expect(runtime.prepare.mock.lastCall[1].amount).toBe(100n * 10n ** 18n);
  second.resolve(prepared('0x02', 12n * 10n ** 18n));
  await vi.waitFor(() => expect(document.querySelector('.paybox-yg-val').textContent).toContain('12'));
  await review();
  type('7'); // changed after review: the open confirmation must not send
  confirmButton().click();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.body.textContent).toContain('changed during the final check');
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(document.querySelector('.paybox-yg-val').textContent).toContain('preview unavailable'));
  payButton().click();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(runtime.execute).not.toHaveBeenCalled();
});
