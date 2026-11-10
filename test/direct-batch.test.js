import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDirectBatch, hasDirectBatch, clearUnsubmittedDirectBatch } from '../src/direct-batch.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const CALLS = [84532, 11155420].map(cid => ({ cid, to: '0x2222222222222222222222222222222222222222', data: '0x12345678' }));
const receipt = hash => ({ status: 'success', transactionHash: hash });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('sequential direct transaction recovery', () => {
  it('only releases exact all-null journals after a proven rejection, preserving unknown wallet publication', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
    const scope = 'unsigned-routing';
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
      await sending(); throw Object.assign(new Error('rejected'), { code: 4001 });
    } })).rejects.toThrow('rejected');
    expect(await clearUnsubmittedDirectBatch(scope, ACCOUNT, [{ ...CALLS[0], data: '0x5678' }, CALLS[1]])).toBe(false);
    expect(await clearUnsubmittedDirectBatch(scope, ACCOUNT, CALLS)).toBe(true);
    expect(hasDirectBatch(scope, ACCOUNT, CALLS)).toBe(false);
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
      await sending(); throw new Error('transport lost');
    } })).rejects.toThrow('transport lost');
    expect(await clearUnsubmittedDirectBatch(scope, ACCOUNT, CALLS)).toBe(false);
    expect(hasDirectBatch(scope, ACCOUNT, CALLS)).toBe(true);
  });

  it('releases a journal when the wallet rejection arrives wrapped, as viem sends it', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
    const scope = 'wrapped-rejection';
    const rejection = Object.assign(new Error('User rejected the request.'), { code: 4001 });
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
      await sending(); throw Object.assign(new Error('Transaction execution error.'), { name: 'TransactionExecutionError', cause: rejection });
    } })).rejects.toThrow('Transaction execution error.');
    expect(await clearUnsubmittedDirectBatch(scope, ACCOUNT, CALLS)).toBe(true);
    expect(hasDirectBatch(scope, ACCOUNT, CALLS)).toBe(false);
  });

  it('offers the held-no-hash exit for an interrupted wallet request and releases only that slot', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
    const scope = 'interrupted';
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
      await sending(); throw new Error('transport lost');
    } })).rejects.toThrow('transport lost');
    const offerRelease = vi.fn();
    const execute = vi.fn();
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, offerRelease, execute })).rejects.toThrow(/release it/);
    expect(execute).not.toHaveBeenCalled();
    expect(offerRelease).toHaveBeenCalledOnce();
    const [line, release] = offerRelease.mock.calls[0];
    expect(line).toMatch(/Check your wallet; if it was not sent, release it/);
    expect(await release()).toBe(true);
    expect(await clearUnsubmittedDirectBatch(scope, ACCOUNT, CALLS)).toBe(true);
    expect(await release()).toBe(false);
  });

  it('a release offered for an interrupted request never frees a hash saved since', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
    const scope = 'interrupted-then-hashed';
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
      await sending(); throw new Error('transport lost');
    } })).rejects.toThrow('transport lost');
    const offerRelease = vi.fn();
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, offerRelease, execute: vi.fn() })).rejects.toThrow();
    const key = Object.keys(localStorage).find((name) => name.endsWith(':' + scope));
    const saved = JSON.parse(localStorage.getItem(key));
    saved.hashes[0] = '0x' + 'cd'.repeat(32);
    localStorage.setItem(key, JSON.stringify(saved));
    expect(await offerRelease.mock.calls[0][1]()).toBe(false);
    expect(JSON.parse(localStorage.getItem(key)).hashes[0]).toBe('0x' + 'cd'.repeat(32));
  });

  it('a stale release for an earlier interrupted attempt never frees a later one', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } });
    const scope = 'stale-release';
    const interrupt = async (_call, _index, _submitted, sending) => { await sending(); throw new Error('transport lost'); };
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: interrupt })).rejects.toThrow('transport lost');
    const tab1 = vi.fn(), tab2 = vi.fn();
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, offerRelease: tab1, execute: vi.fn() })).rejects.toThrow(/release it/);
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, offerRelease: tab2, execute: vi.fn() })).rejects.toThrow(/release it/);
    expect(await tab1.mock.calls[0][1]()).toBe(true);
    // Attempt B: sent again, and its wallet answer is lost too.
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: interrupt })).rejects.toThrow('transport lost');
    expect(await tab2.mock.calls[0][1]()).toBe(false);
    const execute = vi.fn();
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute })).rejects.toThrow(/release it/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('releases a journal when the final boundary proves the wallet was never invoked', async () => {
    const scope = 'boundary-unsent';
    await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
      await sending(); throw Object.assign(new Error('account changed'), { walletNotInvoked: true });
    } })).rejects.toThrow('account changed');
    expect(await clearUnsubmittedDirectBatch(scope, ACCOUNT, CALLS)).toBe(true);
  });

  it('resumes the exact submitted hash and skips confirmed legs after the later wallet step rejects', async () => {
    const options = { account: ACCOUNT, scope: 'direct-partial', verifySubmitted: vi.fn(async (_call, hash) => receipt(hash)),
      execute: vi.fn(async (_call, index, submitted) => {
        if (index === 1) throw new Error('Wallet rejected');
        await submitted('0xfirst'); return receipt('0xfirst');
      }) };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Wallet rejected');
    options.execute = vi.fn(async (_call, index, submitted) => { await submitted('0xsecond'); return receipt('0xsecond'); });
    await expect(runDirectBatch(CALLS, options)).resolves.toEqual([receipt('0xfirst'), receipt('0xsecond')]);
    expect(options.verifySubmitted).toHaveBeenCalledWith(CALLS[0], '0xfirst');
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(options.execute.mock.calls[0][1]).toBe(1);
  });

  describe('after its lock lapsed (suspended in the wallet)', () => {
    // Each request gets its own lock: `lapse()` loses the current one; a later request takes a fresh one.
    let handles;
    const lapse = () => { handles.at(-1).lost = true; };
    beforeEach(() => {
      handles = [];
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((key, _options, fn) => {
        const handle = { name: key, lost: false };
        handle.held = async () => !handle.lost;
        handle.assertHeld = async () => { if (handle.lost) throw Object.assign(new Error('lost'), { code: 'LOCK_LOST' }); };
        handles.push(handle);
        return fn(handle);
      }) } });
    });
    afterEach(() => { Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn((_key, _options, fn) => fn({})) } }); });
    const saved = scope => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(name => name.endsWith(':' + scope))) || 'null');
    it('never marks a leg sending, and hands the wallet its lock', async () => {
      let walletLocks;
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope: 'lapsed-sending', execute: async (_call, _index, _submitted, sending, held) => {
        walletLocks = held; lapse(); await sending(); return receipt('0x1');
      } })).rejects.toMatchObject({ code: 'LOCK_LOST' });
      expect(walletLocks).toEqual([handles[0]]);
      expect(saved('lapsed-sending')).toBeNull();
    });
    it('never marks a leg sending once the caller\'s plan lock lapsed, and hands the wallet both locks', async () => {
      const planLock = { assertHeld: async () => { throw Object.assign(new Error('lost'), { code: 'LOCK_LOST' }); } };
      let walletLocks;
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope: 'plan-lapsed', locks: [planLock], execute: async (_call, _index, _submitted, sending, held) => {
        walletLocks = held; await sending(); return receipt('0x1');
      } })).rejects.toMatchObject({ code: 'LOCK_LOST' });
      expect(walletLocks).toEqual([handles[0], planLock]);
      expect(saved('plan-lapsed')).toBeNull();
    });
    it('saves a hash returned after the lapse under a fresh lock, and a resume verifies it', async () => {
      const scope = 'lapsed-hash';
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, submitted, sending) => {
        await sending(); lapse(); await submitted('0xabc'); return receipt('0xabc');
      } })).rejects.toMatchObject({ submittedHash: '0xabc', cause: { code: 'LOCK_LOST' } });
      expect(saved(scope).hashes[0]).toBe('0xabc');
      const verifySubmitted = vi.fn(async (_call, hash) => receipt(hash));
      const execute = vi.fn(async (_call, _index, submitted, sending) => { await sending(); await submitted('0xdef'); return receipt('0xdef'); });
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, verifySubmitted, execute })).resolves.toEqual([receipt('0xabc'), receipt('0xdef')]);
      expect(verifySubmitted).toHaveBeenCalledWith(CALLS[0], '0xabc');
      expect(execute).toHaveBeenCalledTimes(1); expect(execute.mock.calls[0][1]).toBe(1);
    });
    it('releases a definitely unsent leg under a fresh lock, so a resume sends it', async () => {
      const scope = 'lapsed-reject';
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, _submitted, sending) => {
        await sending(); lapse(); throw Object.assign(new Error('rejected'), { code: 4001 });
      } })).rejects.toThrow('rejected');
      expect(saved(scope).hashes[0]).toBeNull();
      const execute = vi.fn(async (_call, _index, submitted, sending) => { await sending(); await submitted('0x1'); return receipt('0x1'); });
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute })).resolves.toHaveLength(2);
      expect(execute).toHaveBeenCalledTimes(2);
    });
    it('never settles a newer attempt started after the lapse', async () => {
      const scope = 'lapsed-newer';
      await expect(runDirectBatch(CALLS, { account: ACCOUNT, scope, execute: async (_call, _index, submitted, sending) => {
        await sending(); lapse();
        // Another window took the batch and started its own attempt on this leg.
        const current = saved(scope); current.attempts[0] = 'other'; localStorage.setItem(Object.keys(localStorage).find(name => name.endsWith(':' + scope)), JSON.stringify(current));
        await submitted('0xabc'); return receipt('0xabc');
      } })).rejects.toMatchObject({ submittedHash: '0xabc' });
      expect(saved(scope).hashes[0]).toBe('sending');
    });
  });

  it('retains unknown submitted transactions in memory when storage is denied and blocks changed inputs', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied'); });
    const options = { account: ACCOUNT, scope: 'direct-storage-denied', verifySubmitted: vi.fn(async () => { throw new Error('Still pending'); }),
      execute: vi.fn(async (_call, _index, submitted) => { await submitted('0xunknown'); throw new Error('Receipt unavailable'); }) };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Receipt unavailable');
    expect(hasDirectBatch(options.scope, ACCOUNT)).toBe(true);
    options.execute.mockClear();
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Still pending');
    expect(options.execute).not.toHaveBeenCalled();
    await expect(runDirectBatch([{ ...CALLS[0], data: '0x87654321' }, CALLS[1]], options)).rejects.toThrow(/original inputs/);
    expect(options.execute).not.toHaveBeenCalled();
  });

  it('retains earlier legs when an exact saved transaction is proven reverted', async () => {
    const options = { account: ACCOUNT, scope: 'direct-reverted', verifySubmitted: vi.fn(async (_call, hash) => hash === '0xreverted' ? { status: 'reverted' } : receipt(hash)),
      execute: vi.fn(async (_call, index, submitted) => { await submitted(index ? '0xreverted' : '0xconfirmed'); if (index) throw new Error('Receipt unavailable'); return receipt('0xconfirmed'); }) };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Receipt unavailable');
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow(/reverted/);
    options.execute = vi.fn(async (_call, index, submitted) => { await submitted('0xretry'); return receipt('0xretry'); });
    await expect(runDirectBatch(CALLS, options)).resolves.toEqual([receipt('0xconfirmed'), receipt('0xretry')]);
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(options.execute.mock.calls[0][1]).toBe(1);
  });
});

describe('direct transport recovery routing', () => {
  it('detects account-scoped journals independently of changed call data', async () => {
    const scope = 'routing-existing-direct';
    const options = { account: ACCOUNT, scope, execute: async (_call, _index, submitted) => { await submitted('0xpending'); throw new Error('Pending'); } };
    expect(hasDirectBatch(scope, ACCOUNT)).toBe(false);
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Pending');
    expect(hasDirectBatch(scope, ACCOUNT, [{ ...CALLS[0], data: '0xabcd' }])).toBe(true);
    expect(hasDirectBatch(scope, '0x3333333333333333333333333333333333333333')).toBe(false);
  });

  it('finds legacy identity-keyed journals with chainId or cid descriptors', async () => {
    const options = { account: ACCOUNT, execute: async (_call, _index, submitted) => { await submitted('0xpending'); throw new Error('Pending'); } };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Pending');
    expect(hasDirectBatch(null, ACCOUNT, CALLS.map(({ cid, ...call }) => ({ ...call, chainId: cid })))).toBe(true);
  });

  it.each(['null', 'false', '0', '', '{broken'])('retains malformed journal %j and prevents wallet execution', async raw => {
    const scope = 'malformed-direct'; localStorage.setItem(`jb-direct-batch-v1:${ACCOUNT}:${scope}`, raw);
    const execute = vi.fn(); expect(hasDirectBatch(scope, ACCOUNT)).toBe(true);
    await expect(runDirectBatch(CALLS, { scope, account: ACCOUNT, execute })).rejects.toThrow(/cannot be read/);
    expect(execute).not.toHaveBeenCalled(); expect(localStorage.getItem(`jb-direct-batch-v1:${ACCOUNT}:${scope}`)).toBe(raw);
  });

  it('cannot turn an unreadable journal into a new Relayr or direct request', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Read denied'); });
    const execute = vi.fn(); expect(hasDirectBatch('unreadable-direct', ACCOUNT)).toBe(true);
    await expect(runDirectBatch(CALLS, { scope: 'unreadable-direct', account: ACCOUNT, execute })).rejects.toThrow(/Enable browser storage/);
    expect(execute).not.toHaveBeenCalled();
  });
});


it('retains all verified hashes when its parent completion checkpoint fails', async () => {
  const options = { account: ACCOUNT, scope: 'parent-checkpoint-failed', verifySubmitted: vi.fn(async (_call, hash) => receipt(hash)),
    execute: vi.fn(async (_call, index, submitted) => { const hash = '0xconfirmed' + index; await submitted(hash); return receipt(hash); }),
    onComplete: vi.fn(async () => { throw new Error('checkpoint storage unavailable'); }) };
  await expect(runDirectBatch(CALLS, options)).rejects.toThrow('checkpoint storage unavailable');
  options.execute.mockClear(); options.onComplete.mockResolvedValue();
  await expect(runDirectBatch(CALLS, options)).resolves.toHaveLength(2);
  expect(options.execute).not.toHaveBeenCalled(); expect(options.verifySubmitted).toHaveBeenCalledTimes(2);
});
