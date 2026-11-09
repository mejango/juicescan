// A lean local copy of the SDK's browserLocks() (nana-sdk-core review/locks, R119). The browser's Web Locks;
// where a browser or wallet webview has none, an IndexedDB lease shared by the origin's tabs; with neither, a
// lock within this tab. It never refuses. Callers keep their lock names, modes and ifAvailable.

var TAB_QUEUES = '__juicescanTabLockQueues';
var tabQueues = globalThis[TAB_QUEUES] || (globalThis[TAB_QUEUES] = new Map());
var noted = false;

function args(options, work) {
  return typeof options === 'function' ? { options: {}, work: options } : { options: options || {}, work: work };
}

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
    try {
      return await a.work({ name: name, mode: 'exclusive' });
    } finally {
      release();
      if (tabQueues.get(name) === queue) tabQueues.delete(name);
    }
  },
};

// Without Web Locks, tabs share an IndexedDB lease per lock name. A readwrite transaction is atomic across the
// origin's tabs, so claiming a lease is a compare-and-set. The holder renews it while it works; a tab that
// closed or froze loses it once it lapses.
var LEASE_DB = 'nana-sdk-write-locks';
var LEASE_STORE = 'leases';
var LEASE_MS = 15000;
var LEASE_RENEW_MS = 5000;
var LEASE_POLL_MS = 50;

function leaseTransaction(db, run) {
  return new Promise(function (resolve, reject) {
    var transaction = db.transaction(LEASE_STORE, 'readwrite');
    var result;
    run(transaction.objectStore(LEASE_STORE), function (value) { result = value; });
    transaction.oncomplete = function () { resolve(result); };
    transaction.onerror = transaction.onabort = function () { reject(transaction.error); };
  });
}

// Take or renew `name`'s lease for `owner`; false while another tab holds it.
function claimLease(db, name, owner) {
  return leaseTransaction(db, function (store, done) {
    done(false);
    var read = store.get(name);
    read.onsuccess = function () {
      var lease = read.result, now = Date.now();
      if (lease && lease.owner !== owner && lease.expires > now) return;
      store.put({ owner: owner, expires: now + LEASE_MS }, name);
      done(true);
    };
  });
}

function dropLease(db, name, owner) {
  return leaseTransaction(db, function (store) {
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
        var renew = setInterval(function () { claimLease(db, name, owner).catch(function () {}); }, LEASE_RENEW_MS);
        try {
          return await a.work(tabLock);
        } finally {
          clearInterval(renew);
          await dropLease(db, name, owner).catch(function () {});
        }
      });
    },
  };
}

var fallbackLocks;

export function browserLocks() {
  var native = typeof navigator !== 'undefined' && navigator.locks;
  if (native && typeof native.request === 'function') return native;
  if (!noted) {
    noted = true;
    console.info(globalThis.indexedDB
      ? 'Web Locks are unavailable, so wallet writes are coordinated across tabs through IndexedDB.'
      : 'Web Locks are unavailable, so wallet writes are coordinated within this tab only.');
  }
  if (!globalThis.indexedDB) return tabLocks;
  return fallbackLocks || (fallbackLocks = leaseLocks(globalThis.indexedDB));
}
