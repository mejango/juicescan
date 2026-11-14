// A paid relayed launch that finished on some chains only. The unfinished chains are signed again for the
// SAME launch call at the SAME forwarder nonce, so the old request and the new one can never both run:
// whichever executes first uses the nonce. The rule juicebox.money follows.

var KEY = 'jb-create-relayr-calls-v1:';

// What can be done about one unfinished chain, from the forwarder's state on that chain.
//   'ran'   the signed nonce was used: the launch may have run, nothing may be signed again.
//   'retry' the nonce is unused and the old request is expired, or its transaction reverted.
//   'wait'  the old request can still run and nothing proves it failed.
export function unfinishedLaunchOutcome(input) {
  var signed = BigInt(input.signedNonce), now = BigInt(input.chainNonce);
  if (now > signed) return 'ran';
  if (now < signed) return 'wait';
  // A request of a bundle that was never paid for is not waited on: a replacement shares its nonce.
  if (input.unpaid || BigInt(input.timestamp) > BigInt(input.deadline)) return 'retry';
  return input.reverted ? 'retry' : 'wait';
}

function storage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } }
function keyFor(account) { return KEY + String(account || '').toLowerCase(); }

// The exact launch calls of one relayed launch bundle, kept so unfinished chains can be signed again unchanged.
// The record is bound to its bundle and carries each request's own nonce proof, so it never depends on another
// tab's launch or on a list other actions prune.
// bundleUuid: the bundle these calls were quoted in. replacing: that bundle replaces an earlier paid one.
// calls: [{ chainId, to, data, value, gas, scheduleValidUntil, rulesetCount, requestHash, nonce, deadline }]
// done: [{ chainId, hash, rulesetCount }] chains proven launched by an earlier bundle.
export function saveLaunchCalls(account, record) {
  var store = storage();
  if (!store) return false;
  var raw = JSON.stringify({
    account: String(account).toLowerCase(),
    bundleUuid: String(record.bundleUuid || ''),
    replacing: !!record.replacing,
    calls: (record.calls || []).map(function (call) {
      return { chainId: Number(call.chainId), to: String(call.to), data: String(call.data), value: BigInt(call.value || 0).toString(),
        gas: call.gas == null ? null : BigInt(call.gas).toString(),
        scheduleValidUntil: call.scheduleValidUntil == null ? null : Number(call.scheduleValidUntil),
        rulesetCount: call.rulesetCount == null ? null : Number(call.rulesetCount),
        requestHash: String(call.requestHash || '').toLowerCase(), nonce: BigInt(call.nonce).toString(), deadline: BigInt(call.deadline).toString() };
    }),
    done: (record.done || []).map(function (leg) {
      return { chainId: Number(leg.chainId), hash: String(leg.hash), rulesetCount: leg.rulesetCount == null ? null : Number(leg.rulesetCount) };
    }),
  });
  try { store.setItem(keyFor(account), raw); return store.getItem(keyFor(account)) === raw; } catch (_) { return false; }
}

export function loadLaunchCalls(account) {
  var store = storage();
  if (!store || !account) return null;
  try {
    var record = JSON.parse(store.getItem(keyFor(account)) || 'null');
    if (!record || record.account !== String(account).toLowerCase() || !record.bundleUuid || !Array.isArray(record.calls) || !Array.isArray(record.done)) return null;
    var ok = record.calls.every(function (call) {
      return Number.isSafeInteger(call.chainId) && /^0x[0-9a-fA-F]{40}$/.test(call.to) && /^0x([0-9a-fA-F]{2})*$/.test(call.data) && /^\d+$/.test(call.value)
        && /^0x[0-9a-f]{64}$/.test(call.requestHash) && /^\d+$/.test(call.nonce) && /^\d+$/.test(call.deadline);
    }) && record.done.every(function (leg) { return Number.isSafeInteger(leg.chainId) && /^0x[0-9a-fA-F]{64}$/.test(leg.hash); });
    return ok ? record : null;
  } catch (_) { return null; }
}

export function clearLaunchCalls(account) {
  var store = storage();
  try { if (store && account) store.removeItem(keyFor(account)); } catch (_) {}
}

// Is `hash` the forwarder executing exactly this launch call for this account, successfully?
// transaction and receipt come from the destination chain; request is the decoded execute(request) argument.
export function provesLaunch(input) {
  var tx = input.transaction, receipt = input.receipt, request = input.request, call = input.call;
  var same = function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };
  return !!(tx && receipt && request && receipt.status === 'success'
    && same(tx.to, input.forwarder) && same(request.from, input.account)
    && same(request.to, call.to) && same(request.data, call.data) && BigInt(request.value) === BigInt(call.value));
}
