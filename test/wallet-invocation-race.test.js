import { encodeFunctionData } from 'viem';
import { assertShopCallPolicy } from '../src/shop-policy.js';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start))).replace(/^export /, '');
const invoke = section(source('wallet.js'), 'export async function invokeWallet(', '\nexport function onWalletChange');
const base = source('component-base.js');
const execute = section(base, 'export function executeTransaction(opts)', '\nfunction normalizeWalletReceipt');
const sendHeld = section(base, 'export function sendHeldWrite(', '\nfunction offerHeldRelease');
const permit = section(source('discover.js'), 'async function buildRouterPermit2Metadata(', '\n// JBMetadataResolver.addToMetadata:');
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const HASH = '0x' + 'ab'.repeat(32);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness() {
  const gas = deferred(), started = deferred(), result = deferred(), writes = [], releases = [];
  const state = { account: ACCOUNT, safe: false, view: null, chain: 1, wallet: null };
  const wallet = label => ({ getChainId: async () => state.chain, writeContract: async req => { writes.push([label, req]); return HASH; }, signTypedData: async req => { writes.push([label, req]); return '0xsig'; } });
  state.wallet = wallet('A');
  const hold = { read: () => null, withLock: fn => fn(), reserve: () => 1, owns: () => true, submitted: () => 1, release: async () => {}, releaseLocked: r => releases.push(r) };
  const pub = { readContract: async () => 0n, simulateContract: async req => ({ request: req }) };
  const context = vm.createContext({ console, Promise, Object, BigInt, Number, Error,
    encodeFunctionData, assertShopCallPolicy, getViewAs: () => state.view, VIEW_AS_TX_ERROR: 'View as', getWalletClient: () => state.wallet, getAccount: () => state.account,
    isSafeConnected: () => state.safe, holdForWrite: () => hold, waitForSafeInitialization: async () => {},
    createPublicClientForChain: () => pub, clientFor: () => pub,
    contractGasWithHeadroom: () => { started.resolve(); return gas.promise; }, CHAINS: { 1: { id: 1 } },
    waitForTrackedTransactionReceipt: async () => ({ status: 'success', blockNumber: 1n, transactionHash: HASH }),
    truncAddr: x => x, chainNameFor: () => 'Ethereum', shouldKeepSubmittedTransactionPending: () => false,
    isWalletUserRejection: () => false, isExplicitWalletRejection: () => false, friendlyTransactionError: () => null,
    errMessage: (e, fallback) => e.message || fallback, lpIsSmartWallet: async () => false, lpErc20Abi: [],
    PERMIT2_ADDRESS: OTHER, waitForErc20Approval: async () => { throw new Error('approval observed'); },
  });
  vm.runInContext(invoke + '\n' + sendHeld + '\n' + execute + '\n' + permit, context);
  function start() {
    context.executeTransaction({ chainId: 1, address: OTHER, abi: [{ type: 'function', name: 'pay', inputs: [], outputs: [], stateMutability: 'payable' }], functionName: 'pay', args: [], value: 10n, skipConfirm: true,
      onStatus: () => {}, onSuccess: () => result.resolve(null), onError: (m, meta) => result.resolve(meta?.error || new Error(m)) });
  }
  return { context, state, wallet, gas, started, result, writes, releases, start };
}
describe('actual-source wallet invocation after awaited preparation', () => {
  it('uses the current same-account connector after transaction gas estimation', async () => {
    const h = harness(); h.start(); await h.started.promise; h.state.wallet = h.wallet('B'); h.gas.resolve(100000n);
    expect(await h.result.promise).toBeNull(); expect(h.writes.map(x => x[0])).toEqual(['B']); expect(h.writes[0][1].value).toBe(10n);
  });
  it.each(['account', 'chain', 'safe', 'view', 'disconnect'])('refuses a changed %s after gas and releases the unsent hold', async change => {
    const h = harness(); h.start(); await h.started.promise;
    if (change === 'account') h.state.account = OTHER;
    if (change === 'chain') h.state.chain = 10;
    if (change === 'safe') h.state.safe = true;
    if (change === 'view') h.state.view = OTHER;
    if (change === 'disconnect') h.state.wallet = null;
    h.gas.resolve(100000n); expect(await h.result.promise).toBeInstanceOf(Error); expect(h.writes).toEqual([]); expect(h.releases).toEqual([1]);
  });
  it.each(['connector', 'account', 'chain', 'safe'])('checks current %s after Permit2 approval gas estimation', async change => {
    const h = harness(); const pending = h.context.buildRouterPermit2Metadata(1, OTHER, ACCOUNT, OTHER, 10n, null, '0x');
    const failure = pending.catch(e => e); await h.started.promise;
    if (change === 'connector') h.state.wallet = h.wallet('B');
    if (change === 'account') h.state.account = OTHER;
    if (change === 'chain') h.state.chain = 10;
    if (change === 'safe') h.state.safe = true;
    h.gas.resolve(100000n); const error = await failure;
    if (change === 'connector') { expect(error.message).toBe('approval observed'); expect(h.writes.map(x => x[0])).toEqual(['B']); }
    else { expect(error.walletNotInvoked).toBe(true); expect(h.writes).toEqual([]); }
  });
  it('re-resolves a connector replaced during the final chain read', async () => {
    const h = harness(), chain = deferred(), reading = deferred();
    h.state.wallet.getChainId = () => { reading.resolve(); return chain.promise; };
    const pending = h.context.invokeWallet(1, ACCOUNT, false, current => current.writeContract({}));
    await reading.promise; h.state.wallet = h.wallet('B'); chain.resolve(1); await pending;
    expect(h.writes.map(x => x[0])).toEqual(['B']);
  });
  it('retains actual send uncertainty and does not mislabel it as pre-invocation', async () => {
    const h = harness(); h.state.wallet.writeContract = () => { throw new Error('transport lost'); };
    const error = await h.context.invokeWallet(1, ACCOUNT, false, current => current.writeContract({})).catch(e => e);
    expect(error.message).toBe('transport lost'); expect(error.walletNotInvoked).toBeUndefined();
  });
});

describe('final authorization freshness after current wallet chain read', () => {
  it('refuses an expired forwarded schedule after the boundary chain RPC waits', async () => {
    const h = harness(), chain = deferred(), reading = deferred();
    let now = 100000, reads = 0;
    h.state.wallet.getChainId = () => ++reads === 1 ? Promise.resolve(1) : (reading.resolve(), chain.promise);
    Object.assign(h.context, { Date: { now: () => now }, Math, Array, String,
      assertShopCallPolicy, relayrSupportsChain: () => true, getAddress: () => OTHER,
      createPublicClientForChain: () => ({ readContract: async r => r.functionName === 'isTrustedForwarder' ? true : r.functionName === 'eip712Domain' ? ['0x0f', 'Forwarder', '1', 1n, OTHER, '0x', []] : 0n, estimateGas: async () => 100000n }),
      TRUSTED_FORWARDER_ABI: [], FORWARDER_ABI: [], gasWithHeadroom: x => x, encodeFunctionData: () => '0xab',
      RELAYR_SIGNED_FORWARD_REQUESTS: new Map(), relayrRequestFingerprint: () => 'proof',
    });
    const relayr = source('relayr.js'), start = relayr.indexOf('export async function buildForwardedTx(');
    const end = relayr.indexOf('\n  return entry;\n}', start) + '\n  return entry;\n}'.length;
    vm.runInContext(relayr.slice(start, end).replace('export async', 'async'), h.context);
    const pending = h.context.buildForwardedTx(1, ACCOUNT, OTHER, '0x', 100000n, 0n, 120).catch(e => e);
    await reading.promise; now = 130000; chain.resolve(1);
    expect((await pending).message).toMatch(/schedule expired/); expect(h.writes).toEqual([]);
  });
});
