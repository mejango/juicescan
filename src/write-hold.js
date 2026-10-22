// A lean local copy of the SDK's write hold (nana-sdk-core review/writeRecovery: createBrowserWriteRecovery's
// reserve/submitted/rejected/clear/abandon/withLock, and checkReviewedWrite for a saved hash). One record per
// account, chain, target and function, saved in browser storage before the wallet opens. Only an explicit
// wallet rejection (EIP-1193 4001) drops it before a receipt; any other outcome keeps the action held, across
// reloads, until a read receipt or the user's own wallet check ends it.
var PREFIX = 'juicescan-write-hold-v1:';
// Only a hash whose save failed after the wallet answered lives here: the hold still covers this tab.
var memory = new Map();
var busy = new Set();
var STORAGE_LINE = 'Browser storage is unavailable. Enable it before sending; nothing was sent.';

function getItem(key) {
  if (memory.has(key)) return memory.get(key);
  try { return localStorage.getItem(key); } catch (_) { throw new Error(STORAGE_LINE); }
}
function saved(key, raw) {
  try { localStorage.setItem(key, raw); return localStorage.getItem(key) === raw; } catch (_) { return false; }
}
function newId() {
  try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}

export function isExplicitWalletRejection(error) {
  for (var cause = error, depth = 0; cause && depth < 8; cause = cause.cause, depth++) if (cause.code === 4001) return true;
  return false;
}

export function writeHold(chainId, account, call) {
  var key = PREFIX + String(account).toLowerCase() + ':' + chainId + ':' + String(call.to).toLowerCase() + ':' + call.functionName;
  // An unparseable record still holds; only the user's check can end it. Unreadable storage throws.
  function read() {
    var raw = getItem(key);
    if (raw == null) return null;
    try { var record = JSON.parse(raw); return record && typeof record === 'object' ? record : {}; } catch (_) { return {}; }
  }
  function mine(expected) { var current = read(); return !!current && current.id === expected.id; }
  // Removes only the record `expected` names, so a stale callback or dialog never ends a newer attempt.
  function release(expected) {
    if (!mine(expected)) return;
    memory.delete(key);
    try { localStorage.removeItem(key); } catch (_) {}
  }
  return {
    chainId: chainId,
    account: account,
    read: read,
    // Refuses unless the record is verifiably in browser storage: a hold that cannot survive a reload is no hold.
    reserve: function () {
      if (read()) throw new Error('An earlier transaction for this action is not settled. Check it before sending again.');
      var record = { id: newId(), account: String(account).toLowerCase(), hash: null };
      if (!saved(key, JSON.stringify(record))) throw new Error(STORAGE_LINE);
      return record;
    },
    // Without Web Locks another tab may have overwritten the slot between read and write: re-read right before
    // the wallet opens, so only the tab whose record is there sends.
    owns: mine,
    submitted: function (expected, hash) {
      if (!mine(expected)) return expected;
      var next = Object.assign({}, expected, { hash: String(hash).toLowerCase() });
      var raw = JSON.stringify(next);
      if (saved(key, raw)) memory.delete(key); else memory.set(key, raw);
      return next;
    },
    release: release,
    withLock: function (work) {
      var refused = function () { return Promise.reject(new Error('This wallet action is already open in another window.')); };
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return navigator.locks.request(key, { ifAvailable: true }, function (lock) { return lock ? work() : refused(); });
      }
      // ponytail: in-tab lock only where Web Locks are missing (pre-2022 browsers); `owns` narrows the cross-tab race.
      if (busy.has(key)) return refused();
      busy.add(key);
      return Promise.resolve().then(work).finally(function () { busy.delete(key); });
    },
  };
}

// Whether the saved hash is this account's mined transaction (its receipt then settles the hold).
export async function heldHashMined(client, record) {
  if (!record.hash) return false;
  var tx = await client.getTransaction({ hash: record.hash }).catch(function () { return null; });
  return !!tx && String(tx.from).toLowerCase() === record.account && tx.blockNumber != null;
}
