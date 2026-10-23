// A lean local copy of the SDK's write hold (nana-sdk-core review/writeRecovery: createBrowserWriteRecovery's
// reserve/submitted/rejected/clear/abandon/withLock, and checkReviewedWrite for a saved hash). One record per
// account, chain, target and function, saved in browser storage before the wallet opens. Only an explicit
// wallet rejection (EIP-1193 4001) drops it before a receipt; any other outcome keeps the action held, across
// reloads, until a read receipt or the user's own wallet check ends it.
var PREFIX = 'juicescan-write-hold-v1:';
// Only a hash whose save failed after the wallet answered lives here, and only over the stored record of the
// same attempt: the stored record stays the authority for which attempt holds the slot.
var memory = new Map();
var STORAGE_LINE = 'Browser storage is unavailable. Enable it before sending; nothing was sent.';

function idOf(raw) { try { return JSON.parse(raw).id; } catch (_) { return undefined; } }
function getItem(key) {
  var raw;
  try { raw = localStorage.getItem(key); } catch (_) { throw new Error(STORAGE_LINE); }
  var kept = memory.get(key);
  if (kept != null && raw != null && idOf(raw) === idOf(kept)) return kept;
  memory.delete(key);
  return raw;
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
  // `wait`: queue behind another window instead of refusing (releases only).
  function withLock(work, wait) {
    if (typeof navigator === 'undefined' || !navigator.locks || !navigator.locks.request) {
      return Promise.reject(new Error('This browser cannot keep wallet sends to one window. Update it to send; nothing was sent.'));
    }
    return navigator.locks.request(key, wait ? {} : { ifAvailable: true }, function (lock) {
      return lock ? work() : Promise.reject(new Error('This wallet action is already open in another window.'));
    });
  }
  // The same attempt in the same state: a release queued behind a send never removes the hash it saved.
  function mine(expected) { var current = read(); return !!current && current.id === expected.id && (current.hash || null) === (expected.hash || null); }
  // Removes only the record `expected` names, so a stale callback or dialog never ends a newer attempt.
  // Callers already inside withLock use releaseLocked; everyone else releases under the lock (release).
  function releaseLocked(expected) {
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
    // Re-read right before the wallet opens: only the attempt whose record is stored sends.
    owns: mine,
    submitted: function (expected, hash) {
      if (!mine(expected)) return expected;
      var next = Object.assign({}, expected, { hash: String(hash).toLowerCase() });
      var raw = JSON.stringify(next);
      if (saved(key, raw)) memory.delete(key); else memory.set(key, raw);
      return next;
    },
    releaseLocked: releaseLocked,
    release: function (expected) { return withLock(async function () { releaseLocked(expected); }, true); },
    // Web Locks make reserve-then-send atomic across tabs; without them (pre-2022 browsers, insecure origins)
    // nothing is sent rather than risk two tabs sending the same action.
    withLock: withLock,
  };
}

// What the node shows of the saved hash: 'mined' (this account's, so its receipt settles the hold), 'pending',
// or 'unknown' (dropped, replaced, or a node without it).
export async function heldHashState(client, record) {
  var tx;
  try { tx = await client.getTransaction({ hash: record.hash }); } catch (_) { return 'unknown'; }
  if (!tx || String(tx.from).toLowerCase() !== record.account) return 'unknown';
  return tx.blockNumber != null ? 'mined' : 'pending';
}
