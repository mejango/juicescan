import { encodeFunctionData } from 'viem';
import { assertShopCallPolicy } from '../src/shop-policy.js';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assertLocksHeld, isLockLost, requestKeeping, LockLostError } from '../src/browser-locks.js';

const source = name => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start))).replace(/^export /, '');
const invoke = section(source('wallet.js'), 'export async function invokeWallet(', '\nexport function onWalletChange');
const base = source('component-base.js');
const execute = section(base, 'export function executeTransaction(opts)', '\nfunction normalizeWalletReceipt');
const sendHeld = section(base, 'export function sendHeldWrite(', '\nfunction offerHeldRelease');
const permit = section(source('discover.js'), 'async function buildPayPermit2Metadata(', '\n// JBMetadataResolver.addToMetadata:');
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const HASH = '0x' + 'ab'.repeat(32);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness() {
  const gas = deferred(), started = deferred(), result = deferred(), writes = [], releases = [];
  const state = { account: ACCOUNT, safe: false, view: null, chain: 1, wallet: null };
  const wallet = label => ({ getChainId: async () => state.chain, writeContract: async req => { writes.push([label, req]); return HASH; }, signTypedData: async req => { writes.push([label, req]); return '0xsig'; } });
  state.wallet = wallet('A');
  const hold = { read: () => null, withLock: fn => fn({ assertHeld: async () => {}, held: async () => true }, write => write()), reserve: () => 1, owns: () => true, submitted: () => 1, release: async () => {}, releaseLocked: r => releases.push(r) };
  const pub = { readContract: async () => 0n, simulateContract: async req => ({ request: req }) };
  const context = vm.createContext({ console, Promise, Object, BigInt, Number, Error, assertLocksHeld, isLockLost,
    encodeFunctionData, assertShopCallPolicy, getViewAs: () => state.view, VIEW_AS_TX_ERROR: 'View as', getWalletClient: () => state.wallet, getAccount: () => state.account,
    isSafeConnected: () => state.safe, holdForWrite: () => hold, waitForSafeInitialization: async () => {},
    createPublicClientForChain: () => pub, clientFor: () => pub,
    contractGasWithHeadroom: () => { started.resolve(); return gas.promise; }, CHAINS: { 1: { id: 1 } },
    waitForTrackedTransactionReceipt: async () => ({ status: 'success', blockNumber: 1n, transactionHash: HASH }),
    truncAddr: x => x, chainNameFor: () => 'Ethereum', shouldKeepSubmittedTransactionPending: () => false,
    isWalletUserRejection: () => false, isExplicitWalletRejection: () => false, friendlyTransactionError: () => null,
    errMessage: (e, fallback) => e.message || fallback, lpIsSmartWallet: async () => false, accountHasCode: async () => false, lpErc20Abi: [],
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
    const h = harness(); const pending = h.context.buildPayPermit2Metadata(1, OTHER, ACCOUNT, OTHER, 10n, null, '0x');
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
  it('refuses the wallet unsent once the caller lost its lock', async () => {
    const h = harness(), lost = { assertHeld: async () => { throw new LockLostError('jb-action'); } };
    const error = await h.context.invokeWallet(1, ACCOUNT, false, current => current.writeContract({}), null, [lost]).catch(e => e);
    expect(error).toBeInstanceOf(LockLostError); expect(error.walletNotInvoked).toBe(true); expect(h.writes).toEqual([]);
  });
  it.each(['account', 'connector', 'state'])('checks the %s again after the lock fence, before the wallet', async change => {
    const h = harness(), fence = deferred(), fencing = deferred();
    let fresh = true;
    const lock = { assertHeld: () => { fencing.resolve(); return fence.promise; } };
    const pending = h.context.invokeWallet(1, ACCOUNT, false, current => current.writeContract({}), () => { if (!fresh) throw new Error('schedule expired'); }, [lock]).catch(e => e);
    await fencing.promise;
    if (change === 'account') h.state.account = OTHER;
    if (change === 'connector') h.state.wallet = h.wallet('B');
    if (change === 'state') fresh = false;
    fence.resolve();
    const error = await pending;
    expect(error.walletNotInvoked).toBe(true); expect(h.writes).toEqual([]);
  });
  it('sends while every lock is still held', async () => {
    const h = harness(), lock = { assertHeld: vi.fn(async () => {}) };
    await h.context.invokeWallet(1, ACCOUNT, false, current => current.writeContract({}), null, [lock, null]);
    expect(lock.assertHeld).toHaveBeenCalledOnce(); expect(h.writes.map(x => x[0])).toEqual(['A']);
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

describe('held write under a lapsed hold lock', () => {
  // The real keep over a lock manager that hands each request its own lock: `lapse()` loses the current one.
  function held() {
    const calls = [], locks = [];
    const lapse = () => { locks.at(-1).lost = true; };
    vi.stubGlobal('navigator', { locks: { request: async (name, _options, fn) => {
      const lock = { name, lost: false };
      lock.held = async () => !lock.lost;
      lock.assertHeld = async () => { if (lock.lost) throw new LockLostError(name); };
      locks.push(lock);
      return fn(lock);
    } } });
    const hold = { withLock: work => requestKeeping('hold', {}, work), reserve: () => { calls.push(['reserve', locks.length]); return 'r'; }, owns: () => true,
      submitted: (r, hash) => { calls.push(['submitted', locks.length, hash]); return r + ':' + hash; }, releaseLocked: () => calls.push(['release', locks.length]) };
    return { calls, locks, lapse, hold, context: harness().context };
  }
  afterEach(() => vi.unstubAllGlobals());
  it('never reserves or opens the wallet once the lock lapsed', async () => {
    const t = held(), send = vi.fn();
    const hold = { ...t.hold, withLock: work => t.hold.withLock((lock, keep) => { lock.lost = true; return work(lock, keep); }) };
    await expect(t.context.sendHeldWrite(hold, () => {}, send)).rejects.toBeInstanceOf(LockLostError);
    expect(t.calls).toEqual([]); expect(send).not.toHaveBeenCalled();
  });
  it('fences the wallet with the hold lock and saves a hash returned after the lapse under a fresh lock', async () => {
    const t = held();
    let fence;
    const sent = await t.context.sendHeldWrite(t.hold, () => {}, lock => { fence = lock; t.lapse(); return HASH; });
    expect(fence).toBe(t.locks[0]); expect(t.locks).toHaveLength(2);
    expect(t.calls).toEqual([['reserve', 1], ['submitted', 2, HASH]]);
    expect(sent).toEqual({ hash: HASH, reservation: 'r:' + HASH });
  });
  it('releases a definitely unsent reservation under a fresh lock', async () => {
    const t = held();
    await expect(t.context.sendHeldWrite(t.hold, () => {}, () => { t.lapse(); throw Object.assign(new Error('unsent'), { walletNotInvoked: true }); })).rejects.toThrow('unsent');
    expect(t.calls).toEqual([['reserve', 1], ['release', 2]]);
  });
});
