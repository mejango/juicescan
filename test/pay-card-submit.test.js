import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ prepare: vi.fn(), execute: vi.fn(), contractRead: vi.fn(), sign: vi.fn(), inventory: vi.fn(), account: '0x1111111111111111111111111111111111111111' }));
vi.mock('@bananapus/nana-sdk-core/v6', async original => ({ ...await original(), getProjectNftInventory: (...args) => runtime.inventory(...args), prepareUserPay: runtime.prepare }));
vi.mock('../src/component-base.js', async original => ({ ...await original(),
  getAccount: () => runtime.account, getEffectiveAccount: () => runtime.account, getViewAs: () => null, isSafeConnected: () => false,
  executeTransaction: runtime.execute,
  getWalletClient: () => ({ getChainId: async () => 8453, signTypedData: runtime.sign }),
  createPublicClientForChain: chainId => ({ readContract: call => runtime.contractRead({ ...call, fixtureChainId: Number(chainId) }), getBalance: async () => 10n ** 21n, getCode: async () => '0x', getBlock: async () => ({ timestamp: 1_800_000_000n }) }) }));
import { getAddress } from '../src/abi-registry.js';
import { buildUserPayMetadata } from '@bananapus/nana-sdk-core/v6';
import { hookMetadataId } from '@bananapus/nana-sdk-core';
import { decodeAbiParameters, encodeErrorResult } from 'viem';
import { makeNftCart, renderPayCard } from '../src/discover.js';

const NATIVE = '0x000000000000000000000000000000000000EEEe';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const terminal = getAddress('JBMultiTerminal', 8453);
const registry = getAddress('JBRouterTerminalRegistry', 8453);
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
let contexts, terminals;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const prepared = (metadata, minReturnedTokens) => ({ metadata, minReturnedTokens, preview: { beneficiaryTokenCount: minReturnedTokens + 10n, reservedTokenCount: 0n } });

beforeEach(() => {
  document.body.innerHTML = ''; vi.unstubAllGlobals();
  contexts = [{ token: NATIVE, decimals: 18, currency: 61166 }]; terminals = [terminal];
  runtime.prepare.mockReset(); runtime.execute.mockReset(); runtime.sign.mockReset(); runtime.inventory.mockReset().mockResolvedValue(null);
  runtime.contractRead.mockReset().mockImplementation(async call => {
    if (call.functionName === 'accountingContextsOf') return contexts;
    if (call.functionName === 'terminalsOf') return terminals;
    if (call.functionName === 'previewPayFor') return [{ id: 1n }, 1n, 0n, []]; // the router can route this token
    if (call.functionName === 'allowance') return call.address === PERMIT2 ? [0n, 0n, 0n] : 2n ** 255n;
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

const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
async function quoted(text) { await vi.waitFor(() => expect(document.querySelector('.paybox-yg-val').textContent).toContain(text)); }

it('opens no confirmation while the quote loads', async () => {
  runtime.prepare.mockReturnValueOnce(deferred().promise);
  await card(603); type('1');
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
  payButton().click(); await settle(50);
  expect(confirmButton()).toBeFalsy();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it('opens no confirmation after a refreshed quote fails', async () => {
  runtime.prepare.mockImplementation(async (_, args) => {
    if (args.amount === 10n ** 18n) return prepared('0x01', 10n ** 18n);
    throw new Error('JBPrices_PriceFeedNotFound');
  });
  await card(604); type('1'); await quoted('1');
  type('2'); await quoted('preview unavailable');
  payButton().click(); await settle(50);
  expect(confirmButton()).toBeFalsy();
  expect(runtime.execute).not.toHaveBeenCalled();
});

it('drops a late quote for an older amount', async () => {
  const first = deferred();
  runtime.prepare.mockReturnValueOnce(first.promise).mockResolvedValueOnce(prepared('0x02', 12n * 10n ** 18n));
  await card(605); type('1');
  await vi.waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
  type('100');
  first.resolve(prepared('0x01', 1n)); // the 1 ETH quote lands after the amount changed
  await settle(0);
  payButton().click(); await settle(50);
  expect(confirmButton()).toBeFalsy();
  await quoted('12');
  expect(runtime.prepare.mock.lastCall[1].amount).toBe(100n * 10n ** 18n);
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  expect(runtime.execute.mock.lastCall[0].args.slice(2)).toEqual([100n * 10n ** 18n, runtime.account, 12n * 10n ** 18n, '', '0x02']);
});

it('does not send when the amount changes after review', async () => {
  runtime.prepare.mockResolvedValue(prepared('0x01', 10n ** 18n));
  await card(606); type('1'); await quoted('1');
  await review();
  type('7'); confirmButton().click(); await settle(0);
  expect(document.body.textContent).toContain('changed during the final check');
  expect(runtime.execute).not.toHaveBeenCalled();
});

async function routedUsdc(id, metadata) {
  terminals = [terminal, registry];
  runtime.prepare.mockResolvedValue(prepared(metadata, 5n * 10n ** 18n));
  await card(id);
  const usdcOption = () => [...document.querySelectorAll('select option')].find(o => o.textContent.includes('USDC'));
  await vi.waitFor(() => expect(usdcOption()).toBeTruthy());
  const select = usdcOption().parentElement;
  select.value = usdcOption().value;
  select.dispatchEvent(new Event('change'));
  type('100'); await quoted('5');
  expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ terminal: registry, token: USDC.toLowerCase(), amount: 100_000_000n });
}

it('adds the router Permit2 allowance to the prepared metadata of a routed payment', async () => {
  const base = buildUserPayMetadata({ chainId: 8453, minimumSwapAmountOut: 7n });
  runtime.sign.mockResolvedValue('0x' + '11'.repeat(65));
  await routedUsdc(607, base);
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  const tx = runtime.execute.mock.lastCall[0];
  expect(tx.address).toBe(registry);
  expect(tx.args.slice(0, 6)).toEqual([607n, USDC.toLowerCase(), 100_000_000n, runtime.account, 5n * 10n ** 18n, '']);
  expect(tx.args[6]).not.toBe(base);
  expect(tx.args[6].includes(base.slice(2 + 128))).toBe(true); // the buyback quote rides along unchanged
  expect(runtime.sign.mock.lastCall[0].message.details.amount).toBe(100_000_000n);
  expect(tx.tokenAddr).toBeNull();
});

it('does not send a routed payment whose inputs changed while the signature was pending', async () => {
  const signature = deferred();
  runtime.sign.mockReturnValueOnce(signature.promise);
  await routedUsdc(608, buildUserPayMetadata({ chainId: 8453 }));
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.sign).toHaveBeenCalledTimes(1));
  runtime.prepare.mockRejectedValue(new Error('JBPrices_PriceFeedNotFound'));
  type('1'); await quoted('preview unavailable');
  signature.resolve('0x' + '11'.repeat(65)); await settle(50);
  expect(runtime.execute).not.toHaveBeenCalled();
});

it('guards execution waits with the reviewed inputs', async () => {
  runtime.prepare.mockResolvedValue(prepared('0x01', 10n ** 18n));
  await card(609); type('1'); await quoted('1');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  const { assertWriteState } = runtime.execute.mock.lastCall[0];
  expect(() => assertWriteState()).not.toThrow();
  type('2');
  expect(() => assertWriteState()).toThrow('changed');
});

// Synthetic JB721 shop: tiers priced in the project's native accounting currency, so no price feed is needed.
const HOOK = '0x' + '72'.repeat(20), STORE = '0x' + '73'.repeat(20), ID_TARGET = '0x' + '74'.repeat(20);
const TIERS = [{ id: 1n, price: 10n ** 16n }, { id: 2n, price: 3n * 10n ** 16n }].map(t => ({ ...t, initialSupply: 100, remainingSupply: 100, category: 1, discountPercent: 0, encodedIpfsUri: '0x' + '00'.repeat(32), flags: {} }));
// The 721 hook's tier ids in JBMetadataResolver pay metadata, as the hook reads them.
function mintedTierIds(metadata) {
  const body = metadata.slice(2), want = hookMetadataId(ID_TARGET, 'pay').slice(2);
  const tableEnd = parseInt(body.slice(72, 74), 16) * 64;
  for (let i = 64; i + 10 <= tableEnd; i += 10) {
    if (body.slice(i, i + 8) !== want) continue;
    const [, ids] = decodeAbiParameters([{ type: 'bool' }, { type: 'uint16[]' }], '0x' + body.slice(parseInt(body.slice(i + 8, i + 10), 16) * 64));
    return ids.map(Number);
  }
  return null;
}

it('mints the rendered cart selection: its tier ids reach preparation and the submitted pay metadata', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); }); // indexer tier metadata is optional
  runtime.inventory.mockResolvedValue({ protocol: 'jb721', hook: HOOK, store: STORE, metadataIdTarget: ID_TARGET, blockNumber: 1n, nextStartingId: null,
    pricing: { currency: 61166, decimals: 18 }, ruleset: { metadata: { useDataHookForCashOut: false } },
    capabilities: { genericPay: true, genericCashOut: true, manageTiers: true }, tiers: [] });
  const base = runtime.contractRead.getMockImplementation();
  runtime.contractRead.mockImplementation(async call => {
    switch (call.functionName) {
      case 'controllerOf': return '0x' + '75'.repeat(20);
      case 'currentRulesetOf': return [{ id: 1n }, { useDataHookForPay: true, dataHook: HOOK, useDataHookForCashOut: false, metadata: 0 }];
      case 'tokenUriResolverOf': return '0x' + '00'.repeat(20);
      case 'maxTierIdOf': return 2n;
      case 'tiersOf': return TIERS;
      case 'payCreditsOf': return 0n;
      default: return base(call);
    }
  });
  runtime.prepare.mockImplementation(async (_, args) => prepared(buildUserPayMetadata({ chainId: 8453, tiers: args.tiers, minimumSwapAmountOut: 0n }), 1n));
  await card(610);
  await vi.waitFor(() => expect(document.querySelectorAll('.paybox-shop-item')).toHaveLength(2));
  const [first, second] = document.querySelectorAll('.paybox-shop-item');
  first.querySelector('.paybox-shop-thumb').click();
  first.querySelectorAll('.paybox-shop-stepbtn')[1].click(); // two of tier 1
  second.querySelector('.paybox-shop-thumb').click();
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall?.[1].tiers?.tierIdsToMint).toEqual([1n, 1n, 2n]));
  expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ terminal, token: NATIVE, amount: 5n * 10n ** 16n, tiers: { metadataIdTarget: ID_TARGET, allowOverspending: true } });
  await quoted('1');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  const tx = runtime.execute.mock.lastCall[0];
  expect(tx.args.slice(0, 5)).toEqual([610n, NATIVE, 5n * 10n ** 16n, runtime.account, 1n]);
  expect(mintedTierIds(tx.args[6])).toEqual([1, 1, 2]);
});

const shortfallAbi = [{ type: 'error', name: 'JBMultiTerminal_UnderMin', inputs: [{ name: 'received', type: 'uint256' }, { name: 'minimum', type: 'uint256' }] }];
const underMin = (received, minimum) => ({ shortMessage: 'Execution reverted.', data: encodeErrorResult({ abi: shortfallAbi, errorName: 'JBMultiTerminal_UnderMin', args: [received, minimum] }) });
const reviewAgainButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Review again');

it('says why a payment fell short and re-quotes it with the tolerance the payer chose', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await card(611); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  expect(document.querySelector('.tx-confirm-status').textContent).toBe('This payment would get fewer tokens than your minimum, so lower your minimum or try again.');
  // 1% plus the 2.3% shortfall, rounded up to a half percent.
  const custom = document.querySelector('.pay-retry-slippage input');
  expect(custom.value).toBe('3.5');
  // The SDK's 49.5% cap bounds the custom field, checked once rounded.
  custom.value = '49.999'; custom.dispatchEvent(new Event('change'));
  expect(custom.value).toBe('3.5');
  custom.value = '5'; custom.dispatchEvent(new Event('change'));
  runtime.prepare.mockResolvedValue(prepared('0xbb', 860n * 10n ** 18n));
  reviewAgainButton().click();
  await vi.waitFor(() => expect(confirmButton()).toBeTruthy());
  expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ amount: 10n ** 18n, slippageBps: 500n });
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(2));
  expect(runtime.execute.mock.lastCall[0].args).toEqual([611n, NATIVE, 10n ** 18n, runtime.account, 860n * 10n ** 18n, '', '0xbb']);
  // The loosened tolerance belongs to that payment: another amount is quoted at the default again.
  type('2');
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ amount: 2n * 10n ** 18n, slippageBps: 100n }));
});

const pausedAbi = [{ type: 'error', name: 'JBTerminalStore_RulesetPaymentPaused', inputs: [{ type: 'uint256' }, { type: 'uint256' }] }];
it.each([
  ['a known revert with its reason', encodeErrorResult({ abi: pausedAbi, errorName: 'JBTerminalStore_RulesetPaymentPaused', args: [1n, 2n] }), 'This project is not accepting payments right now.'],
  ['a truncated revert as unknown', '0x8dc14446', 'Execution reverted.'],
])('shows %s, without offering a looser minimum', async (_, data, line) => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: { shortMessage: 'reverted', data } }));
  await card(612); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(document.querySelector('.tx-confirm-status').textContent).toBe(line));
  expect(reviewAgainButton()).toBeFalsy();
  expect(document.querySelector('.pay-retry-slippage')).toBeNull();
});

it('drops a loosened tolerance when the payment changed before Review again', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await card(613); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  type('3'); // the payment changes under the open dialog
  const calls = runtime.prepare.mock.calls.length;
  reviewAgainButton().click(); await settle(500);
  expect(confirmButton()).toBeFalsy();
  expect(runtime.prepare.mock.calls.slice(calls).every(([, args]) => args.slippageBps === 100n)).toBe(true);
  expect(runtime.execute).toHaveBeenCalledTimes(1);
});

it('opens the review in one click after a memo edit, with the memo sent', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  await card(620); type('1'); await quoted('900');
  const calls = runtime.prepare.mock.calls.length;
  const memo = document.querySelector('.paybox-memo');
  memo.value = 'hello'; memo.dispatchEvent(new Event('input'));
  await review(); // one press of Pay opens it: the memo leaves the quote as it was
  expect(runtime.prepare.mock.calls.length).toBe(calls);
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  expect(runtime.execute.mock.lastCall[0].args[5]).toBe('hello');
});

it('says why a re-quote failed after Review again, and stops there', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await card(621); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  const paused = Object.assign(new Error('Execution reverted.'), { data: encodeErrorResult({ abi: pausedAbi, errorName: 'JBTerminalStore_RulesetPaymentPaused', args: [1n, 2n] }) });
  runtime.prepare.mockRejectedValue(paused);
  const calls = runtime.prepare.mock.calls.length;
  reviewAgainButton().click(); await settle(600);
  expect(document.querySelector('.paybox-status').textContent).toBe('This project is not accepting payments right now.');
  expect(document.querySelector('.paybox-feedback').textContent).toContain('This project is not accepting payments right now.');
  expect(runtime.prepare.mock.calls.length).toBe(calls + 1);
  expect(confirmButton()).toBeFalsy();
});

it('quotes the next payment at the default tolerance once a loosened one went through', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await card(622); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  reviewAgainButton().click();
  await vi.waitFor(() => expect(confirmButton()).toBeTruthy());
  runtime.execute.mockImplementationOnce(tx => tx.onSuccess('Paid.', {}));
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(100n));
});

it('ends a loosened tolerance when the memo changes while it is being prepared', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await card(619); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  const calls = runtime.prepare.mock.calls.length;
  reviewAgainButton().click();
  const memo = document.querySelector('.paybox-memo');
  memo.value = 'another note'; memo.dispatchEvent(new Event('input'));
  await settle(500);
  expect(runtime.prepare.mock.calls.length).toBeGreaterThan(calls);
  expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(100n);
  expect(runtime.execute).toHaveBeenCalledTimes(1);
});

it('ends a loosened tolerance when its review is cancelled, and after its payment is sent', async () => {
  const cancelButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Cancel');
  async function shortfallThenReviewAgain() {
    runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
    await review(); confirmButton().click();
    await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
    reviewAgainButton().click();
    await vi.waitFor(() => expect(confirmButton()).toBeTruthy());
    expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(350n);
  }
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  await card(614); type('1'); await quoted('900');
  await shortfallThenReviewAgain();
  cancelButton().click();
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(100n));

  await quoted('900');
  await shortfallThenReviewAgain();
  runtime.execute.mockImplementationOnce(tx => tx.onSuccess('Confirmed', { phase: 'confirmed', hash: '0x' + '1'.repeat(64), chainId: 8453 }));
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(3));
  type('2'); type('1');
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ amount: 10n ** 18n, slippageBps: 100n }));
});

it('ends a loosened tolerance when a failed retry is closed', async () => {
  const closeButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Close');
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  await card(615); type('1'); await quoted('900');
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  reviewAgainButton().click();
  await vi.waitFor(() => expect(confirmButton()).toBeTruthy());
  expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(350n);
  runtime.execute.mockImplementationOnce(tx => tx.onError('Transaction rejected by wallet', {}));
  confirmButton().click();
  await vi.waitFor(() => expect(closeButton()).toBeTruthy());
  closeButton().click();
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(100n));
});

it('ends a loosened tolerance when the amount is cleared and typed again during its quote', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  await card(617); type('1'); await quoted('900');
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(880n * 10n ** 18n, 900n * 10n ** 18n) }));
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  reviewAgainButton().click();
  type(''); type('1');
  await vi.waitFor(() => expect(runtime.prepare.mock.lastCall[1]).toMatchObject({ amount: 10n ** 18n, slippageBps: 100n }));
});

it('says a payment that would return no tokens was not sent, and offers no looser minimum', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: underMin(0n, 900n * 10n ** 18n) }));
  await card(616); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(document.querySelector('.tx-confirm-status').textContent).toBe('This payment would return no tokens.'));
  expect(reviewAgainButton()).toBeFalsy();
});

it('says a mined revert reverted, and Review again quotes and simulates it afresh', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Transaction reverted onchain. No state changes were applied.', { error: Object.assign(new Error('reverted'), { onchainRevert: true }) }));
  await card(618); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(reviewAgainButton()).toBeTruthy());
  expect(document.querySelector('.tx-confirm-status').textContent).toBe('The payment reverted.');
  expect(document.querySelector('.pay-retry-slippage')).toBeNull();
  const calls = runtime.prepare.mock.calls.length;
  reviewAgainButton().click();
  await vi.waitFor(() => expect(confirmButton()).toBeTruthy());
  expect(runtime.prepare.mock.calls.length).toBe(calls + 1);
  expect(runtime.prepare.mock.lastCall[1].slippageBps).toBe(100n);
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(2));
});

const pausedError = () => Object.assign(new Error('Execution reverted.'), { data: encodeErrorResult({ abi: pausedAbi, errorName: 'JBTerminalStore_RulesetPaymentPaused', args: [1n, 2n] }) });
const PAUSED_LINE = 'This project is not accepting payments right now.';

it('says why a credit-covered checkout cannot be quoted, and Pay says it again after a fresh quote', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  runtime.inventory.mockResolvedValue({ protocol: 'jb721', hook: HOOK, store: STORE, metadataIdTarget: ID_TARGET, blockNumber: 1n, nextStartingId: null,
    pricing: { currency: 61166, decimals: 18 }, ruleset: { metadata: { useDataHookForCashOut: false } },
    capabilities: { genericPay: true, genericCashOut: true, manageTiers: true }, tiers: [] });
  const base = runtime.contractRead.getMockImplementation();
  runtime.contractRead.mockImplementation(async call => {
    switch (call.functionName) {
      case 'controllerOf': return '0x' + '75'.repeat(20);
      case 'currentRulesetOf': return [{ id: 1n }, { useDataHookForPay: true, dataHook: HOOK, useDataHookForCashOut: false, metadata: 0 }];
      case 'tokenUriResolverOf': return '0x' + '00'.repeat(20);
      case 'maxTierIdOf': return 2n;
      case 'tiersOf': return TIERS;
      case 'payCreditsOf': return 10n ** 18n; // credits cover the cart: nothing to pay
      default: return base(call);
    }
  });
  runtime.prepare.mockRejectedValue(pausedError());
  await card(630);
  await vi.waitFor(() => expect(document.querySelectorAll('.paybox-shop-item')).toHaveLength(2));
  document.querySelector('.paybox-shop-item .paybox-shop-thumb').click();
  await vi.waitFor(() => expect(document.querySelector('.paybox-feedback').textContent).toContain(PAUSED_LINE));
  const calls = runtime.prepare.mock.calls.length;
  payButton().click();
  await vi.waitFor(() => expect(document.querySelector('.paybox-status').textContent).toBe(PAUSED_LINE));
  expect(runtime.prepare.mock.calls.length).toBe(calls + 1);
  expect(confirmButton()).toBeFalsy();
});

it('quotes again on Pay after a quote failed, and opens the review in that one click once it passes', async () => {
  runtime.prepare.mockRejectedValue(pausedError());
  await card(631); type('1');
  await vi.waitFor(() => expect(document.querySelector('.paybox-feedback').textContent).toContain(PAUSED_LINE));
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  payButton().click();
  await vi.waitFor(() => expect(confirmButton()).toBeTruthy());
  expect(document.querySelector('.paybox-feedback').textContent).not.toContain(PAUSED_LINE);
});

it('credits read failure blocks checkout amount', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  runtime.inventory.mockResolvedValue({ protocol: 'jb721', hook: HOOK, store: STORE, metadataIdTarget: ID_TARGET, blockNumber: 1n, nextStartingId: null,
    pricing: { currency: 61166, decimals: 18 }, ruleset: { metadata: { useDataHookForCashOut: false } },
    capabilities: { genericPay: true, genericCashOut: true, manageTiers: true }, tiers: [] });
  const base = runtime.contractRead.getMockImplementation();
  let credits = Promise.reject(new Error('RPC unavailable')); credits.catch(() => {});
  runtime.contractRead.mockImplementation(async call => {
    switch (call.functionName) {
      case 'controllerOf': return '0x' + '75'.repeat(20);
      case 'currentRulesetOf': return [{ id: 1n }, { useDataHookForPay: true, dataHook: HOOK, useDataHookForCashOut: false, metadata: 0 }];
      case 'tokenUriResolverOf': return '0x' + '00'.repeat(20);
      case 'maxTierIdOf': return 2n;
      case 'tiersOf': return TIERS;
      case 'payCreditsOf': return credits;
      default: return base(call);
    }
  });
  runtime.prepare.mockImplementation(async (_, args) => prepared(buildUserPayMetadata({ chainId: 8453, tiers: args.tiers, minimumSwapAmountOut: 0n }), 1n));
  await card(632);
  await vi.waitFor(() => expect(document.querySelectorAll('.paybox-shop-item')).toHaveLength(2));
  document.querySelector('.paybox-shop-item .paybox-shop-thumb').click();
  await vi.waitFor(() => expect(document.querySelector('.paybox-feedback').textContent).toContain('Could not read your NFT credits. Retry'));
  const amount = document.querySelector('.paybox-amount-row input');
  expect(amount.value).toBe(''); // no amount computed as if the payer had 0 credits
  expect(document.querySelector('.paybox-feedback').textContent).not.toContain('Amount due');
  expect(payButton().disabled).toBe(true);
  payButton().disabled = false; payButton().click(); // a forced click still stops at the same line
  await vi.waitFor(() => expect(document.querySelector('.paybox-status').textContent).toBe('Could not read your NFT credits. Retry.'));
  expect(confirmButton()).toBeFalsy();
  const retry = deferred(); credits = retry.promise;
  [...document.querySelectorAll('.paybox-feedback button')].find(b => b.textContent === 'Retry').click();
  await vi.waitFor(() => expect(document.querySelector('.paybox-feedback').textContent).toContain('Your shop credit is still loading'));
  expect(amount.value).toBe(''); // still unknown while the retry reads
  expect(payButton().disabled).toBe(true);
  retry.resolve(0n);
  await vi.waitFor(() => expect(amount.value).toBe('0.01'));
  expect(document.querySelector('.paybox-feedback').textContent).not.toContain('Could not read your NFT credits');
  expect(payButton().disabled).toBe(false);
});

// A project's shop is a separate 721 hook on each chain. Checkout on a chain uses that chain's own hook.
const HOOK_OP = '0x' + '82'.repeat(20), STORE_OP = '0x' + '83'.repeat(20), ID_TARGET_OP = '0x' + '84'.repeat(20);
function twoChainShop({ opInventory }) {
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  const inventoryOf = chainId => ({ protocol: 'jb721', hook: chainId === 10 ? HOOK_OP : HOOK, store: chainId === 10 ? STORE_OP : STORE,
    metadataIdTarget: chainId === 10 ? ID_TARGET_OP : ID_TARGET, blockNumber: 1n, nextStartingId: null,
    pricing: { currency: 61166, decimals: 18 }, ruleset: { metadata: { useDataHookForCashOut: false } },
    capabilities: { genericPay: true, genericCashOut: true, manageTiers: true }, tiers: [] });
  runtime.inventory.mockImplementation(async (_client, args) => (Number(args.chainId) === 10 ? opInventory(inventoryOf(10)) : inventoryOf(8453)));
  const base = runtime.contractRead.getMockImplementation();
  const creditReads = [];
  runtime.contractRead.mockImplementation(async call => {
    switch (call.functionName) {
      case 'controllerOf': return '0x' + '75'.repeat(20);
      case 'currentRulesetOf': return [{ id: 1n }, { useDataHookForPay: true, dataHook: call.fixtureChainId === 10 ? HOOK_OP : HOOK, useDataHookForCashOut: false, metadata: 0 }];
      case 'tokenUriResolverOf': return '0x' + '00'.repeat(20);
      case 'maxTierIdOf': return 2n;
      case 'tiersOf': return call.fixtureChainId === 10 ? TIERS.map(t => ({ ...t, price: t.price * 2n })) : TIERS;
      case 'payCreditsOf': creditReads.push([call.fixtureChainId, call.address]); return 0n;
      default: return base(call);
    }
  });
  runtime.prepare.mockImplementation(async (_, args) => prepared(buildUserPayMetadata({ chainId: 8453, tiers: args.tiers, minimumSwapAmountOut: 0n }), 1n));
  return creditReads;
}
async function twoChainCard(id) {
  document.body.append(renderPayCard({ id, chainId: 8453, ruleset: { start: 0, weight: 10n ** 18n }, isRevnet: false,
    idByChain: { 8453: id, 10: id + 1 }, chains: [{ id: 8453, name: 'Base' }, { id: 10, name: 'Optimism' }] }));
  await vi.waitFor(() => expect(document.querySelector('.paybox-amount-row').hidden).toBe(false));
  await vi.waitFor(() => expect(document.querySelectorAll('.paybox-shop-item')).toHaveLength(2));
  document.querySelector('.paybox-shop-item .paybox-shop-thumb').click();
  const chain = document.querySelector('.paybox-payon select.paybox-select:not(.paybox-mode)');
  chain.value = '10'; chain.dispatchEvent(new Event('change'));
}

it('checks out on another chain with that chain’s own shop hook', async () => {
  const creditReads = twoChainShop({ opInventory: inventory => inventory });
  await twoChainCard(650);
  const onOptimism = ([, args]) => args.chainId === 10 && args.projectId === 651n && args.tiers;
  await vi.waitFor(() => expect(runtime.prepare.mock.calls.some(onOptimism)).toBe(true), { timeout: 5000 });
  const opCalls = runtime.prepare.mock.calls.filter(onOptimism);
  expect(opCalls.every(([, args]) => args.tiers.metadataIdTarget === ID_TARGET_OP)).toBe(true);
  expect(opCalls.at(-1)[1].amount).toBe(2n * 10n ** 16n); // Optimism's own tier price
  expect(creditReads.filter(([chainId]) => chainId === 10).every(([, hook]) => hook === HOOK_OP)).toBe(true);
  expect(creditReads.some(([chainId]) => chainId === 10)).toBe(true);
});

it('blocks checkout on a chain whose shop cannot be read, and Retry reads it again', async () => {
  let fail = true;
  twoChainShop({ opInventory: inventory => { if (fail) throw new Error('RPC unavailable'); return inventory; } });
  await twoChainCard(652);
  const onOptimism = ([, args]) => args.chainId === 10 && args.projectId === 653n && args.tiers;
  await vi.waitFor(() => expect(document.querySelector('.paybox-feedback').textContent).toContain('Could not read the shop on Optimism.'), { timeout: 5000 });
  expect(payButton().disabled).toBe(true);
  expect(runtime.prepare.mock.calls.some(onOptimism)).toBe(false);
  payButton().disabled = false; payButton().click();
  await vi.waitFor(() => expect(document.querySelector('.paybox-status').textContent).toBe('Could not read the shop on Optimism. Retry.'));
  expect(confirmButton()).toBeFalsy();
  fail = false;
  [...document.querySelectorAll('.paybox-feedback button')].find(b => b.textContent === 'Retry').click();
  await vi.waitFor(() => expect(runtime.prepare.mock.calls.some(call => onOptimism(call) && call[1].tiers.metadataIdTarget === ID_TARGET_OP)).toBe(true), { timeout: 5000 });
  expect(payButton().disabled).toBe(false);
});

it('reads the selected chain’s shop even when the home chain’s items cannot be read', async () => {
  twoChainShop({ opInventory: inventory => inventory });
  const base = runtime.contractRead.getMockImplementation();
  runtime.contractRead.mockImplementation(async call => {
    if (call.functionName === 'tiersOf' && call.fixtureChainId === 8453) throw new Error('RPC unavailable');
    return base(call);
  });
  const cart = makeNftCart(); cart.set(1, 1); // chosen in the Shop tab
  document.body.append(renderPayCard({ id: 654, chainId: 8453, ruleset: { start: 0, weight: 10n ** 18n }, isRevnet: false,
    idByChain: { 8453: 654, 10: 655 }, chains: [{ id: 10, name: 'Optimism' }, { id: 8453, name: 'Base' }] }, cart));
  await vi.waitFor(() => expect(runtime.prepare.mock.calls.some(([, args]) => args.chainId === 10 && args.projectId === 655n
    && args.tiers?.metadataIdTarget === ID_TARGET_OP)).toBe(true), { timeout: 5000 });
});

it('keeps an ordinary payment’s open review when the shop finishes loading', async () => {
  const items = deferred();
  runtime.inventory.mockImplementation(async (_client, args) => {
    const inventory = { protocol: 'jb721', hook: HOOK, store: STORE, metadataIdTarget: ID_TARGET, blockNumber: 1n, nextStartingId: null,
      pricing: { currency: 61166, decimals: 18 }, ruleset: { metadata: { useDataHookForCashOut: false } },
      capabilities: { genericPay: true, genericCashOut: true, manageTiers: true }, tiers: [] };
    return args.tierLimit === 1 ? inventory : items.promise.then(() => inventory);
  });
  vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
  const base = runtime.contractRead.getMockImplementation();
  runtime.contractRead.mockImplementation(async call => {
    switch (call.functionName) {
      case 'controllerOf': return '0x' + '75'.repeat(20);
      case 'currentRulesetOf': return [{ id: 1n }, { useDataHookForPay: true, dataHook: HOOK, useDataHookForCashOut: false, metadata: 0 }];
      case 'tokenUriResolverOf': return '0x' + '00'.repeat(20);
      case 'maxTierIdOf': return 2n;
      case 'tiersOf': return TIERS;
      case 'payCreditsOf': return 0n;
      default: return base(call);
    }
  });
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  await card(656); type('1'); await quoted('9');
  await review();
  items.resolve();
  await vi.waitFor(() => expect(document.querySelectorAll('.paybox-shop-item')).toHaveLength(2), { timeout: 5000 });
  await new Promise(resolve => setTimeout(resolve, 600)); // past the quote debounce
  confirmButton().click();
  await vi.waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
  expect(() => runtime.execute.mock.lastCall[0].assertWriteState()).not.toThrow();
});
