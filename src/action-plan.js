// Freeze independent destination calls before any wallet request. A receipt checkpoint is written before
// the lower-level Relayr/direct journal can clear, so interrupted rounds never start over from new balances.
import { browserLocks, assertLocksHeld, requestKeeping } from './browser-locks.js';

var PREFIX = 'jb-selected-action-v1:';
var active = new Set();

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
// The plan's journal is bound to the lock its run holds: a tab whose lock lapsed never writes it again.
async function save(key, plan, lock) {
  await assertLocksHeld([lock]);
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
  if (plan && plan.nextRound === plan.rounds.length && !plan.safePending && plan.results.every(function (result) { return result.relayr || result.confirmed === true || Number(result.executedReady || 0) + Number(result.obsoleteReady || 0) === Number(result.expectedCount); })) localStorage.removeItem(key);
}

// A refused saved action may be dropped only while nothing in it was handed to a wallet, Safe or Relayr: no
// checkpointed round and no Safe attempt or proposal. `journalsClear(plan)` must also prove the current round's own
// direct and Relayr journals unsubmitted. Anything uncertain keeps the plan for recovery.
export async function discardUnsubmittedActionPlan(scope, account, planId, journalsClear) {
  var key = keyFor(scope, account);
  if (active.has(key)) return false;
  return browserLocks().request(key, { ifAvailable: true }, async function (lock) {
    if (!lock || active.has(key)) return false;
    var plan;
    try { plan = read(key); } catch (_) { return false; }
    var progress = plan && plan.safeProgress;
    if (!plan || plan.id !== planId || plan.nextRound !== 0 || (plan.results || []).length || plan.safePending
      || (progress && (progress.attempt || (progress.proposals || []).length || (progress.executedChains || []).length))) return false;
    if (!await journalsClear(plan)) return false;
    await lock.assertHeld();
    localStorage.removeItem(key);
    return localStorage.getItem(key) == null;
  });
}

// A round's outcome (its checkpoint, a Safe proposal, execution or definite cancellation) is saved through the
// plan lock's keep: under a lapsed lock, it is saved under a fresh one, only to the same plan, round and attempt.
export async function runSavedActionPlan(options, lock, keep) {
  var key = keyFor(options.scope, options.account);
  if (!options.scope || !options.account) throw new Error('This action is missing its account or recovery scope.');
  if (!lock) {
    if (active.has(key)) throw new Error('This action is already open. Resume it in the original window.');
    return requestKeeping(key, { ifAvailable: true }, function (held, heldKeep) {
      if (!held) throw new Error('This action is running in another window. Resume it there.');
      return runSavedActionPlan(options, held, heldKeep);
    });
  }
  keep = keep || function (write) { return Promise.resolve().then(write); };
  active.add(key);
  try {
    var plan = read(key), resumed = !!plan;
    if (!plan) {
      var prepared = await options.prepare();
      validateRounds(prepared && prepared.rounds, options.maxCalls);
      plan = { version: 1, id: crypto.randomUUID(), account: options.account.toLowerCase(), scope: options.scope, executionAccount: options.executionAccount || options.account, safeMode: !!options.safeMode, rounds: prepared.rounds,
        summary: prepared.summary || null, gas: prepared.gas || options.gas || 500000n,
        nextRound: 0, results: [], safePending: false };
      await save(key, plan, lock);
    }
    validateRounds(plan.rounds, options.maxCalls);
    if (!/^[0-9a-f-]{36}$/i.test(plan.id || '') || !Array.isArray(plan.results) || plan.results.length !== plan.nextRound) throw new Error('The saved action checkpoint is malformed. Verify its transactions before starting again.');
    if (plan.account !== options.account.toLowerCase() || plan.scope !== options.scope) throw new Error('The saved action belongs to a different account.');
    if (String(plan.executionAccount).toLowerCase() !== String(options.executionAccount || options.account).toLowerCase() || plan.safeMode !== !!options.safeMode) throw new Error('Resume this saved action with its original execution account and Safe selection.');
    if (options.reconcileResult && plan.safeMode) {
      for (var ri = 0; ri < plan.results.length; ri++) {
        var reconciled = await options.reconcileResult(plan.results[ri], plan.rounds[ri]);
        if (reconciled) { plan.results[ri] = reconciled; await save(key, plan, lock); }
      }
    }
    if (plan.safePending) throw new Error('A Safe proposal or execution may have been submitted for this saved action. Inspect its exact calls in the Safe queue before starting another batch.');
    while (plan.nextRound < plan.rounds.length) {
      var index = plan.nextRound;
      var originalCalls = plan.rounds[index];
      var safeProgress = plan.safeProgress && plan.safeProgress.index === index ? plan.safeProgress : { index: index, proposals: [], executedChains: [] };
      function saveSafeProgress() { plan.safeProgress = safeProgress; return save(key, plan, lock); }
      // Applies one Safe outcome to the in-memory plan and saves it through keep. Under a lapsed lock, `apply`
      // runs again on the saved plan under a fresh lock, only while it is the same plan, round and attempt.
      function keepSafe(apply) {
        var planId = plan.id, round = index, attemptId = (safeProgress.attempt && safeProgress.attempt.id) || null;
        apply(plan, safeProgress);
        return keep(saveSafeProgress, async function (fresh) {
          var stored = read(key);
          if (!stored || stored.id !== planId || stored.nextRound !== round) return;
          var progress = stored.safeProgress && stored.safeProgress.index === round ? stored.safeProgress : { index: round, proposals: [], executedChains: [] };
          if (((progress.attempt && progress.attempt.id) || null) !== attemptId || apply(stored, progress) === false) return;
          stored.safeProgress = progress;
          await save(key, stored, fresh);
        });
      }
      function combinedSafeResult() {
        return { relayr: false, expectedCount: originalCalls.length, queued: safeProgress.proposals.length,
          immediateExecuted: safeProgress.executedChains.length, proposals: safeProgress.proposals,
          executedReady: safeProgress.executedChains.length + safeProgress.proposals.filter(function (proposal) { return proposal.executed; }).length };
      }
      var knownChains = safeProgress.proposals.map(function (proposal) { return Number(proposal.chainId); }).concat(safeProgress.executedChains.map(Number));
      if (new Set(knownChains).size !== knownChains.length || knownChains.some(function (cid) { return !originalCalls.some(function (call) { return Number(call.chainId == null ? call.cid : call.chainId) === cid; }); })) throw new Error('The saved Safe progress does not match its original calls.');
      var remainingCalls = plan.safeMode ? originalCalls.filter(function (call) { return knownChains.indexOf(Number(call.chainId == null ? call.cid : call.chainId)) === -1; }) : originalCalls;
      var checkpointed = false;
      function advance(from, result) {
        var next = Object.assign({}, from, { nextRound: index + 1, results: from.results.concat([result || { confirmed: true }]), safePending: false });
        delete next.safeProgress;
        return next;
      }
      async function checkpoint(result) {
        if (checkpointed) return;
        var next = advance(plan, result), planId = plan.id, round = index;
        await keep(function () { return save(key, next, lock); }, async function (fresh) {
          var stored = read(key);
          if (stored && stored.id === planId && stored.nextRound === round) await save(key, advance(stored, result), fresh);
        });
        plan = next; checkpointed = true;
      }
      var result = remainingCalls.length ? await options.executeRound(remainingCalls, index, plan, {
        checkpoint: checkpoint,
        // The plan lock, for the round's own wallet calls (Safe sign, approve, execute) to fence right before the prompt.
        locks: [lock],
        hasSafeProgress: !!(safeProgress.attempt || safeProgress.proposals.length || safeProgress.executedChains.length),
        // Every control below writes the plan's journal: callers await it.
        replaceUnsubmittedRound: async function (replacement) {
          if (checkpointed || plan.safePending || safeProgress.attempt || safeProgress.proposals.length || safeProgress.executedChains.length) throw new Error('A submitted Safe round cannot be changed.');
          validateRounds([replacement], options.maxCalls);
          originalCalls = replacement;
          plan.rounds[index] = replacement;
          await save(key, plan, lock);
        },
        beforeSafe: function (attempt) {
          // Execution of an already known exact proposal is recovered by that hash. It never requires
          // another proposal, even if the wallet loses its execution transaction response.
          var known = attempt && attempt.safeTxHash && safeProgress.proposals.some(function (proposal) { return Number(proposal.chainId) === Number(attempt.chainId) && String(proposal.safeTxHash).toLowerCase() === String(attempt.safeTxHash).toLowerCase(); });
          // The attempt's id lets a later outcome, saved under a fresh lock, prove it is this same attempt.
          plan.safePending = !known; safeProgress.attempt = attempt ? Object.assign({}, attempt, { id: crypto.randomUUID() }) : null;
          return saveSafeProgress();
        },
        recordSafeProposal: function (proposal) {
          var known = function (progress) { return progress.proposals.some(function (old) { return Number(old.chainId) === Number(proposal.chainId); }); };
          if (known(safeProgress)) throw new Error('This Safe destination already has a known proposal.');
          return keepSafe(function (target, progress) {
            if (progress !== safeProgress && known(progress)) return false;
            progress.proposals.push(proposal); target.safePending = false; progress.attempt = null;
          });
        },
        recordSafeExecuted: function (chainId) {
          return keepSafe(function (target, progress) {
            var known = progress.proposals.find(function (proposal) { return Number(proposal.chainId) === Number(chainId); });
            if (known) known.executed = true;
            else if (progress.executedChains.indexOf(Number(chainId)) === -1) progress.executedChains.push(Number(chainId));
            target.safePending = false; progress.attempt = null;
          });
        },
        safeCancelled: function () { return keepSafe(function (target, progress) { target.safePending = false; progress.attempt = null; }); },
      }) : combinedSafeResult();
      if (!result || result.cancelled) return Object.assign({}, result || {}, { cancelled: true, resumed: resumed });
      if (result.safePending) return Object.assign({}, result, { resumed: resumed });
      if (plan.safeMode && safeProgress.proposals.length + safeProgress.executedChains.length) {
        if (safeProgress.proposals.length + safeProgress.executedChains.length !== originalCalls.length) throw new Error('Some original Safe calls still need their own proposals. Resume only the remaining destinations.');
        // Same-window execution marks the returned known records; refresh the persisted copies as well.
        (result.proposals || []).forEach(function (proposal) { var saved = safeProgress.proposals.find(function (old) { return Number(old.chainId) === Number(proposal.chainId); }); if (saved && proposal.executed) saved.executed = true; });
        result = combinedSafeResult();
        if (options.reconcileResult && remainingCalls.length === 0) result = await options.reconcileResult(result, originalCalls);
      }
      await checkpoint(result);
    }
    return { completed: true, resumed: resumed, rounds: plan.rounds.length, results: plan.results };
  } finally { active.delete(key); }
}
