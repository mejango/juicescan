import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111', viewAs: null, change: null,
  allowance: vi.fn(), approvalProof: vi.fn(), safe: false, resolveSafe: vi.fn(), receipt: vi.fn(), restore: vi.fn(), client: {}, execute: vi.fn(), preparePay: vi.fn(), prepareCashOut: vi.fn(), prepareTransfer: vi.fn(), holdings: vi.fn(), verify: vi.fn(), inventory: vi.fn() }));
vi.mock('@bananapus/nana-sdk-core/v6', async importOriginal => ({ ...await importOriginal(), prepareDefifaPay: h.preparePay, prepareDefifaCashOut: h.prepareCashOut, prepareDefifaTransfer: h.prepareTransfer, getDefifaHoldings: h.holdings, verifyDefifaNftTransaction: h.verify, restoreDefifaNftReceiptContext: h.restore }));
vi.mock('../src/component-base.js', () => ({ getAccount: () => h.account, getViewAs: () => h.viewAs, connect: vi.fn(), createPublicClientForChain: () => h.client, executeTransaction: h.execute, waitForTrackedTransactionReceipt: h.receipt, isSafeConnected: () => h.safe, readErc20Allowance: h.allowance, NATIVE_TOKEN: '0x000000000000000000000000000000000000EEEe', erc20ApproveAbi: [{ type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' }], formatAmount: (amount, decimals) => Number(amount) / 10 ** decimals,
  onEffectiveAccountChange: cb => { h.change = cb; return vi.fn(); }, ZERO_ADDRESS: '0x' + '0'.repeat(40), isAddr: value => /^0x[0-9a-fA-F]{40}$/.test(value) }));
vi.mock('@bananapus/nana-sdk-core/review', async importOriginal => ({ ...await importOriginal(), verifyReviewedWriteReceipt: h.approvalProof }));
vi.mock('../src/nft-inventory.js', () => ({ readProjectNftInventory: h.inventory }));

vi.mock('../src/safe-app.js', () => ({ txHashForSafeTx: h.resolveSafe }));
import { renderDefifaNftActions } from '../src/defifa-nft-actions.js';
import { TransactionReceiptNotFoundError } from 'viem';
import { DefifaNftTransactionRevertedError } from '@bananapus/nana-sdk-core/v6';
const TX = '0x' + 'a'.repeat(64), SAFE_TX = '0x' + 'b'.repeat(64);
const hook = '0x2222222222222222222222222222222222222222';
const native = { protocol: 'defifa', hook, implementation: hook, blockNumber: 50n, phase: 1, pricing: { decimals: 18, token: '0x000000000000000000000000000000000000EEEe' }, tiers: [{ id: 1, name: 'Blue Team', price: 3n }, { id: 7, name: 'Orange Team', price: 5n }] };
const owned = { hook, blockNumber: 50n, tokens: [{ tokenId: 901n, tierId: 7 }], totalOwned: 1n, totalCandidates: 10n, nextCursor: null, complete: true };
const transaction = { chainId: 8453, address: hook, abi: ['pay', 'transferFrom', 'cashOutTokensOf'].map(name => ({ type: 'function', name, inputs: [{ name: 'id', type: 'uint256' }], outputs: [], stateMutability: 'payable' })), functionName: 'pay', args: [1n], value: 3n };
const pay = { inventory: native, transaction, amount: 3n, effectiveAttestationDelegate: hook, selectedTiers: [{ tierId: 1n, count: 1n, unitPrice: 3n }] };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function click(root, label) { const button = [...root.querySelectorAll('button')].find(node => node.textContent === label); expect(button).toBeTruthy(); button.click(); }
async function render() { const root = renderDefifaNftActions(native, 8453, 27n, value => value + ' ETH'); document.body.appendChild(root); await flush(); return root; }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (key, options, callback) => callback({ name: key }) } }); h.safe = false; h.allowance.mockResolvedValue(0n); h.approvalProof.mockResolvedValue('success'); h.client.getTransactionReceipt = vi.fn().mockRejectedValue(new TransactionReceiptNotFoundError({ hash: TX })); h.execute.mockImplementation(call => call.onSending()); h.verify.mockResolvedValue(undefined); h.receipt.mockResolvedValue({ transactionHash: TX, status: 'success', blockNumber: 70n }); h.restore.mockResolvedValue({ hook, implementation: hook, account: '0x1111111111111111111111111111111111111111', transaction }); h.resolveSafe.mockResolvedValue(null); document.body.replaceChildren(); h.account = '0x1111111111111111111111111111111111111111'; h.viewAs = null; h.inventory.mockResolvedValue(native); h.holdings.mockResolvedValue(owned); h.preparePay.mockResolvedValue(pay); h.prepareTransfer.mockResolvedValue({ inventory: native, transaction: { ...transaction, functionName: 'transferFrom' } }); h.prepareCashOut.mockResolvedValue({ inventory: native, transaction: { ...transaction, functionName: 'cashOutTokensOf', value: 0n }, reclaimAmount: 0n, protocolRewards: { defifaToken: hook, defifaAmount: 2n, baseProtocolToken: hook, baseProtocolAmount: 0n, defifaDecimals: 0, baseProtocolDecimals: 18 } }); });
describe('native Defifa NFT action boundary', () => {
  it('reviews one exact Safe ERC20 approval in the pay namespace without a mint call or nested approval', async () => {
    h.safe = true; h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, pricing: { token: hook, decimals: 6 } }, amount: 600n, transaction: { ...transaction, value: 0n } });
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0];
    expect(call).toMatchObject({ address: hook, functionName: 'approve', args: [hook, 600n], value: 0n, expectedSafe: true }); expect(call.tokenAddr).toBeUndefined(); expect(call.approvalAmount).toBeUndefined(); expect(call.confirmNote).toContain('No NFTs are minted'); expect(JSON.parse(localStorage.getItem(localStorage.key(0)))).toMatchObject({ namespace: 'defifa:pay:27', safe: true, call: { to: hook } });
  });
  it('verifies a saved approval after remount and requires a fresh mint review with sufficient allowance', async () => {
    h.safe = true; h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, pricing: { token: hook, decimals: 6 } }, amount: 600n, transaction: { ...transaction, value: 0n } });
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); await h.execute.mock.lastCall[0].onSuccess('Approval proposed', { phase: 'safe-proposed', safeTxHash: SAFE_TX }); root.dispose(); root.remove();
    h.resolveSafe.mockResolvedValue(TX); h.allowance.mockResolvedValue(600n); const remount = await render(); expect(remount.textContent).toContain('Pending token approval'); click(remount, 'Check Safe execution'); await flush(); expect(h.approvalProof).toHaveBeenCalledTimes(1); expect(h.allowance.mock.lastCall).toEqual([h.client, hook, h.account, hook, 70n]); expect(h.restore).not.toHaveBeenCalled(); expect(h.verify).not.toHaveBeenCalled(); expect(h.execute).toHaveBeenCalledTimes(1); expect(remount.textContent).toContain('Review NFT mint again');
    remount.querySelector('input[type=number]').value = '1'; click(remount, 'Review NFT mint'); await flush(); expect(h.execute).toHaveBeenCalledTimes(2); expect(h.execute.mock.lastCall[0]).toMatchObject({ functionName: 'pay', expectedSafe: true, safeSingleCall: true, tokenAddr: hook, spenderAddr: hook, approvalAmount: 600n });
  });
  it('keeps failed approval proof pending until shared canonical proof returns failed', async () => {
    h.safe = true; h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, pricing: { token: hook, decimals: 6 } }, amount: 600n, transaction: { ...transaction, value: 0n } });
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); await h.execute.mock.lastCall[0].onSuccess('Approval proposed', { phase: 'safe-proposed', safeTxHash: SAFE_TX }); h.resolveSafe.mockResolvedValue(TX);
    h.approvalProof.mockRejectedValueOnce(new Error('Receipt not canonical')); click(root, 'Check Safe execution'); await flush(); expect(localStorage.length).toBe(1); expect(root.textContent).not.toContain('Review NFT mint'); h.approvalProof.mockResolvedValueOnce('failed'); click(root, 'Check Safe execution'); await flush(); expect(localStorage.length).toBe(0); expect(root.textContent).toContain('failed onchain'); expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('keeps a canonically successful but non-granting approval pending at its exact receipt block', async () => {
    h.safe = true; h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, pricing: { token: hook, decimals: 6 } }, amount: 600n, transaction: { ...transaction, value: 0n } });
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); await h.execute.mock.lastCall[0].onSuccess('Approval proposed', { phase: 'safe-proposed', safeTxHash: SAFE_TX }); h.resolveSafe.mockResolvedValue(TX); h.allowance.mockResolvedValue(599n);
    click(root, 'Check Safe execution'); await flush(); expect(h.approvalProof).toHaveBeenCalledTimes(1); expect(h.allowance.mock.lastCall).toEqual([h.client, hook, h.account, hook, 70n]); expect(localStorage.length).toBe(1); expect(root.textContent).toContain('did not grant'); expect(root.textContent).not.toContain('Review NFT mint again'); expect(root.textContent).not.toContain('Review NFT mint'); expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('requires the reviewed allowance postcondition in the approval-leg receipt callback too', async () => {
    h.safe = true; h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, pricing: { token: hook, decimals: 6 } }, amount: 600n, transaction: { ...transaction, value: 0n } });
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0], receipt = { status: 'success', transactionHash: TX, blockNumber: 77n };
    h.allowance.mockResolvedValue(599n); await expect(call.verifyReceipt(receipt)).rejects.toThrow('did not grant'); expect(h.allowance.mock.lastCall).toEqual([h.client, hook, h.account, hook, 77n]); h.allowance.mockResolvedValue(600n); await expect(call.verifyReceipt(receipt)).resolves.toBeUndefined(); expect(localStorage.length).toBe(1);
  });
  it('uses a wallet-returned Safe execution receipt directly without querying proposal lookup', async () => {
    h.safe = true; const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); await h.execute.mock.lastCall[0].onSuccess('Safe execution returned', { phase: 'safe-proposed', safeTxHash: TX }); h.client.getTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash: TX });
    click(root, 'Check Safe execution'); await flush(); expect(h.client.getTransactionReceipt).toHaveBeenCalledExactlyOnceWith({ hash: TX }); expect(h.resolveSafe).not.toHaveBeenCalled(); expect(h.receipt).not.toHaveBeenCalled(); expect(root.textContent).toContain('verified onchain');
  });
  it('does not fall back to proposal lookup after an unknown RPC receipt failure', async () => {
    h.safe = true; const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); await h.execute.mock.lastCall[0].onSuccess('Proposed', { phase: 'safe-proposed', safeTxHash: SAFE_TX }); h.client.getTransactionReceipt.mockRejectedValue(new Error('RPC unavailable'));
    click(root, 'Check Safe execution'); await flush(); expect(h.resolveSafe).not.toHaveBeenCalled(); expect(localStorage.length).toBe(1); expect(root.textContent).toContain('remains unverified'); expect(root.textContent).not.toContain('not executed');
  });
  it('binds the durable route and refuses reservation after the wallet route changes', async () => {
    h.execute.mockImplementationOnce(() => {}); const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0]; expect(call.expectedSafe).toBe(false); h.safe = true; expect(() => call.onSending()).toThrow('route changed'); expect(localStorage.length).toBe(0); call.onError('Wallet route changed');
  });
  it('reviews category-ordered mixed tiers using SDK selected costs and sorted bigint IDs', async () => {
    h.inventory.mockResolvedValue({ ...native, tiers: [{ id: 3, name: 'Third', price: 9n }, ...native.tiers, { id: 2, name: 'Second', price: 7n }] });
    h.preparePay.mockResolvedValue({ ...pay, selectedTiers: [{ tierId: 1n, count: 2n, unitPrice: 3n }, { tierId: 3n, count: 1n, unitPrice: 8n }] });
    const root = await render(), fields = root.querySelectorAll('input[type=number]'); expect(fields[0].getAttribute('aria-label')).toContain('Third'); fields[0].value = '1'; fields[1].value = '2'; click(root, 'Review NFT mint'); await flush();
    expect(h.preparePay.mock.lastCall[1].tierIdsToMint).toEqual([1n, 1n, 3n]); expect(h.execute.mock.lastCall[0].confirmSummary.rows).toContainEqual(['Tier 3: Third', '1 NFTs at 8 ETH each']); expect(h.execute.mock.lastCall[0].confirmSummary.rows).toContainEqual(['Tier 1: Blue Team', '2 NFTs at 3 ETH each']);
  });
  it('reviews a non-first tier even when prepared inventory contains only the first tier', async () => {
    h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, tiers: [native.tiers[0]] }, selectedTiers: [{ tierId: 7n, count: 1n, unitPrice: 4n }] });
    const root = await render(); root.querySelectorAll('input[type=number]')[1].value = '1'; click(root, 'Review NFT mint'); await flush(); expect(h.execute.mock.lastCall[0].confirmSummary.rows).toContainEqual(['Tier 7: Orange Team', '1 NFTs at 4 ETH each']);
  });
  it('forwards exact ERC20 approval and refreshed SDK block without inferring currency from zero value', async () => {
    const erc20 = '0x3333333333333333333333333333333333333333'; h.preparePay.mockResolvedValue({ ...pay, inventory: { ...native, pricing: { token: erc20, decimals: 6 } }, transaction: { ...transaction, value: 0n }, amount: 600n });
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0]; expect(call).toMatchObject({ tokenAddr: erc20, spenderAddr: hook, approvalAmount: 600n, value: 0n }); expect(await call.reverify()).toEqual({ simulationBlockNumber: 50n });
  });
  it('allows exactly the shared SDK selection budget and rejects the next unit', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '128'; click(root, 'Review NFT mint'); await flush(); expect(h.preparePay.mock.lastCall[1].tierIdsToMint).toHaveLength(128);
  });
  it('restores a known submitted intent after remount and cannot send the same action again', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); h.execute.mock.lastCall[0].onError('Receipt unavailable', { submittedHash: TX }); root.dispose(); root.remove(); const remount = await render();
    expect(remount.textContent).toContain('Check original transaction'); expect(remount.textContent).not.toContain('Review NFT mint'); click(remount, 'Check original transaction'); await flush(); expect(h.execute).toHaveBeenCalledTimes(1); expect(h.preparePay).toHaveBeenCalledTimes(1); expect(remount.textContent).toContain('verified onchain'); expect(remount.textContent).toContain('Review NFT mint');
  });
  it('retries persisting a wallet-returned hash before clearing its verified original reservation', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Storage temporarily unavailable'); });
    h.execute.mock.lastCall[0].onError('Receipt unavailable', { submittedHash: TX }); await flush(); write.mockRestore(); expect(root.textContent).toContain('Check original transaction'); click(root, 'Check original transaction'); await flush(); expect(root.textContent).toContain('verified onchain'); expect(root.textContent).toContain('Review NFT mint'); expect(localStorage.length).toBe(0); expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('keeps hashless unknown submission blocked after remount without accepting candidate hashes', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); h.execute.mock.lastCall[0].onError('Wallet disconnected'); root.dispose(); root.remove(); const remount = await render(); expect(remount.textContent).toContain('submission outcome unknown'); expect(remount.textContent).not.toContain('Review NFT mint'); expect(remount.textContent).not.toContain('Check original transaction'); expect(remount.querySelector('input[aria-label*=hash]')).toBeNull();
  });
  it('checks unexecuted and executed Safe proposals without preparing or proposing again', async () => {
    h.safe = true; const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); h.execute.mock.lastCall[0].onSuccess('Proposed', { phase: 'safe-proposed', safeTxHash: SAFE_TX }); await flush(); click(root, 'Check Safe execution'); await flush(); expect(root.textContent).toContain('remains unverified'); expect(h.restore).not.toHaveBeenCalled();
    h.resolveSafe.mockResolvedValue(TX); click(root, 'Check Safe execution'); await flush(); expect(h.restore.mock.lastCall[1].record).toMatchObject({ safe: true, hash: SAFE_TX }); expect(h.execute).toHaveBeenCalledTimes(1); expect(h.preparePay).toHaveBeenCalledTimes(1); expect(root.textContent).toContain('verified onchain');
  });
  it('retains ordinary receipt errors but releases authenticated finalized failure for a deliberate new intent', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); h.execute.mock.lastCall[0].onError('Reverted', { submittedHash: TX }); await flush(); h.verify.mockRejectedValueOnce(new Error('Network failure')); click(root, 'Check original transaction'); await flush(); expect(root.textContent).not.toContain('Review NFT mint');
    h.verify.mockRejectedValueOnce(new DefifaNftTransactionRevertedError(TX, 8453)); click(root, 'Check original transaction'); await flush(); expect(root.textContent).toContain('failed onchain'); expect(root.textContent).toContain(TX); expect(root.textContent).toContain('Review NFT mint'); expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('only releases reservations through specific engine pre-write/rejection callbacks', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0]; call.onWriteRejected(); call.onError('Rejected', { userRejected: true }); expect(localStorage.length).toBe(0); expect(root.textContent).toContain('Retry');
  });
  it('shows exact mixed tier names/prices and actual NFT IDs, using bounded snapshot holdings', async () => {
    const root = await render(); expect(root.textContent).toContain('Blue Team, 3 ETH per NFT'); expect(root.textContent).toContain('Orange Team, 5 ETH per NFT'); expect(root.textContent).toContain('NFT 901, tier 7: Orange Team');
    expect(h.holdings).toHaveBeenCalledWith(h.client, { chainId: 8453, projectId: 27n, account: h.account, expectedHook: hook, blockNumber: 50n });
  });
  it('captures mint account/tier inputs, defaults delegate to zero and reviews existing-NFT effects', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '2'; click(root, 'Review NFT mint'); await flush();
    expect(h.preparePay.mock.calls[0][1]).toMatchObject({ account: h.account, expectedHook: hook, tierIdsToMint: [1n, 1n], attestationDelegate: '0x' + '0'.repeat(40) });
    const call = h.execute.mock.calls[0][0]; expect(call.confirmNote).toContain('ALL existing NFTs'); expect(call.confirmSummary.rows).toContainEqual(['Voting power recipient', hook]);
    root.querySelector('input[type=number]').value = '99'; await call.reverify(); expect(h.preparePay.mock.lastCall[1].tierIdsToMint).toEqual([1n, 1n]);
    await call.verifyReceipt({ status: 'success' }); expect(h.verify).toHaveBeenCalledWith(h.client, { hook, implementation: hook, account: h.account, transaction }, { status: 'success' });
  });
  it.each(['-1', '1.5', '129', '999999999999999999999'])('refuses invalid or unbounded mint quantity %s before SDK preparation', async value => {
    const root = await render(); root.querySelector('input[type=number]').value = value; click(root, 'Review NFT mint'); await flush(); expect(h.preparePay).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled();
  });
  it('refuses changed account and refreshed quote before engine can send', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.calls[0][0];
    h.account = hook; await expect(call.reverify()).rejects.toThrow('account changed'); h.account = '0x1111111111111111111111111111111111111111';
    h.preparePay.mockResolvedValue({ ...pay, effectiveAttestationDelegate: h.account }); await expect(call.reverify()).rejects.toThrow('changed');
  });
  it.each(['phase', 'price', 'transaction'])('rejects changed %s during final reverify', async field => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.calls[0][0];
    const changed = field === 'phase' ? { ...pay, inventory: { ...native, phase: 2 } } : field === 'price' ? { ...pay, inventory: { ...native, tiers: [{ ...native.tiers[0], price: 4n }] } } : { ...pay, transaction: { ...transaction, value: 9n } };
    h.preparePay.mockResolvedValue(changed); await expect(call.reverify()).rejects.toThrow('changed');
  });
  it('cashout accepts zero ETH plus protocol rewards and freezes reviewed minimum reclaim', async () => {
    const root = await render(); root.querySelector('input[type=checkbox]').checked = true; click(root, 'Review NFT cash out'); await flush();
    expect(h.prepareCashOut).toHaveBeenCalledTimes(2); expect(h.prepareCashOut.mock.lastCall[1]).toMatchObject({ tokenIds: [901n], minimumReclaim: 0n });
    expect(h.execute.mock.calls[0][0].confirmSummary.rows).toContainEqual(['Defifa rewards', '2 (' + hook + ')']);
  });
  it('transfers the selected actual NFT with reviewed recipient, not a tier-derived token ID', async () => {
    h.holdings.mockResolvedValue({ ...owned, tokens: [{ tokenId: '901', tierId: 7n }] });
    const root = await render(); expect(root.textContent).toContain('tier 7: Orange Team'); root.querySelector('input[type=checkbox]').checked = true; root.querySelector('input[aria-label="Transfer recipient"]').value = hook; click(root, 'Review NFT transfer'); await flush();
    expect(h.prepareTransfer.mock.lastCall[1]).toMatchObject({ tokenId: 901n, recipient: hook });
  });
  it('shows read failure and Retry with no unused transaction fields', async () => {
    h.holdings.mockRejectedValue(new Error('RPC unavailable')); const root = await render(); expect(root.textContent).toContain('RPC unavailable'); expect(root.querySelector('input')).toBeNull(); click(root, 'Retry'); await flush(); expect(h.execute).not.toHaveBeenCalled();
  });
  it('does not mistake an empty candidate page for empty holdings and continues the same snapshot', async () => {
    h.holdings.mockResolvedValueOnce({ ...owned, tokens: [], nextCursor: '100', complete: false }).mockResolvedValue(owned); const root = await render(); expect(root.textContent).toContain('Owned NFTs: 1'); expect(root.textContent).toContain('More NFT candidates'); click(root, 'Load more owned NFTs'); await flush();
    expect(h.holdings.mock.lastCall[1]).toMatchObject({ cursor: '100', blockNumber: 50n }); expect(root.textContent).toContain('NFT 901');
  });
  it('preserves selected NFTs and typed inputs when another holdings page arrives', async () => {
    h.holdings.mockResolvedValueOnce({ ...owned, nextCursor: '100', complete: false }).mockResolvedValue({ ...owned, tokens: [{ tokenId: 902n, tierId: 1n }] });
    const root = await render(); root.querySelector('input[type=checkbox]').checked = true; root.querySelector('input[type=number]').value = '2'; root.querySelector('input[aria-label="Transfer recipient"]').value = hook;
    click(root, 'Load more owned NFTs'); await flush(); expect(root.querySelector('input[type=checkbox]').checked).toBe(true); expect(root.querySelector('input[type=number]').value).toBe('2'); expect(root.querySelector('input[aria-label="Transfer recipient"]').value).toBe(hook);
  });
  it('cannot replace submitted transaction recovery with a late holdings page', async () => {
    let finish; h.holdings.mockResolvedValueOnce({ ...owned, nextCursor: '100', complete: false }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const root = await render(); click(root, 'Load more owned NFTs'); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush();
    h.execute.mock.calls[0][0].onError('Receipt unavailable', { submittedHash: TX }); finish(owned); await flush(); expect(root.textContent).toContain('Check original transaction'); expect(root.textContent).not.toContain('Review NFT mint'); expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('does not show another account stale pagination results or prepare after account change', async () => {
    let finish; h.holdings.mockResolvedValueOnce({ ...owned, nextCursor: '100', complete: false }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ...owned, tokens: [], totalOwned: 0n });
    const root = await render(); click(root, 'Load more owned NFTs'); h.account = hook; h.change(); await flush(); finish(owned); await flush(); expect(root.textContent).toContain('Owned NFTs: 0'); expect(root.textContent).not.toContain('NFT 901'); expect(h.execute).not.toHaveBeenCalled();
  });
  it('checks original account after pending preparation and never hands a changed account to the engine', async () => {
    let finish; h.preparePay.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint');
    h.account = hook; h.change(); finish(pay); await flush(); expect(h.execute).not.toHaveBeenCalled(); expect(root.textContent).toContain('account changed');
  });
  it('refreshes the current account before exposing actions after a prior account submission becomes pending', async () => {
    const root = await render(), originalAccount = h.account; root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0];
    h.account = hook; h.change(); let finish; h.holdings.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); call.onError('Receipt unavailable', { submittedHash: TX }); await flush();
    expect(root.textContent).toContain('Loading NFT actions'); expect(root.textContent).not.toContain('NFT 901'); expect(root.querySelector('input')).toBeNull();
    finish({ ...owned, tokens: [], totalOwned: 0n }); await flush(); expect(root.textContent).toContain('Owned NFTs: 0'); expect(root.textContent).not.toContain('NFT 901'); expect(root.textContent).not.toContain('Check original transaction'); expect(localStorage.getItem(localStorage.key(0))).toContain(originalAccount); expect(localStorage.getItem(localStorage.key(0))).toContain(TX);
  });
  it('fits long native names and diagnostic hashes with explicit wrapping', async () => {
    h.inventory.mockResolvedValue({ ...native, tiers: [{ ...native.tiers[0], name: 'A'.repeat(300) }] }); const root = await render(); expect(root.style.overflowWrap).toBe('anywhere'); expect(root.querySelector('label span').style.overflowWrap).toBe('anywhere'); expect(root.querySelector('[role=status]').style.wordBreak).toBe('break-word'); expect(root.querySelector('input[type=number]').max).toBe('128');
  });
  it('finishes original receipt proof and clears its exact saved record after unmount without new reads', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.lastCall[0]; call.onStatus('Submitted', 'pending', { phase: 'submitted', hash: TX });
    let finish; h.verify.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const proof = call.verifyReceipt({ status: 'success', transactionHash: TX }).then(() => call.onSuccess('Confirmed', { phase: 'confirmed', hash: TX }));
    root.dispose(); root.remove(); finish(); await proof; expect(h.verify).toHaveBeenCalledTimes(1); expect(localStorage.length).toBe(0); expect(h.inventory).toHaveBeenCalledTimes(1); expect(h.holdings).toHaveBeenCalledTimes(1); expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it('finishes original recovery proof after wallet change without replacing current account UI or loading again', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); h.execute.mock.lastCall[0].onError('Receipt unavailable', { submittedHash: TX }); await flush();
    let finish; h.verify.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); click(root, 'Check original transaction'); await flush(); h.account = hook; h.holdings.mockResolvedValue({ ...owned, tokens: [], totalOwned: 0n }); h.change(); await flush(); const readCount = h.inventory.mock.calls.length;
    finish(); await flush(); expect(localStorage.length).toBe(0); expect(h.inventory).toHaveBeenCalledTimes(readCount); expect(root.textContent).toContain('Owned NFTs: 0'); expect(root.textContent).not.toContain('Original NFT transaction');
  });
  it('keeps a Safe proposal pending while refreshing visible holdings without claiming verified execution', async () => {
    const root = await render(); root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.calls[0][0]; await call.onSuccess('Proposed to your Safe', { phase: 'safe-proposed' }); expect(root.textContent).toContain('Proposed to your Safe'); expect(root.textContent).not.toContain('verified onchain'); expect(h.inventory).toHaveBeenCalledTimes(2);
  });
  it('preserves submitted receipt context and retries only verification after a failed proof', async () => {
    const root = await render(), originalAccount = h.account; root.querySelector('input[type=number]').value = '1'; click(root, 'Review NFT mint'); await flush(); const call = h.execute.mock.calls[0][0], receipt = { status: 'success', transactionHash: TX, blockNumber: 70n };
    h.verify.mockRejectedValueOnce(new Error('Receipt not canonical'));
    await expect(call.verifyReceipt(receipt)).rejects.toThrow('not canonical'); call.onError('Receipt not canonical', { submittedHash: TX }); await flush();
    expect(root.textContent).not.toContain('Review NFT mint'); expect(root.textContent).toContain('Check original transaction');
    h.verify.mockResolvedValue(undefined); click(root, 'Check original transaction'); await flush();
    expect(h.execute).toHaveBeenCalledTimes(1); expect(h.preparePay).toHaveBeenCalledTimes(1); expect(h.verify.mock.lastCall).toEqual([h.client, { hook, implementation: hook, account: originalAccount, transaction }, receipt]); expect(root.textContent).toContain('verified onchain');
  });
  it('fails closed on changed native identity and never replaces failed refresh with success', async () => {
    h.inventory.mockResolvedValue({ ...native, hook: h.account }); const root = await render(); expect(root.textContent).toContain('identity changed'); expect(root.querySelector('input')).toBeNull(); expect(h.holdings).not.toHaveBeenCalled();
  });
  it('hides mint and cashout during scoring and prevents View as transactions', async () => {
    h.inventory.mockResolvedValue({ ...native, phase: 3 }); const root = await render(); expect(root.textContent).not.toContain('Review NFT mint'); expect(root.textContent).not.toContain('Review NFT cash out'); h.viewAs = hook; h.change(); await flush(); expect(root.querySelector('input')).toBeNull(); expect(root.textContent).toContain('Leave View as');
  });
});
