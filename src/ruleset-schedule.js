import { decodeEventLog } from 'viem';

// JBRulesets.deriveStartFrom: the start a ruleset queued on `base` gets — the base's first cycle boundary at
// or after mustStartAtOrAfter (0 → the contract substitutes block.timestamp → the very next boundary).
export function deriveStartFrom(baseStart, baseDuration, mustStartAtOrAfter) {
  if (!baseDuration) return mustStartAtOrAfter;
  var nextImmediate = baseStart + baseDuration;
  if (nextImmediate >= mustStartAtOrAfter) return nextImmediate;
  var start = mustStartAtOrAfter - ((mustStartAtOrAfter - nextImmediate) % baseDuration);
  while (mustStartAtOrAfter > start) start += baseDuration;
  return start;
}

/** Explicit starts preserve the same predecessor throughout the reviewed inclusion window. */
export function orderedRulesetSchedule(stages, firstStart, now, parent) {
  var count = stages.length;
  if (!count) return { musts: [], starts: [], validUntil: null };
  var first = Number(firstStart) || (parent ? now : now + 600);
  var queueId = Math.max(now, Number(parent && parent.latestId || 0) + 1);
  if (parent && parent.validUntil != null && queueId > Number(parent.validUntil)) throw new Error('The replacement window expired. Reopen the queue and review its current position.');
  var validUntil = parent && parent.validUntil != null ? Number(parent.validUntil) : null;
  var musts = [], starts = [];
  function derived(base, requested, index) {
    if (base.noticeSeconds == null) throw new Error('Multiple rulesets need a known approval condition. Choose a preset notice or queue this custom condition separately.');
    var minimum = Math.max(requested, base.start + base.duration);
    if (base.noticeSeconds > 0) minimum = Math.max(minimum, queueId + index + base.noticeSeconds);
    var start = deriveStartFrom(base.start, base.duration, minimum);
    if (base.noticeSeconds > 0) {
      var limit = start - base.noticeSeconds - index;
      validUntil = validUntil == null ? limit : Math.min(validUntil, limit);
    }
    return start;
  }
  if (parent) {
    // An automatic append can choose a usable inclusion window; explicit dates
    // and replacement positions retain the exact boundary the user selected.
    if (parent.automaticStart && parent.noticeSeconds > 0) {
      var candidate = deriveStartFrom(parent.start, parent.duration, Math.max(first, parent.start + parent.duration, queueId + parent.noticeSeconds));
      if (!scheduleIsFresh(candidate - parent.noticeSeconds, now)) first = Math.max(first, now + 600 + parent.noticeSeconds);
    }
    first = derived(parent, first, 0);
  }
  musts.push(first); starts.push(first);
  for (var i = 1; i < count; i++) {
    var previous = stages[i - 1];
    var requested = stages[i].date || (starts[i - 1] + (stages[i].cycles || 1) * previous.duration);
    var start = derived({ start: starts[i - 1], duration: previous.duration, noticeSeconds: previous.noticeSeconds }, requested, i);
    musts.push(start); starts.push(start);
  }
  return { musts: musts, starts: starts, validUntil: validUntil };
}

export function scheduleIsFresh(validUntil, now) {
  return validUntil == null || Number(validUntil) > (now == null ? Math.floor(Date.now() / 1000) : now) + 15;
}

export function assertScheduleFresh(validUntil, now) {
  if (!scheduleIsFresh(validUntil, now)) {
    throw new Error('This ruleset schedule expired. Rebuild and review it before sending; no new transaction was submitted.');
  }
}


var INITIALIZED_EVENT = [{ type: 'event', name: 'RulesetInitialized', inputs: [
  { name: 'rulesetId', type: 'uint256', indexed: true },
  { name: 'projectId', type: 'uint256', indexed: true },
  { name: 'basedOnId', type: 'uint256', indexed: true },
  { name: 'caller', type: 'address', indexed: false },
] }];

/** Confirm the actual emitted ancestry, not just a successful outer transaction. */
export function assertOrderedRulesetReceipt(receipt, rulesetsAddress, projectId, expectedCount, expectedParentId) {
  var groups = new Map();
  (receipt.logs || []).forEach(function (log) {
    if (!rulesetsAddress || String(log.address).toLowerCase() !== rulesetsAddress.toLowerCase()) return;
    var decoded;
    try { decoded = decodeEventLog({ abi: INITIALIZED_EVENT, data: log.data, topics: log.topics }); } catch (_) { return; }
    if (projectId != null && BigInt(decoded.args.projectId) !== BigInt(projectId)) return;
    var key = decoded.args.projectId.toString();
    var list = groups.get(key) || [];
    list.push(decoded.args); groups.set(key, list);
  });
  if (expectedCount > 1 && (!groups.size || [...groups.values()].some(function (list) { return list.length !== expectedCount; }))) {
    var missing = new Error('The transaction is confirmed, but its complete ruleset sequence could not be verified. Keep its receipt and inspect the project before continuing.');
    missing.code = 'RULESET_ORDER_UNVERIFIED'; throw missing;
  }
  groups.forEach(function (list) {
    if (expectedParentId != null && list[0].basedOnId !== BigInt(expectedParentId)) {
      var changed = new Error('The transaction is confirmed, but its first ruleset used a different parent than reviewed. Keep its receipt and inspect the project before continuing.');
      changed.code = 'RULESET_ORDER_UNVERIFIED'; throw changed;
    }
    for (var i = 1; i < list.length; i++) {
      if (list[i].basedOnId !== list[i - 1].rulesetId) {
        var error = new Error('The transaction is confirmed, but an intermediate ruleset was skipped. Keep its receipt and inspect the project before continuing.');
        error.code = 'RULESET_ORDER_UNVERIFIED'; throw error;
      }
    }
  });
}
