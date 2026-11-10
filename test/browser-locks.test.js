// Without Web Locks, browserLocks() still serializes each lock name and honors ifAvailable; it never refuses.
// Every lock it hands is a handle whose held()/assertHeld() read the lock fresh (SDK 6.2.0 review/locks).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// The few IndexedDB calls the lease makes, over one Map shared by every "tab".
function fakeIndexedDB() {
  const data = new Map();
  const db = { createObjectStore() {}, transaction() {
    const tx = {};
    let pending = 0;
    const finish = () => { if (--pending === 0) queueMicrotask(() => tx.oncomplete && tx.oncomplete()); };
    const request = run => {
      pending++;
      const req = {};
      queueMicrotask(() => { req.result = run(); if (req.onsuccess) req.onsuccess(); finish(); });
      return req;
    };
    tx.objectStore = () => ({
      get: key => request(() => data.get(key) && { ...data.get(key) }),
      put: (value, key) => request(() => { data.set(key, { ...value }); }),
      delete: key => request(() => { data.delete(key); }),
    });
    return tx;
  } };
  return { data, factory: { open() {
    const req = { result: db };
    queueMicrotask(() => { if (req.onupgradeneeded) req.onupgradeneeded(); req.onsuccess(); });
    return req;
  } } };
}

async function leased() {
  vi.stubGlobal('navigator', {});
  const idb = fakeIndexedDB();
  vi.stubGlobal('indexedDB', idb.factory);
  const module = await import('../src/browser-locks.js');
  return { ...module, data: idb.data };
}

it('falls back to an exclusive in-tab lock per name when Web Locks and IndexedDB are missing', async () => {
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('indexedDB', undefined);
  const { browserLocks } = await import('../src/browser-locks.js');
  const locks = browserLocks();
  let release;
  const first = locks.request('a', { ifAvailable: true }, lock => new Promise(resolve => { release = () => resolve(lock); }));
  await Promise.resolve();
  expect(await locks.request('a', { ifAvailable: true }, lock => lock)).toBeNull();
  expect(await locks.request('b', lock => lock.name)).toBe('b');
  const order = [];
  const queued = locks.request('a', {}, () => order.push('queued'));
  order.push('released'); release();
  const handle = await first;
  expect(handle.name).toBe('a');
  // Its work is over: the handle no longer holds the lock.
  expect(await handle.held()).toBe(false);
  await queued;
  expect(order).toEqual(['released', 'queued']);
  browserLocks();
  expect(console.info).toHaveBeenCalledTimes(1);
  expect(console.info.mock.calls[0][0]).toMatch(/within this tab only/);
});

it('hands native Web Locks as a handle that holds only while its work runs', async () => {
  const native = { request: vi.fn((name, options, work) => Promise.resolve(work({ name, mode: 'exclusive' }))) };
  vi.stubGlobal('navigator', { locks: native });
  const { browserLocks } = await import('../src/browser-locks.js');
  let kept;
  const during = await browserLocks().request('n', async lock => { kept = lock; await lock.assertHeld(); return lock.held(); });
  expect(during).toBe(true);
  expect(native.request).toHaveBeenCalledWith('n', {}, expect.any(Function));
  await expect(kept.assertHeld()).rejects.toMatchObject({ name: 'LockLostError', code: 'LOCK_LOST', lock: 'n' });
  // ifAvailable refusals still reach the work as null.
  native.request.mockImplementationOnce((name, options, work) => Promise.resolve(work(null)));
  expect(await browserLocks().request('n', { ifAvailable: true }, lock => lock)).toBeNull();
});

it('assertLocksHeld skips missing locks and refuses once any lock is lost', async () => {
  const { assertLocksHeld, LockLostError } = await import('../src/browser-locks.js');
  const held = { assertHeld: vi.fn(async () => {}) };
  await expect(assertLocksHeld([null, held, undefined])).resolves.toBeUndefined();
  await expect(assertLocksHeld()).resolves.toBeUndefined();
  const lost = { assertHeld: async () => { throw new LockLostError('x'); } };
  await expect(assertLocksHeld([held, lost])).rejects.toBeInstanceOf(LockLostError);
});

it('reads a lease as lost once another tab took it after it lapsed', async () => {
  const { browserLocks, LockLostError, data } = await leased();
  await browserLocks().request('jb-action', async lock => {
    expect(await lock.held()).toBe(true);
    // This tab slept past its lease; another tab claimed it.
    data.set('jb-action', { owner: 'other-tab', expires: Date.now() + 15000 });
    expect(await lock.held()).toBe(false);
    await expect(lock.assertHeld()).rejects.toBeInstanceOf(LockLostError);
    expect(lock.signal.aborted).toBe(true);
  });
  // Ending its work never drops the other tab's lease.
  expect(data.get('jb-action').owner).toBe('other-tab');
});

it('never renews a lease that already lapsed, and its handle then reads lost', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  const { browserLocks, data } = await leased();
  await browserLocks().request('jb-action', async lock => {
    const owner = data.get('jb-action').owner;
    // Frozen past its lease: the record is still this tab's but expired, and no one has taken it yet.
    data.set('jb-action', { owner, expires: Date.now() - 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(data.get('jb-action').expires).toBeLessThan(Date.now());
    expect(lock.signal.aborted).toBe(true);
    expect(await lock.held()).toBe(false);
  });
});

it('renews its own live lease while the work runs', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  const { browserLocks, data } = await leased();
  await browserLocks().request('jb-action', async lock => {
    await vi.advanceTimersByTimeAsync(40000);
    expect(await lock.held()).toBe(true);
    expect(lock.signal.aborted).toBe(false);
  });
  expect(data.has('jb-action')).toBe(false);
});
