// Freeze independent destination calls before any wallet request. A receipt checkpoint is written before
// the lower-level Relayr/direct journal can clear, so interrupted rounds never start over from new balances.
var PREFIX = 'jb-selected-action-v1:';
var active = new Set();
// A persisted completion flag is not receipt evidence after a reload. Acknowledgement is available only
// after this window has reconciled the plan; every resumed run invalidates its previous acknowledgement.
var verifiedPlans = new Map();

function validateRounds(rounds, maxCalls) {
  maxCalls = maxCalls == null ? 24 : Number(maxCalls);
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 256) throw new Error('The action has an invalid call limit.');
  if (!Array.isArray(rounds) || !rounds.length || rounds.length > maxCalls) throw new Error('Select at least one action (at most ' + maxCalls + ' rounds).');
  var count = 0;
  rounds.forEach(function (calls) {
    if (!Array.isArray(calls) || !calls.length || calls.length > 8) throw new Error('Each round needs one call per selected chain.');
    var seen = new Set();
    calls.forEach(function (call) {
      var cid = Number(call.chainId == null ? call.cid : call.chainId);
      if (!Number.isSafeInteger(cid) || cid <= 0 || seen.has(cid) || !/^0x[0-9a-f]{40}$/i.test(call.to || '')
      || !/^0x(?:[0-9a-f]{2})+$/i.test(call.data || '') || !call.abi || !call.functionName || !Array.isArray(call.args)) throw new Error('The reviewed round has an invalid or repeated destination.');
      if (BigInt(call.value || 0) !== 0n) throw new Error('These project actions must not transfer native value.');
      seen.add(cid); count++;
    });
  });
  if (count > maxCalls) throw new Error('Select at most ' + maxCalls + ' calls. Nothing was submitted.');
}

function keyFor(scope, account) { return PREFIX + String(account || '').toLowerCase() + ':' + scope; }
function stringify(value) { return JSON.stringify(value, function (_, item) { return typeof item === 'bigint' ? { $jbBigInt: item.toString() } : item; }); }
function parse(value) { return JSON.parse(value, function (_, item) { return item && typeof item === 'object' && Object.keys(item).length === 1 && typeof item.$jbBigInt === 'string' ? BigInt(item.$jbBigInt) : item; }); }
function read(key) {
  var raw;
  try { raw = localStorage.getItem(key); } catch (_) { throw new Error('Enable browser storage before starting or resuming this action.'); }
  if (!raw) return null;
  try {
    var plan = parse(raw);
    if (plan.version !== 1 || !Array.isArray(plan.rounds) || !Number.isInteger(plan.nextRound)
        || plan.nextRound < 0 || plan.nextRound > plan.rounds.length) throw new Error();
    return plan;
  } catch (_) { throw new Error('The saved action plan cannot be read. Check its previous transactions before starting again.'); }
}
function save(key, plan) {
  try {
    var raw = stringify(plan);
    if (raw.length > 750000) throw new Error();
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error();
  } catch (_) { throw new Error('The action checkpoint could not be saved. Enable browser storage and resume this same action.'); }
}

export function hasSavedActionPlan(scope, account) {
  try { return !!read(keyFor(scope, account)); } catch (_) { return true; }
}
export function acknowledgeSavedActionPlan(scope, account) {
  var key = keyFor(scope, account), plan = read(key);
  if (plan && verifiedPlans.has(key) && verifiedPlans.get(key) === plan.verificationId && plan.nextRound === plan.rounds.length && !plan.safePending && plan.results.every(function (result) { return result.relayr || result.confirmed === true || Number(result.executedReady || 0) + Number(result.obsoleteReady || 0) === Number(result.expectedCount); })) {
    localStorage.removeItem(key); verifiedPlans.delete(key);
  }
}

export async function runSavedActionPlan(options, locked) {
  var key = keyFor(options.scope, options.account);
  if (!options.scope || !options.account) throw new Error('This action is missing its account or recovery scope.');
  if (!locked) {
    if (active.has(key)) throw new Error('This action is already open. Resume it in the original window.');
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return navigator.locks.request(key, { ifAvailable: true }, function (lock) {
        if (!lock) throw new Error('This action is running in another window. Resume it there.');
        return runSavedActionPlan(options, true);
      });
    }
    throw new Error('This browser cannot lock a saved multichain action. Use a browser with Web Locks support to continue.');
  }
  active.add(key);
  verifiedPlans.delete(key);
  try {
    var plan = read(key), resumed = !!plan;
    if (!plan) {
      var prepared = await options.prepare();
      validateRounds(prepared && prepared.rounds, options.maxCalls);
      plan = { version: 1, id: crypto.randomUUID(), account: options.account.toLowerCase(), scope: options.scope, executionAccount: options.executionAccount || options.account, safeMode: !!options.safeMode, rounds: prepared.rounds,
        summary: prepared.summary || null, gas: prepared.gas || options.gas || 500000n,
        nextRound: 0, results: [], safePending: false };
      save(key, plan);
    }
    validateRounds(plan.rounds, options.maxCalls);
    if (!/^[0-9a-f-]{36}$/i.test(plan.id || '') || !Array.isArray(plan.results) || plan.results.length !== plan.nextRound) throw new Error('The saved action checkpoint is malformed. Verify its transactions before starting again.');
    if (plan.account !== options.account.toLowerCase() || plan.scope !== options.scope) throw new Error('The saved action belongs to a different account.');
    if (String(plan.executionAccount).toLowerCase() !== String(options.executionAccount || options.account).toLowerCase() || plan.safeMode !== !!options.safeMode) throw new Error('Resume this saved action with its original execution account and Safe selection.');
    // A second window starting recovery invalidates this window's older completion proof even if its
    // RPC lookup subsequently fails. Persist the new generation before reading any receipt.
    plan.verificationId = crypto.randomUUID(); save(key, plan);
    async function reconcileResults() {
      if (!options.reconcileResult) return;
      for (var ri = 0; ri < plan.results.length; ri++) {
        var reconciled = await options.reconcileResult(plan.results[ri], plan.rounds[ri], plan.skippedCalls && plan.skippedCalls[ri] || []);
        if (!reconciled) throw new Error('The saved action receipt could not be verified. Resume this same action to check again.');
        plan.results[ri] = reconciled; save(key, plan);
      }
    }
    await reconcileResults();
    if (plan.safePending) throw new Error('A Safe proposal or execution may have been submitted for this saved action. Inspect its exact calls in the Safe queue before starting another batch.');
    while (plan.nextRound < plan.rounds.length) {
      var index = plan.nextRound;
      var originalCalls = plan.rounds[index];
      var safeProgress = plan.safeProgress && plan.safeProgress.index === index ? plan.safeProgress : { index: index, proposals: [], executedChains: [] };
      function saveSafeProgress() { plan.safeProgress = safeProgress; save(key, plan); }
      function combinedSafeResult() {
        return { relayr: false, expectedCount: originalCalls.length, queued: safeProgress.proposals.length,
          immediateExecuted: safeProgress.executedChains.length, proposals: safeProgress.proposals,
          executedReady: safeProgress.executedChains.length + safeProgress.proposals.filter(function (proposal) { return proposal.executed; }).length };
      }
      var knownChains = safeProgress.proposals.map(function (proposal) { return Number(proposal.chainId); }).concat(safeProgress.executedChains.map(Number));
      if (new Set(knownChains).size !== knownChains.length || knownChains.some(function (cid) { return !originalCalls.some(function (call) { return Number(call.chainId == null ? call.cid : call.chainId) === cid; }); })) throw new Error('The saved Safe progress does not match its original calls.');
      var remainingCalls = plan.safeMode ? originalCalls.filter(function (call) { return knownChains.indexOf(Number(call.chainId == null ? call.cid : call.chainId)) === -1; }) : originalCalls;
      var checkpointed = false;
      function checkpoint(result) {
        if (checkpointed) return;
        var next = Object.assign({}, plan, { nextRound: index + 1, results: plan.results.concat([result || { confirmed: true }]), safePending: false });
        delete next.safeProgress;
        save(key, next); plan = next; checkpointed = true;
      }
      var result = remainingCalls.length ? await options.executeRound(remainingCalls, index, plan, {
        checkpoint: checkpoint,
        hasSafeProgress: !!(safeProgress.attempt || safeProgress.proposals.length || safeProgress.executedChains.length),
        replaceUnsubmittedRound: function (replacement) {
          if (checkpointed || plan.safePending || safeProgress.attempt || safeProgress.proposals.length || safeProgress.executedChains.length) throw new Error('A submitted Safe round cannot be changed.');
          validateRounds([replacement], options.maxCalls);
          var removed = originalCalls.filter(function (call) { return !replacement.some(function (next) { return Number(next.chainId == null ? next.cid : next.chainId) === Number(call.chainId == null ? call.cid : call.chainId); }); });
          if (removed.length) {
            plan.skippedCalls = plan.skippedCalls || {};
            plan.skippedCalls[index] = (plan.skippedCalls[index] || []).concat(removed);
          }
          originalCalls = replacement;
          plan.rounds[index] = replacement;
          save(key, plan);
        },
        beforeSafe: function (attempt) {
          // Execution of an already known exact proposal is recovered by that hash. It never requires
          // another proposal, even if the wallet loses its execution transaction response.
          var known = attempt && attempt.safeTxHash && safeProgress.proposals.some(function (proposal) { return Number(proposal.chainId) === Number(attempt.chainId) && String(proposal.safeTxHash).toLowerCase() === String(attempt.safeTxHash).toLowerCase(); });
          plan.safePending = !known; safeProgress.attempt = attempt || null; saveSafeProgress();
        },
        recordSafeProposal: function (proposal) {
          if (safeProgress.proposals.some(function (old) { return Number(old.chainId) === Number(proposal.chainId); })) throw new Error('This Safe destination already has a known proposal.');
          safeProgress.proposals.push(proposal); plan.safePending = false; safeProgress.attempt = null; saveSafeProgress();
        },
        recordSafeExecuted: function (chainId) {
          var known = safeProgress.proposals.find(function (proposal) { return Number(proposal.chainId) === Number(chainId); });
          if (known) known.executed = true;
          else if (safeProgress.executedChains.indexOf(Number(chainId)) === -1) safeProgress.executedChains.push(Number(chainId));
          plan.safePending = false; safeProgress.attempt = null; saveSafeProgress();
        },
        safeCancelled: function () { plan.safePending = false; safeProgress.attempt = null; saveSafeProgress(); },
      }) : combinedSafeResult();
      if (!result || result.cancelled) return Object.assign({}, result || {}, { cancelled: true, resumed: resumed });
      if (result.safePending) return Object.assign({}, result, { resumed: resumed });
      if (plan.safeMode && safeProgress.proposals.length + safeProgress.executedChains.length) {
        if (safeProgress.proposals.length + safeProgress.executedChains.length !== originalCalls.length) throw new Error('Some original Safe calls still need their own proposals. Resume only the remaining destinations.');
        // Same-window execution marks the returned known records; refresh the persisted copies as well.
        (result.proposals || []).forEach(function (proposal) { var saved = safeProgress.proposals.find(function (old) { return Number(old.chainId) === Number(proposal.chainId); }); if (saved && proposal.executed) saved.executed = true; });
        result = combinedSafeResult();
      }
      checkpoint(result);
    }
    // Later rounds may outlive the block that proved an earlier round. Recheck every exact submitted
    // identity before publishing completion, without moving nextRound back or submitting it again.
    await reconcileResults();
    verifiedPlans.set(key, plan.verificationId);
    return { completed: true, resumed: resumed, rounds: plan.rounds.length, results: plan.results };
  } finally { active.delete(key); }
}
