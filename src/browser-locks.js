// A lean local copy of the SDK's browserLocks() (nana-sdk-core 6.2.0 review/locks, R119). The browser's Web Locks;
// where a browser or wallet webview has none, an IndexedDB lease shared by the origin's tabs; with neither, a
// lock within this tab. It never refuses. Callers keep their lock names, modes and ifAvailable.
//
// Every lock is handed as a handle: { name, mode, signal, held(), assertHeld() }. Call `assertHeld()`
// immediately before every journal write and every wallet submission inside the lock: a lease can lapse while
// the tab is suspended (as while the user is in a wallet app) and pass to another tab. The check narrows that
// window to the time between the check and the write.

// Thrown by a handle's assertHeld() once this tab no longer holds the lock.
export class LockLostError extends Error {
  constructor(lock) {
    super('The "' + lock + '" lock was lost. Its work must stop before writing.');
    this.lock = lock;
    this.name = 'LockLostError';
    this.code = 'LOCK_LOST';
  }
}

// Throws LockLostError unless every given lock is still this tab's, on a fresh read; null and undefined are
// skipped. One line before a write under several locks: `await assertLocksHeld([a, b]); save()`.
export async function assertLocksHeld(locks) {
  await Promise.all((locks || []).map(function (lock) { return lock && lock.assertHeld(); }));
}

// Whether `error` is a lock's LockLostError (by code, so test locks count too).
export function isLockLost(error) { return !!error && error.code === 'LOCK_LOST'; }

// The SDK's fund() keep, in one home: browserLocks().request plus `keep`. `work(lock, keep)` runs under the lock.
// `keep(write, reconcile)` runs `write()`, which fences its own lock right before writing. Use it for every save
// of an outcome the page got from outside (a wallet's hash or rejection, a Safe proposal, a Relayr quote) after
// an earlier save under the same lock. When the lock was lost meanwhile (as while the page was suspended in a
// wallet), `reconcile(fresh)` runs once this lock's work has ended, under a fresh lock of the same name: it
// re-reads the saved record and writes only if the record is still this attempt's. keep still rethrows the
// LockLostError, with `error.reconciled` (resolves once the reconcile ran; never rejects); this request returns
// or throws only after every reconcile it queued has run. Unreconciled, a record stays as the lost lock left it.
export async function requestKeeping(name, options, work) {
  var end, queue = new Promise(function (resolve) { end = resolve; });
  function keep(write, reconcile) {
    return Promise.resolve().then(write).catch(function (error) {
      if (reconcile && isLockLost(error)) {
        error.reconciled = queue = queue.then(function () {
          return browserLocks().request(name, {}, async function (fresh) { await fresh.assertHeld(); return reconcile(fresh); });
        }).catch(function () {});
      }
      throw error;
    });
  }
  try { return await browserLocks().request(name, options, function (lock) { return work(lock, keep); }); }
  finally { end(); await queue; }
}

var NEVER = new AbortController().signal;

function handle(name, mode, held, signal) {
  return {
    name: name,
    mode: mode,
    signal: signal || NEVER,
    held: held,
    assertHeld: async function () { if (!(await held())) throw new LockLostError(name); },
  };
}

function args(options, work) {
  return typeof options === 'function' ? { options: {}, work: options } : { options: options || {}, work: work };
}

// Any Web Locks manager (navigator.locks, a test's) handing a handle: a handle it hands already passes through;
// any other lock is never lost while its work runs.
function fencedLocks(locks) {
  return {
    request: function (name, options, work) {
      var a = args(options, work);
      return locks.request(name, a.options, function (lock) {
        if (!lock) return a.work(null);
        if (typeof lock.assertHeld === 'function') return a.work(lock);
        var running = true;
        return Promise.resolve(a.work(handle(lock.name || name, lock.mode || 'exclusive', async function () { return running; })))
          .finally(function () { running = false; });
      });
    },
  };
}

var TAB_QUEUES = '__juicescanTabLockQueues';
var tabQueues = globalThis[TAB_QUEUES] || (globalThis[TAB_QUEUES] = new Map());
var noted = false;

// Without Web Locks, writes in this tab still run one at a time per lock name.
var tabLocks = {
  request: async function (name, options, work) {
    var a = args(options, work);
    var held = tabQueues.get(name);
    if (held && a.options.ifAvailable) return a.work(null);
    var release;
    var mine = new Promise(function (resolve) { release = resolve; });
    var queue = (held || Promise.resolve()).then(function () { return mine; });
    tabQueues.set(name, queue);
    await held;
    var running = true;
    try {
      return await a.work(handle(name, 'exclusive', async function () { return running; }));
    } finally {
      running = false;
      release();
      if (tabQueues.get(name) === queue) tabQueues.delete(name);
    }
  },
};

// Without Web Locks, tabs share an IndexedDB lease per lock name. A readwrite transaction is atomic across the
// origin's tabs, so claiming a lease is a compare-and-set. Each acquisition has its own owner token. The holder
// renews it while it works, only while it is still its own and unexpired; a tab that closed or froze loses it
// once it lapses, and its handle then reads as lost.
var LEASE_DB = 'nana-sdk-write-locks';
var LEASE_STORE = 'leases';
var LEASE_MS = 15000;
var LEASE_RENEW_MS = 5000;
var LEASE_POLL_MS = 50;

function leaseTransaction(db, mode, run) {
  return new Promise(function (resolve, reject) {
    var transaction = db.transaction(LEASE_STORE, mode);
    var result;
    run(transaction.objectStore(LEASE_STORE), function (value) { result = value; });
    transaction.oncomplete = function () { resolve(result); };
    transaction.onerror = transaction.onabort = function () { reject(transaction.error); };
  });
}

// Whether `lease` is `owner`'s and unexpired.
function owns(lease, owner) { return !!lease && lease.owner === owner && lease.expires > Date.now(); }

// Take `name`'s lease for `owner` (`renew`: only extend it while still `owner`'s); false while another tab holds
// it, or once a renewal finds it lost.
function claimLease(db, name, owner, renew) {
  return leaseTransaction(db, 'readwrite', function (store, done) {
    done(false);
    var read = store.get(name);
    read.onsuccess = function () {
      var lease = read.result, now = Date.now();
      if (renew ? !owns(lease, owner) : lease && lease.expires > now) return;
      store.put({ owner: owner, expires: now + LEASE_MS }, name);
      done(true);
    };
  });
}

function readLease(db, name) {
  return leaseTransaction(db, 'readonly', function (store, done) {
    var read = store.get(name);
    read.onsuccess = function () { done(read.result); };
  });
}

// Drop `name`'s lease only while it is still `owner`'s.
function dropLease(db, name, owner) {
  return leaseTransaction(db, 'readwrite', function (store) {
    var read = store.get(name);
    read.onsuccess = function () { if (read.result && read.result.owner === owner) store.delete(name); };
  });
}

function leaseLocks(factory) {
  var opened;
  function database() {
    if (!opened) {
      opened = new Promise(function (resolve, reject) {
        var request = factory.open(LEASE_DB, 1);
        request.onupgradeneeded = function () { request.result.createObjectStore(LEASE_STORE); };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      }).catch(function (error) { opened = undefined; throw error; });
    }
    return opened;
  }
  return {
    request: function (name, options, work) {
      var a = args(options, work);
      return tabLocks.request(name, a.options, async function (tabLock) {
        if (!tabLock) return a.work(null);
        var db;
        // IndexedDB refused (as in some private windows): this tab only.
        try { db = await database(); } catch (_) { return a.work(tabLock); }
        var owner = globalThis.crypto.randomUUID();
        while (!(await claimLease(db, name, owner))) {
          if (a.options.ifAvailable) return a.work(null);
          await new Promise(function (resolve) { setTimeout(resolve, LEASE_POLL_MS); });
        }
        var lost = new AbortController();
        var running = true;
        async function held() {
          if (!running || lost.signal.aborted) return false;
          // Never cached: a tab back from suspension reads what is there now.
          var mine = owns(await readLease(db, name).catch(function () { return undefined; }), owner);
          if (!mine) lost.abort(new LockLostError(name));
          return mine && running;
        }
        var renew = setInterval(function () {
          claimLease(db, name, owner, true)
            .then(function (kept) { if (!kept) lost.abort(new LockLostError(name)); })
            .catch(function () {});
        }, LEASE_RENEW_MS);
        try {
          return await a.work(handle(name, 'exclusive', held, lost.signal));
        } finally {
          running = false;
          clearInterval(renew);
          await dropLease(db, name, owner).catch(function () {});
        }
      });
    },
  };
}

var inTabLocks = fencedLocks(tabLocks);
var leasedLocks;

export function browserLocks() {
  var native = typeof navigator !== 'undefined' && navigator.locks;
  if (native && typeof native.request === 'function') return fencedLocks(native);
  if (!noted) {
    noted = true;
    console.info(globalThis.indexedDB
      ? 'Web Locks are unavailable, so wallet writes are coordinated across tabs through IndexedDB.'
      : 'Web Locks are unavailable, so wallet writes are coordinated within this tab only.');
  }
  if (!globalThis.indexedDB) return inTabLocks;
  return leasedLocks || (leasedLocks = fencedLocks(leaseLocks(globalThis.indexedDB)));
}
