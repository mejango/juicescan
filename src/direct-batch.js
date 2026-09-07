// Sequential wallet sends retain each submitted hash so a later rejected or unknown leg cannot replay
// earlier successful calls. A resumed batch must still match the exact reviewed destinations/calldata.
import { keccak256, stringToHex } from 'viem';

var memory = new Map();
var PREFIX = 'jb-direct-batch-v1:';

export async function runDirectBatch(calls, options, locked) {
  var identity = keccak256(stringToHex(JSON.stringify(calls.map(function (call) {
    return [Number(call.cid), String(call.to).toLowerCase(), String(call.data).toLowerCase(), String(call.value || '0')];
  }))));
  var key = PREFIX + String(options.account).toLowerCase() + ':' + (options.scope || identity);
  if (!locked && typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request(key, { ifAvailable: true }, function (lock) {
      if (!lock) throw new Error('This direct transaction batch is already running in another window. Check that window before submitting again.');
      return runDirectBatch(calls, options, true);
    });
  }
  var session = memory.get(key);
  if (!session) {
    var raw;
    try { raw = localStorage.getItem(key); } catch (_) {}
    if (raw) {
      try { session = JSON.parse(raw); } catch (_) { throw new Error('The saved direct transaction receipt cannot be read. Verify the previous transactions before submitting again.'); }
    }
  }
  if (session && (session.identity !== identity || !Array.isArray(session.hashes) || session.hashes.length !== calls.length)) {
    throw new Error('A previous direct transaction batch is unfinished. Restore its original inputs and finish checking it before starting a different request.');
  }
  session = session || { identity: identity, hashes: calls.map(function () { return null; }) };
  function persist() {
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
      if (session.hashes[i] === 'sending') throw new Error('A wallet request was interrupted before its transaction hash was saved. Verify that request in your wallet before submitting any remaining work.');
      // Recovery only checks the previously submitted hash; it never opens another wallet prompt.
      receipt = await options.verifySubmitted(calls[i], session.hashes[i]);
      if (receipt && receipt.status === 'reverted') {
        session.hashes[i] = null; persist();
        throw new Error('The saved transaction reverted. Try again to send only the remaining work; earlier confirmed transactions are preserved.');
      }
      if (!receipt || receipt.status !== 'success') throw new Error('The saved direct transaction is not confirmed. Check the saved receipt before submitting again.');
    } else {
      var index = i;
      try {
        receipt = await options.execute(calls[i], i, function (hash) {
          session.hashes[index] = hash;
          persist();
        }, function () {
          session.hashes[index] = 'sending';
          if (!persist()) {
            session.hashes[index] = null;
            throw new Error('The wallet request could not be saved. Enable browser storage before submitting; nothing was sent.');
          }
        });
      } catch (error) {
        // A definite wallet rejection did not broadcast. Transport errors remain blocked with the saved marker.
        if (session.hashes[index] === 'sending' && error && (error.code === 4001 || error.code === 'ACTION_REJECTED')) {
          session.hashes[index] = null; persist();
        }
        throw error;
      }
      if (!receipt || receipt.status !== 'success') throw new Error('The direct transaction is not confirmed. Check the saved receipt before submitting again.');
    }
    receipts.push(receipt);
  }
  if (options.onComplete) await options.onComplete(receipts);
  memory.delete(key);
  try { localStorage.removeItem(key); } catch (_) {}
  return receipts;
}
