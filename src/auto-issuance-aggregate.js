// Auto issuance consumes one storage slot per (project, stage, beneficiary). Distinct slots on the
// same chain need separate calls; repeated indexed deposit events for one slot need only one call.
export var MAX_AUTO_ISSUANCE_CALLS = 24;
var MAX_AUTO_ISSUANCE_ROWS = 256;
var ADDRESS = /^0x[0-9a-f]{40}$/i;

function positiveInteger(value, label) {
  var parsed;
  try { parsed = BigInt(value); } catch (_) { throw new Error('Invalid auto-issuance ' + label + '.'); }
  if (parsed <= 0n) throw new Error('Invalid auto-issuance ' + label + '.');
  return parsed;
}

export function autoIssuanceIdentity(allocation) {
  return [Number(allocation.chainId), String(allocation.projectId), String(allocation.stageId),
    String(allocation.beneficiary).toLowerCase()].join(':');
}

export function autoIssuanceRounds(calls) {
  var rounds = [], countByChain = {};
  calls.forEach(function (call) {
    var chainId = Number(call.chainId);
    var index = countByChain[chainId] || 0;
    if (!rounds[index]) rounds[index] = [];
    rounds[index].push(call);
    countByChain[chainId] = index + 1;
  });
  return rounds;
}

// readChain resolves a single live block, project owner and REVOwner controller. readAllocation reads
// the exact stage and amount on that block. Never derive a destination's stage ID from another chain.
export async function prepareAutoIssuanceCalls(options) {
  var chainIds = (options.chainIds || []).map(Number);
  if (!chainIds.length || chainIds.some(function (id) { return !Number.isSafeInteger(id) || id <= 0; })) {
    throw new Error('Select at least one valid auto-issuance chain.');
  }
  chainIds = Array.from(new Set(chainIds));
  var rows = (options.rows || []).filter(function (row) { return chainIds.indexOf(Number(row.chainId)) !== -1; });
  if (rows.length > MAX_AUTO_ISSUANCE_ROWS) throw new Error('Too many auto-issuance rows to verify together. Select fewer chains or distribute individual allocations.');
  var allocations = [], seen = new Set();
  rows.forEach(function (row) {
    var chainId = Number(row.chainId);
    var projectId = positiveInteger(options.resolveProjectId(chainId), 'project ID');
    if (row.projectId != null && positiveInteger(row.projectId, 'project ID') !== projectId) {
      throw new Error('The auto-issuance project ID changed. Refresh the allocations before distributing.');
    }
    var stageId = positiveInteger(row.stageId != null ? row.stageId : row.stage && row.stage.id, 'stage ID');
    if (!ADDRESS.test(row.beneficiary) || /^0x0{40}$/i.test(row.beneficiary)) throw new Error('Invalid auto-issuance beneficiary.');
    var allocation = { chainId: chainId, projectId: projectId, stageId: stageId,
      beneficiary: row.beneficiary, stageIndex: row.stageIndex };
    var identity = autoIssuanceIdentity(allocation);
    if (!seen.has(identity)) { allocations.push(allocation); seen.add(identity); }
  });
  var stateByChain = {};
  await Promise.all(chainIds.map(async function (chainId) {
    var projectId = positiveInteger(options.resolveProjectId(chainId), 'project ID');
    var state = await options.readChain(chainId, projectId);
    if (!state || !ADDRESS.test(state.revOwnerAddr) || /^0x0{40}$/i.test(state.revOwnerAddr) || !ADDRESS.test(state.owner)
        || state.owner.toLowerCase() !== state.revOwnerAddr.toLowerCase()
        || !ADDRESS.test(state.controller) || /^0x0{40}$/i.test(state.controller)) {
      throw new Error('Could not verify the live revnet deployment on chain ' + chainId + '.');
    }
    state.timestamp = positiveInteger(state.timestamp, 'block timestamp');
    stateByChain[chainId] = state;
  }));
  var liveAllocations = await Promise.all(allocations.map(async function (allocation) {
    var state = stateByChain[allocation.chainId];
    var live = await options.readAllocation(allocation, state);
    if (!live || !live.stage || positiveInteger(live.stage.id, 'live stage ID') !== allocation.stageId) {
      throw new Error('Could not verify the auto-issuance stage on chain ' + allocation.chainId + '.');
    }
    var start = positiveInteger(live.stage.start, 'stage start');
    var remaining;
    try {
      if (live.remaining == null) throw new Error();
      remaining = BigInt(live.remaining);
      if (remaining < 0n) throw new Error();
    } catch (_) { throw new Error('Could not verify the remaining auto issuance on chain ' + allocation.chainId + '.'); }
    if (remaining === 0n || start > state.timestamp) return null;
    return Object.assign({}, allocation, { revOwnerAddr: state.revOwnerAddr, controller: state.controller,
      remaining: remaining, stageStart: start });
  }));
  liveAllocations = liveAllocations.filter(Boolean);
  if (!liveAllocations.length) throw new Error('No unlocked auto issuance remains on the selected chains.');
  if (liveAllocations.length > MAX_AUTO_ISSUANCE_CALLS) {
    throw new Error('Distribute at most ' + MAX_AUTO_ISSUANCE_CALLS + ' allocations together. Select fewer chains or distribute individual allocations.');
  }
  liveAllocations.sort(function (a, b) {
    return a.chainId - b.chainId || (a.stageId < b.stageId ? -1 : a.stageId > b.stageId ? 1 : 0)
      || a.beneficiary.toLowerCase().localeCompare(b.beneficiary.toLowerCase());
  });
  var calls = liveAllocations.map(function (allocation) {
    return Object.assign({}, options.buildCall(allocation), { chainId: allocation.chainId,
      projectId: allocation.projectId.toString(), autoIssue: {
        stageId: allocation.stageId.toString(), beneficiary: allocation.beneficiary,
        remaining: allocation.remaining.toString(), stageStart: allocation.stageStart.toString(),
        stageIndex: allocation.stageIndex, controller: allocation.controller,
      } });
  });
  return { calls: calls, rounds: autoIssuanceRounds(calls), allocations: liveAllocations };
}

// Rechecking a previously reviewed round must never replace its calls with a newly reduced live list.
// Submitted rounds are recovered by their dispatcher before this guard is used for any unsent calls.
export function verifyAutoIssuanceCall(call, allocation) {
  var expected = call.autoIssue;
  if (!expected || autoIssuanceIdentity(Object.assign({}, expected, { chainId: call.chainId, projectId: call.projectId }))
      !== autoIssuanceIdentity(allocation)
      || String(call.to).toLowerCase() !== String(allocation.revOwnerAddr).toLowerCase()
      || String(expected.controller).toLowerCase() !== String(allocation.controller).toLowerCase()
      || BigInt(expected.remaining) !== allocation.remaining
      || BigInt(expected.stageStart) !== allocation.stageStart) {
    throw new Error('The reviewed auto issuance changed. Check the saved distribution before starting new work.');
  }
}
