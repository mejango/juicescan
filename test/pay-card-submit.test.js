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
import { renderPayCard } from '../src/discover.js';

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

it('shows a known revert reason without offering a looser minimum', async () => {
  runtime.prepare.mockResolvedValue(prepared('0xaa', 900n * 10n ** 18n));
  runtime.execute.mockImplementationOnce(tx => tx.onError('Execution reverted.', { error: { shortMessage: 'reverted', data: '0x8dc14446' } }));
  await card(612); type('1'); await quoted('900');
  await review(); confirmButton().click();
  await vi.waitFor(() => expect(document.querySelector('.tx-confirm-status').textContent).not.toBe(''));
  expect(reviewAgainButton()).toBeFalsy();
  expect(document.querySelector('.pay-retry-slippage')).toBeNull();
});
