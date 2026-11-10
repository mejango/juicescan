// Sequential wallet sends retain each submitted hash so a later rejected or unknown leg cannot replay
// earlier successful calls. A resumed batch must still match the exact reviewed destinations/calldata.
import { keccak256, stringToHex } from 'viem';
import { isExplicitWalletRejection } from './write-hold.js';
import { browserLocks } from './browser-locks.js';

var memory = new Map();
var PREFIX = 'jb-direct-batch-v1:';

function directBatchIdentity(calls) {
  return keccak256(stringToHex(JSON.stringify(calls.map(function (call) {
    return [Number(call.cid == null ? call.chainId : call.cid), String(call.to).toLowerCase(), String(call.data).toLowerCase(), String(call.value || '0')];
  }))));
}

// Route recovery before reevaluating Relayr support. A scope deliberately ignores new form values: the
// direct runner will compare them with the original identity and refuse to replay a changed request.
export function directBatchStatus(scope, account, calls) {
  if (!account || (!scope && !Array.isArray(calls))) return null;
  var key = PREFIX + String(account).toLowerCase() + ':' + (scope || directBatchIdentity(calls));
  if (memory.has(key)) return 'pending';
  try { return localStorage.getItem(key) != null ? 'pending' : null; } catch (_) { return 'unavailable'; }
}

export function hasDirectBatch(scope, account, calls) { return !!directBatchStatus(scope, account, calls); }

// A definite wallet rejection (or a proven reverted receipt) leaves null slots. A caller holding
// its parent action lock may refresh that unsigned round, but any hash/unknown marker stays frozen.
export async function clearUnsubmittedDirectBatch(scope, account, calls) {
  if (!scope || !account || !Array.isArray(calls)) return false;
  var key = PREFIX + String(account).toLowerCase() + ':' + scope;
  return browserLocks().request(key, { ifAvailable: true }, async function (lock) {
    if (!lock || memory.has(key)) return false;
    var raw = localStorage.getItem(key);
    if (raw == null) return true;
    var session;
    try { session = JSON.parse(raw); } catch (_) { return false; }
    if (!session || session.identity !== directBatchIdentity(calls) || !Array.isArray(session.hashes)
        || session.hashes.length !== calls.length || session.hashes.some(function (hash) { return hash !== null; })) return false;
    await lock.assertHeld();
    localStorage.removeItem(key);
    return localStorage.getItem(key) == null;
  });
}

function newAttemptId() {
  try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}

// Settles slot `index` to `value` (null: unsent; a hash: sent) only while it is still the same interrupted
// attempt (`attempt`, saved when the slot was marked 'sending') of the same batch. `wait` queues behind another
// window instead of refusing.
function settleAttempt(key, identity, index, attempt, value, wait) {
  return browserLocks().request(key, wait ? {} : { ifAvailable: true }, async function (lock) {
    if (!lock) return false;
    var session = memory.get(key);
    if (!session) {
      try { session = JSON.parse(localStorage.getItem(key)); } catch (_) { return false; }
    }
    if (!session || session.identity !== identity || !Array.isArray(session.hashes) || session.hashes[index] !== 'sending'
        || (session.attempts || [])[index] !== attempt) return false;
    await lock.assertHeld();
    session.hashes[index] = value;
    if (memory.has(key)) return true;
    localStorage.setItem(key, JSON.stringify(session));
    return true;
  });
}

// The held-no-hash exit: the user's wallet check frees exactly the attempt shown.
function releaseUnsent(key, identity, index, attempt) { return settleAttempt(key, identity, index, attempt, null, false); }

// `options.execute(call, index, onSubmitted, onSending, lock)` sends one leg: it awaits `onSending()` before
// the wallet and `onSubmitted(hash)` after it, and gives `[lock]` to the wallet call as its fence.
// A leg's outcome (its hash, or a definite unsent) that its lost lock refused is applied under a fresh lock once
// this run's lock work ends (the SDK's fund() keep), so a resume verifies the hash instead of stranding it.
export async function runDirectBatch(calls, options, lock, onLost) {
  var identity = directBatchIdentity(calls);
  var key = PREFIX + String(options.account).toLowerCase() + ':' + (options.scope || identity);
  if (!lock) {
    var late = null;
    try {
      return await browserLocks().request(key, { ifAvailable: true }, function (held) {
        if (!held) throw new Error('This direct transaction batch is already running in another window. Check that window before submitting again.');
        return runDirectBatch(calls, options, held, function (settle) { late = settle; });
      });
    } catch (error) {
      // Unreconciled, the record stays as the lost lock left it.
      if (late) await late().catch(function () {});
      throw error;
    }
  }
  function lost(error, index, value) {
    if (!error || error.code !== 'LOCK_LOST' || !onLost) return false;
    var attempt = (session.attempts || [])[index];
    onLost(function () { return settleAttempt(key, identity, index, attempt, value, true); });
    return true;
  }
  var session = memory.get(key);
  if (!session) {
    var raw;
    try { raw = localStorage.getItem(key); } catch (_) { throw new Error('Enable browser storage to check the original direct transaction batch before submitting again.'); }
    if (raw != null) {
      try {
        session = JSON.parse(raw);
        if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error();
      } catch (_) { throw new Error('The saved direct transaction receipt cannot be read. Verify the previous transactions before submitting again.'); }
    }
  }
  if (session && (session.identity !== identity || !Array.isArray(session.hashes) || session.hashes.length !== calls.length)) {
    throw new Error('A previous direct transaction batch is unfinished. Restore its original inputs and finish checking it before starting a different request.');
  }
  session = session || { identity: identity, hashes: calls.map(function () { return null; }) };
  // The batch's journal is bound to its lock: never written once the lock is lost.
  async function persist() {
    await lock.assertHeld();
    try {
      localStorage.setItem(key, JSON.stringify(session));
      memory.delete(key);
      return true;
    } catch (_) {
      memory.set(key, session);
      if (options.onStorageUnavailable) options.onStorageUnavailable();
      return false;
    }
  }
  var receipts = [];
  for (var i = 0; i < calls.length; i++) {
    var receipt;
    if (session.hashes[i]) {
      if (session.hashes[i] === 'sending') {
        var line = 'A wallet request was interrupted before its transaction hash was saved. Check your wallet; if it was not sent, release it.';
        if (options.offerRelease) options.offerRelease(line, releaseUnsent.bind(null, key, identity, i, (session.attempts || [])[i]));
        throw new Error(line);
      }
      // Recovery only checks the previously submitted hash; it never opens another wallet prompt.
      receipt = await options.verifySubmitted(calls[i], session.hashes[i]);
      if (receipt && receipt.status === 'reverted') {
        session.hashes[i] = null; await persist();
        throw new Error('The saved transaction reverted. Try again to send only the remaining work; earlier confirmed transactions are preserved.');
      }
      if (!receipt || receipt.status !== 'success') throw new Error('The saved direct transaction is not confirmed. Check the saved receipt before submitting again.');
    } else {
      var index = i;
      try {
        receipt = await options.execute(calls[i], i, function (hash) {
          session.hashes[index] = hash;
          return persist().catch(function (cause) {
            lost(cause, index, hash);
            throw Object.assign(new Error('Transaction ' + hash + ' was submitted. Do not send it again; resume this action to check it.'), { cause: cause, submittedHash: hash });
          });
        }, async function () {
          session.hashes[index] = 'sending';
          session.attempts = session.attempts || [];
          session.attempts[index] = newAttemptId();
          var saved;
          try { saved = await persist(); } catch (error) { session.hashes[index] = null; throw error; }
          if (!saved) {
            session.hashes[index] = null;
            throw new Error('The wallet request could not be saved. Enable browser storage before submitting; nothing was sent.');
          }
        }, lock);
      } catch (error) {
        // A definite wallet rejection (the write hold's rule) did not broadcast. Transport errors remain blocked with the saved marker.
        if (session.hashes[index] === 'sending' && error && (error.walletNotInvoked || isExplicitWalletRejection(error))) {
          session.hashes[index] = null;
          try { await persist(); } catch (cause) { if (!lost(cause, index, null)) throw cause; }
        }
        throw error;
      }
      if (!receipt || receipt.status !== 'success') throw new Error('The direct transaction is not confirmed. Check the saved receipt before submitting again.');
    }
    receipts.push(receipt);
  }
  if (options.onComplete) await options.onComplete(receipts);
  await lock.assertHeld();
  memory.delete(key);
  try { localStorage.removeItem(key); } catch (_) {}
  return receipts;
}
