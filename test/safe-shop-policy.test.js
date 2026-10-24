import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, encodeFunctionResult } from 'viem';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assertShopCallPolicy } from '../src/shop-policy.js';
import { walletInvocationFor } from './wallet-invocation-fixture.js';
const runtime = vi.hoisted(() => ({ wallet: null, account: null, client: null, tx: null }));
vi.mock('../src/component-base.js', () => ({
  getWalletClient: () => runtime.wallet, getAccount: () => runtime.account,
  invokeWallet: (...args) => walletInvocationFor(runtime)(...args), isSafeConnected: () => false,
  getViewAs: () => null, VIEW_AS_TX_ERROR: 'Read only', switchChain: vi.fn(),
  createPublicClientForChain: () => runtime.client,
  waitForTrackedTransactionReceipt: (client, hash) => client.waitForTransactionReceipt({ hash }),
  ZERO_ADDRESS: '0x' + '00'.repeat(20),
}));
import { getABI } from '../src/abi-registry.js';
import { encodeMultiSend, MULTI_SEND_CALL_ONLY } from '../src/safe-batch.js';
import { approveSafeHashOnChain, confirmSafeTx, executeSafeTx, proposeSafeTx, safeExecRelayrTx,
  safeTxHashForQueuedTx, listPendingSafeTxs, SAFE_EXEC_ABI, SAFE_EXECUTION_SUCCESS_TOPIC } from '../src/safe.js';
import { relayrPostBundle } from '../src/relayr.js';

const ZERO = '0x' + '00'.repeat(20), SAFE = '0x' + '11'.repeat(20), OWNER = '0x' + '22'.repeat(20), TARGET = '0x' + '33'.repeat(20);
const SIGNATURE = '0x' + '12'.repeat(65), HASH = '0x' + 'ab'.repeat(32);
function tier(kind) {
  return { price: 1000000n, initialSupply: kind === 'reserved one' ? 1 : 10, votingUnits: 42,
    reserveFrequency: kind === 'reserved one' ? 1 : 0, reserveBeneficiary: OWNER,
    encodedIpfsUri: '0x' + '00'.repeat(32), category: 0, discountPercent: 0, splitPercent: 0, splits: [],
    flags: { allowOwnerMint: false, useReserveBeneficiaryAsDefault: false, transfersPausable: false,
      useVotingUnits: kind === 'custom votes', cantBeRemoved: false, cantIncreaseDiscountPercent: false, cantBuyWithCredits: false } };
}
function hasTier(p) { return !!p.components?.some(c => c.name === 'initialSupply' || hasTier(c)); }
function blank(p, item) {
  if (p.type.endsWith('[]')) return p.components?.some(c => c.name === 'initialSupply') ? [item] : [];
  if (p.type.startsWith('tuple')) return Object.fromEntries(p.components.map(c => [c.name, blank(c, item)]));
  if (p.type === 'address') return ZERO;
  if (p.type === 'bool') return false;
  if (p.type === 'string') return '';
  if (p.type.startsWith('bytes')) return '0x' + '00'.repeat(Number(p.type.slice(5)) || 0);
  return 0n;
}
function queued(call) { return { ...call, value: '0', nonce: 5, confirmations: [{ owner: OWNER, signature: SIGNATURE }] }; }
function callFor(wrapper, kind) {
  const item = tier(kind);
  const direct = { to: TARGET, operation: 0, data: encodeFunctionData({ abi: getABI('JB721TiersHook'), functionName: 'adjustTiers', args: [[item], []] }) };
  const multi = { to: MULTI_SEND_CALL_ONLY, operation: 1, data: encodeMultiSend([{ ...direct, value: 0n }]) };
  if (wrapper === 'MultiSend') return multi;
  if (wrapper === 'Safe execution') { const entry = safeExecRelayrTx(1, SAFE, queued(multi)); return { to: entry.target, data: entry.data, operation: 0 }; }
  if (wrapper === 'forwarder') return { to: TARGET, operation: 0, data: encodeFunctionData({ abi: getABI('ERC2771Forwarder'), functionName: 'execute', args: [{ from: OWNER, to: direct.to, value: 0n, gas: 100000n, deadline: 2000000000n, data: direct.data, signature: SIGNATURE }] }) };
  if (wrapper === 'launch project' || wrapper === 'revnet deployment') {
    const abi = getABI(wrapper === 'launch project' ? 'JB721TiersHookProjectDeployer' : 'REVDeployer');
    const fn = abi.find(f => f.type === 'function' && f.inputs.some(hasTier));
    expect(fn).toBeTruthy();
    return { to: TARGET, operation: 0, data: encodeFunctionData({ abi: [fn], functionName: fn.name, args: fn.inputs.map(p => blank(p, item)) }) };
  }
  return direct;
}
const wrappers = ['direct', 'MultiSend', 'forwarder', 'Safe execution', 'launch project', 'revnet deployment'];
beforeEach(() => {
  localStorage.clear(); runtime.account = OWNER;
  runtime.wallet = { getChainId: vi.fn(async () => 1), signTypedData: vi.fn(async () => SIGNATURE), writeContract: vi.fn(async () => HASH) };
  runtime.client = { request: vi.fn(async () => encodeFunctionResult({ abi: SAFE_EXEC_ABI, functionName: 'execTransaction', result: true })),
    getBlock: vi.fn(async () => ({ baseFeePerGas: 1n })), estimateContractGas: vi.fn(async () => 100000n),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success', transactionHash: HASH, logs: [{ address: SAFE,
      topics: [SAFE_EXECUTION_SUCCESS_TOPIC, safeTxHashForQueuedTx(1, SAFE, runtime.tx)], data: '0x' + '00'.repeat(32) }] })) };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 201 })));
});
describe('generic Safe queue shop authorization policy', () => {
  it.each(wrappers.flatMap(wrapper => ['custom votes', 'reserved one'].map(kind => [wrapper, kind])))('refuses %s %s before any new confirmation, proposal, execution or hash approval', async (wrapper, kind) => {
    const call = callFor(wrapper, kind), tx = queued(call);
    tx.safeTxHash = safeTxHashForQueuedTx(1, SAFE, tx);
    const expected = kind === 'custom votes' ? /price-based governance/ : /supply of at least 2/;
    await expect(confirmSafeTx(1, SAFE, tx, OWNER)).rejects.toThrow(expected);
    await expect(proposeSafeTx({ chainId: 1, safe: SAFE, ...call, nonce: 5, signer: OWNER })).rejects.toThrow(expected);
    await expect(executeSafeTx(1, SAFE, tx)).rejects.toThrow(expected);
    await expect(approveSafeHashOnChain(1, SAFE, tx.safeTxHash, null, null, tx)).rejects.toThrow(expected);
    expect(runtime.wallet.signTypedData).not.toHaveBeenCalled(); expect(runtime.wallet.writeContract).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(tx.data).toBe(call.data);
  });
  it.each(wrappers)('permits price-based %s even if an ignored legacy voting value remains', async wrapper => {
    const call = callFor(wrapper, 'price based'), tx = queued(call);
    tx.safeTxHash = safeTxHashForQueuedTx(1, SAFE, tx); runtime.tx = tx;
    await expect(confirmSafeTx(1, SAFE, tx, OWNER)).resolves.toBe(SIGNATURE);
    await expect(executeSafeTx(1, SAFE, tx)).resolves.toBe(HASH);
    expect(runtime.wallet.signTypedData).toHaveBeenCalledOnce(); expect(runtime.wallet.writeContract).toHaveBeenCalledOnce();
  });
  it('inspects an official MultiSend CALL too and rejects malformed or excessive nesting', async () => {
    const multi = queued({ ...callFor('MultiSend', 'custom votes'), operation: 0 });
    await expect(confirmSafeTx(1, SAFE, multi, OWNER)).rejects.toThrow(/price-based governance/);
    await expect(confirmSafeTx(1, SAFE, queued({ to: MULTI_SEND_CALL_ONLY, data: '0x1234', operation: 1 }), OWNER)).rejects.toThrow(/could not be decoded/);
    let call = callFor('direct', 'price based');
    for (let i = 0; i < 10; i++) { const outer = safeExecRelayrTx(1, SAFE, queued(call)); call = { to: outer.target, data: outer.data, operation: 0 }; }
    await expect(confirmSafeTx(1, SAFE, queued(call), OWNER)).rejects.toThrow(/too many nested/);
    expect(runtime.wallet.signTypedData).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('permits ordinary Safe operations and refuses a hash without its matching reviewed transaction', async () => {
    const tx = queued({ to: TARGET, data: '0x1234', operation: 0 }); tx.safeTxHash = safeTxHashForQueuedTx(1, SAFE, tx);
    await expect(confirmSafeTx(1, SAFE, tx, OWNER)).resolves.toBe(SIGNATURE);
    await expect(approveSafeHashOnChain(1, SAFE, HASH, null, null, tx)).rejects.toThrow(/original Safe transaction/);
    await expect(approveSafeHashOnChain(1, SAFE, tx.safeTxHash)).rejects.toThrow(/original Safe transaction/);
    expect(runtime.wallet.writeContract).not.toHaveBeenCalled();
  });
  it('rejects a new Relayr publication of the same custom Safe execution before HTTP', async () => {
    const call = callFor('Safe execution', 'custom votes');
    await expect(relayrPostBundle([{ chain: 1, target: call.to, data: call.data, value: '0' }])).rejects.toThrow(/price-based governance/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses new funding for a historical quoted custom shop call without altering the quote', () => {
    const call = callFor('Safe execution', 'custom votes');
    const old = { transactions: [{ target: call.to, data: call.data, chain: 1 }] };
    const source = readFileSync('src/relayr.js', 'utf8');
    const start = source.indexOf('function assertRelayrShopPolicy('), end = source.indexOf('export async function verifyRelayrQuotedRequests', start);
    const ctx = vm.createContext({ RELAYR_QUOTED_REQUESTS: new Map([['saved', old]]), assertShopCallPolicy });
    vm.runInContext(source.slice(start, end), ctx);
    expect(() => ctx.assertRelayrShopPolicy('saved')).toThrow(/price-based governance/);
    expect(old.transactions[0].data).toBe(call.data);
  });
  it('still reads queued historical custom-vote rows without signing or changing their bytes', async () => {
    const tx = queued(callFor('direct', 'custom votes'));
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ nonce: 5 }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ results: [tx] }) });
    await expect(listPendingSafeTxs(1, SAFE)).resolves.toEqual([tx]);
    expect(runtime.wallet.signTypedData).not.toHaveBeenCalled(); expect(runtime.wallet.writeContract).not.toHaveBeenCalled();
  });
});
