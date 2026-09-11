// src/safe-batch-ui.js
// The Safe operator batch surfaces: the tray strip at the top of the Owner/Operator tab, the preset dialog, the
// per-chain batch dialog (the app's standard confirm shape carrying an editable step list), and the submit routes —
// one proposal through the connected Safe App, one operation-1 SafeTx signed by a Safe owner, or ordered
// direct sends / one Relayr bundle for an EOA authority. Never N separate Safe proposals.
import { el, openDialog, confirmTransactionModal, getAccount, connect, truncAddr, createPublicClientForChain, isSafeConnected, getWalletClient, renderTxReview, resolveContractName, makeStatusSetter, errMessage, ZERO_ADDRESS } from './component-base.js';
import { chainNameFor, usdcByChain } from './chain.js';
import { getAddress } from './abi-registry.js';
import { STEP_KINDS, buildStep, loadTray, saveTray, clearTray, upsertStep, moveStep, removeStep, composeBatch, checkBatchOrder, dependsOnPrior, mirrorBatch, encodeMultiSend, simulateBatchCalls, MULTI_SEND_CALL_ONLY, NATIVE_TOKEN, TRAY_UPDATED_EVENT } from './safe-batch.js';
export { simulateBatchCalls } from './safe-batch.js';
import { PRESETS, resolvePreset } from './safe-batch-presets.js';
import { proposeSafeTx, getSafeNextNonce, listPendingSafeTxs, hasSafeService, safeOnChainContext, safeTxHashForCall, safeApprovalsOf, approveSafeHashOnChain, executeSafeTx } from './safe.js';
import { proposeSafeTransactions } from './safe-app.js';
import { safeInfoForAuthority, safeAuthorityAccessMode, runRelayrAcrossChains, projectAuthorityAddress, projectAuthorityLabel, ensureOperatorAccount, relayrActionScope, pidOn, projectBuybackHook } from './discover.js';

var MIN_TWAP_WINDOW = 300, MAX_TWAP_WINDOW = 172800;

function sameAddr(a, b) { return !!(a && b && String(a).toLowerCase() === String(b).toLowerCase()); }
function projectChains(project) { return (project.chains && project.chains.length) ? project.chains : [{ id: project.chainId, name: chainNameFor(project.chainId) }]; }
function chainName(chain) { return chain.name || chainNameFor(chain.id); }
function trayFor(project, chain) { return loadTray(chain.id, pidOn(project, chain.id)); }
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
function stepTx(step, chain) {
  return { chain: chainName(chain), chainId: chain.id, contract: resolveContractName(step.to, chain.id) || step.contractName || step.to, address: step.to,
    calldata: step.data, abi: step.abi, functionName: step.functionName, rawArgs: step.args, value: '0' };
}
function button(className, text, onClick) {
  var b = el('button', className); b.type = 'button'; b.textContent = text;
  b.addEventListener('click', function (e) { e.preventDefault(); onClick(); });
  return b;
}

// ── Tray ─────────────────────────────────────────────────────────────────────
// One chip per chain with queued steps; hidden only when nothing is queued AND no chain has the buyback/router
// registries a preset could target. Re-renders on the storage writer's event so it survives the cached tab.
export function renderSafeBatchTray(project) {
  var node = el('div', 'safe-batch-tray');
  var status = el('div', 'safe-batch-tray-status');
  var setStatus = makeStatusSetter(status, 'safe-batch-tray-status');
  function paint() {
    var chains = projectChains(project);
    var queued = chains.map(function (c) { return { chain: c, steps: trayFor(project, c) }; }).filter(function (r) { return r.steps.length; });
    var hasInfra = chains.some(function (c) { return !!getAddress('JBBuybackHookRegistry', c.id); });
    node.hidden = !queued.length && !hasInfra;
    node.innerHTML = '';
    if (node.hidden) return;
    var label = el('span', 'safe-batch-tray-label'); label.textContent = 'Batch'; node.appendChild(label);
    if (!queued.length) { var none = el('span', 'safe-batch-tray-empty'); none.textContent = 'Nothing queued. Add actions to review together as a batch, or start from a preset.'; node.appendChild(none); }
    queued.forEach(function (r) {
      node.appendChild(button('safe-batch-chip', r.steps.length + ' queued · ' + chainName(r.chain), function () {
        openBatchDialog(project, r.chain, setStatus).catch(function (e) { setStatus(errMessage(e, 'Could not open the batch.'), 'error'); });
      }));
    });
    node.appendChild(button('operator-cta safe-batch-presets', 'Presets', function () { openPresetDialog(project, setStatus); }));
    if (queued.length && chains.length > 1) {
      node.appendChild(button('operator-cta safe-batch-mirror', 'Same on every chain', function () {
        setStatus('Reading the other chains…', 'pending');
        mirrorAcrossChains(project).then(function (report) { setStatus(report.message, report.mirrored.length ? 'success' : 'error'); })
          .catch(function (e) { setStatus(errMessage(e, 'Could not mirror the batch.'), 'error'); });
      }));
    }
    if (queued.length) {
      node.appendChild(button('operator-cta safe-batch-clear', 'Clear', function () {
        chains.forEach(function (c) { clearTray(c.id, pidOn(project, c.id)); });
        setStatus('Cleared the batch.', '');
      }));
    }
    node.appendChild(status);
  }
  paint();
  document.addEventListener(TRAY_UPDATED_EVENT, function () { if (node.isConnected) paint(); });
  return node;
}

// ── Route ────────────────────────────────────────────────────────────────────
// Decided from (authority identity, connection): a Safe reached through the Safe App as itself, a Safe whose owner is
// connected, the EOA authority itself, or a refusal that disables the primary with the existing copy.
export async function resolveBatchRoute(project, chainId, authority) {
  var role = projectAuthorityLabel(project).toLowerCase();
  if (!authority) return { mode: null, label: 'Send batch', description: 'unavailable', refusal: 'Could not read the project’s ' + role + '.' };
  var signer = getAccount();
  if (!signer) signer = await connect().then(getAccount).catch(function () { return null; });
  var safeInfo = await safeInfoForAuthority(authority, chainId, Number(project._urlChainId || project.chainId));
  if (safeInfo) {
    var mode = safeAuthorityAccessMode(signer, authority, safeInfo, isSafeConnected());
    var base = { safeInfo: safeInfo, signer: signer, label: 'Propose batch to Safe', steps: ['Propose batch to Safe'],
      intro: 'Review one proposal. The Safe runs its steps together once approved and executed.' };
    if (!mode) return Object.assign(base, { mode: null, description: 'one proposal to the Safe',
      refusal: signer ? 'Connected wallet isn’t a signer of the Safe (' + truncAddr(authority) + ').' : 'Connect a Safe signer to propose the batch.' });
    return Object.assign(base, { mode: mode, description: mode === 'safe-app' ? 'one proposal through the connected Safe'
      : 'one transaction with all steps ' + (hasSafeService(chainId) ? 'proposed to the Safe’s queue' : 'approved on the blockchain for the Safe') });
  }
  if (signer && sameAddr(signer, authority)) return { mode: 'eoa', signer: signer, description: 'transactions sent from your wallet in order' };
  return { mode: null, label: 'Send batch', description: 'direct sends from the ' + role,
    refusal: signer ? 'Connected wallet is not the ' + role + '. Switch to ' + truncAddr(authority) + '.' : 'Connect the ' + role + ' wallet to send the batch.' };
}

// ── Batch dialog ─────────────────────────────────────────────────────────────
export async function openBatchDialog(project, chain, setStatus) {
  var pid = pidOn(project, chain.id);
  var steps = loadTray(chain.id, pid);
  if (!steps.length) { setStatus('Nothing queued on ' + chainName(chain) + '.', ''); return null; }
  var authority = projectAuthorityAddress(project);
  setStatus('Checking who can send the batch…', 'pending');
  var route = await resolveBatchRoute(project, chain.id, authority);
  setStatus('', '');
  // An EOA authority sends every chain's queued batch in one go: sequentially on one chain, or as one Relayr bundle
  // when two or more chains are queued (same-chain calls keep their order through per-chain virtual nonces).
  var others = route.mode === 'eoa' ? projectChains(project).filter(function (c) { return c.id !== chain.id && trayFor(project, c).length; }) : [];
  var state = { steps: steps };
  function eoaCount() { return state.steps.length + others.reduce(function (n, c) { return n + trayFor(project, c).length; }, 0); }
  if (route.mode === 'eoa') {
    route.label = 'Send ' + plural(eoaCount(), 'transaction');
    route.steps = [route.label];
    route.intro = 'Review and send each transaction in order.';
    if (others.length) route.description = 'one Relayr bundle across ' + [chain].concat(others).map(chainName).join(', ');
  }
  var title = 'Batch on ' + chainName(chain);
  var session = await confirmTransactionModal({
    action: title, chain: chainName(chain), chainId: chain.id,
    summary: { action: title, rows: [['On', chainName(chain)], ['From', truncAddr(authority) + (route.safeInfo ? ' (Safe)' : ' (wallet)')], ['Route', route.description]] },
  }, {
    title: title, confirmText: route.label, keepOpenForProgress: true, steps: route.steps || [route.label], stepsIntro: route.intro,
    body: function (controls) {
      return renderBatchBody(project, chain, state, route, others, Object.assign({}, controls, { eoaCount: eoaCount }));
    },
  });
  if (!session || !session.ok) return null;
  try {
    if (route.mode === 'eoa') {
      session.close();
      return await sendBatchDirect(project, [chain].concat(others), setStatus);
    }
    var composed = composeBatch(state.steps);
    if (!composed.ok) throw new Error(composed.problems[0].message);
    var flags = state.steps.map(function (_, i) { return dependsOnPrior(state.steps, i); });
    var common = { chainId: chain.id, chainName: chainName(chain), calls: composed.calls, dependsOnPrior: flags, setStatus: session.showStatus };
    var result = route.mode === 'safe-app'
      ? await proposeBatchThroughSafeApp(Object.assign(common, { authority: authority }))
      : await proposeBatchAsOwner(Object.assign(common, { safe: authority, signer: route.signer }));
    clearTray(chain.id, pid);
    document.dispatchEvent(new CustomEvent('jb:safe-queued'));
    document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
    var count = plural(composed.calls.length, 'call');
    session.showStatus(result.executed ? 'Executed the batch of ' + count + '.'
      : result.threshold ? 'Approved the batch of ' + count + ' onchain (' + result.approvals + ' of ' + result.threshold + ' signers). It executes once the Safe threshold is met.'
      : 'Proposed to Safe as one batch of ' + count + '.', 'success');
    setTimeout(session.close, 2200);
    return result;
  } catch (e) {
    if (/^cancelled$/i.test(String(e && e.message))) { setStatus('Cancelled', ''); return null; }
    var message = errMessage(e, 'Could not submit the batch.');
    if (route.mode === 'eoa') setStatus(message, 'error'); else session.showStatus(message, 'error');
    return null;
  }
}

// The editable step list: numbered like TxSteps, each step with its decoded call, ↑ ↓ ✕ buttons, and the dependency
// message under an offending step. Every edit persists to the tray and re-paints in place.
function renderBatchBody(project, chain, state, route, others, controls) {
  var box = el('div', 'safe-batch-body');
  function control(text, label, disabled, onClick) {
    var b = button('safe-batch-step-control', text, onClick); b.setAttribute('aria-label', label); b.title = label; b.disabled = disabled;
    return b;
  }
  function update(next) { state.steps = next; saveTray(chain.id, pidOn(project, chain.id), next); repaint(); }
  function repaint() {
    box.innerHTML = '';
    var order = checkBatchOrder(state.steps);
    var list = el('ol', 'safe-batch-steps');
    state.steps.forEach(function (step, i) {
      var item = el('li', 'safe-batch-step');
      var head = el('div', 'safe-batch-step-head');
      var num = el('span', 'safe-batch-step-number'); num.textContent = String(i + 1); head.appendChild(num);
      var lab = el('span', 'safe-batch-step-label'); lab.textContent = step.label; head.appendChild(lab);
      if (step.detail) { var det = el('span', 'safe-batch-step-detail'); det.textContent = step.detail; head.appendChild(det); }
      var ctl = el('div', 'safe-batch-step-controls');
      ctl.appendChild(control('↑', 'Move up', i === 0, function () { update(moveStep(state.steps, i, i - 1)); }));
      ctl.appendChild(control('↓', 'Move down', i === state.steps.length - 1, function () { update(moveStep(state.steps, i, i + 1)); }));
      ctl.appendChild(control('✕', 'Remove', false, function () { update(removeStep(state.steps, i)); }));
      head.appendChild(ctl); item.appendChild(head);
      item.appendChild(renderTxReview(stepTx(step, chain)));
      var problem = order.problems.filter(function (p) { return p.index === i; })[0];
      if (problem) { var msg = el('div', 'safe-batch-problem'); msg.textContent = problem.message; item.appendChild(msg); }
      list.appendChild(item);
    });
    box.appendChild(list);
    if (!state.steps.length) { var empty = el('div', 'safe-batch-problem'); empty.textContent = 'Nothing left in this batch.'; box.appendChild(empty); }
    others.forEach(function (c) {
      var also = el('div', 'safe-batch-also');
      var head = el('div', 'safe-batch-step-head'); var lab = el('span', 'safe-batch-step-label'); lab.textContent = 'Also on ' + chainName(c); head.appendChild(lab); also.appendChild(head);
      var lines = el('ol', 'safe-batch-also-steps');
      trayFor(project, c).forEach(function (s) { var li = el('li'); li.textContent = s.label + (s.detail ? ' — ' + s.detail : ''); lines.appendChild(li); });
      also.appendChild(lines);
      var hint = el('div', 'safe-batch-step-detail'); hint.textContent = 'Select that chain to reorder or remove its steps.'; also.appendChild(hint);
      box.appendChild(also);
    });
    if (route.mode && route.mode !== 'eoa' && state.steps.length) {
      var details = document.createElement('details'); details.className = 'tx-rawdata';
      var sm = document.createElement('summary'); sm.textContent = 'Show encoded transaction data (calldata)'; details.appendChild(sm);
      var pre = el('pre', 'create-payload');
      pre.textContent = JSON.stringify({ to: MULTI_SEND_CALL_ONLY, contract: 'MultiSendCallOnly', operation: 1, value: '0', data: encodeMultiSend(composeBatch(state.steps).calls) }, null, 2);
      details.appendChild(pre); box.appendChild(details);
    }
    if (route.refusal) { var refusal = el('div', 'safe-batch-refusal'); refusal.textContent = route.refusal; box.appendChild(refusal); }
    if (controls.setConfirmDisabled) controls.setConfirmDisabled(!route.mode || !order.ok || !state.steps.length);
    if (route.mode === 'eoa' && controls.setConfirmText) controls.setConfirmText('Send ' + plural(controls.eoaCount(), 'transaction'));
  }
  repaint();
  return box;
}

// ── Submit routes ────────────────────────────────────────────────────────────
// Connected through the Safe App as the authority: the Safe builds the MultiSend itself from the ordered list.
export async function proposeBatchThroughSafeApp(opts) {
  var wallet = getWalletClient();
  if (!wallet) throw new Error('Connect the Safe to continue.');
  var walletChainId = await wallet.getChainId();
  if (Number(walletChainId) !== Number(opts.chainId)) throw new Error('Open this Safe on ' + opts.chainName + ' before proposing the batch.');
  var client = opts.client || createPublicClientForChain(opts.chainId);
  opts.setStatus('Simulating the batch from the Safe…', 'pending');
  await simulateBatchCalls(client, opts.authority, opts.calls, opts.dependsOnPrior);
  opts.setStatus('Proposing the batch to the Safe — confirm in Safe{Wallet}…', 'pending');
  var safeTxHash = await proposeSafeTransactions(opts.calls.map(function (c) { return { to: c.to, value: '0', data: c.data }; }));
  if (!safeTxHash) throw new Error('Safe returned no proposal hash.');
  return { safeTxHash: safeTxHash, executed: false };
}

// A Safe owner's wallet: ONE SafeTx { to: MultiSendCallOnly, data: multiSend(packed), operation: 1 } at the next
// proposal nonce through the transaction service, or approveHash + execTransaction onchain where there is none.
export async function proposeBatchAsOwner(opts) {
  var chainId = Number(opts.chainId), safe = opts.safe;
  var client = opts.client || createPublicClientForChain(chainId);
  var code = await client.getCode({ address: MULTI_SEND_CALL_ONLY });
  if (!code || code === '0x') throw new Error('MultiSendCallOnly isn’t deployed on ' + opts.chainName + ', so a Safe batch can’t be proposed there.');
  opts.setStatus('Simulating the batch from the Safe…', 'pending');
  await simulateBatchCalls(client, safe, opts.calls, opts.dependsOnPrior);
  var data = encodeMultiSend(opts.calls);
  if (hasSafeService(chainId)) {
    var loaded = await Promise.all([getSafeNextNonce(chainId, safe), listPendingSafeTxs(chainId, safe)]);
    var next = Number(loaded[0]);
    if (!Number.isSafeInteger(next) || next < 0) throw new Error('Could not read the Safe’s next transaction number (nonce) on ' + opts.chainName + '.');
    var queued = (loaded[1] || []).map(function (t) { return Number(t.nonce); }).filter(function (n) { return Number.isSafeInteger(n) && n >= 0; });
    var nonce = queued.length ? Math.max(next, Math.max.apply(null, queued) + 1) : next;
    opts.setStatus('Proposing the batch at transaction number ' + nonce + ' — sign in your wallet…', 'pending');
    var proposed = await proposeSafeTx({ chainId: chainId, safe: safe, to: MULTI_SEND_CALL_ONLY, data: data, value: 0, operation: 1, signer: opts.signer, nonce: nonce });
    return { safeTxHash: proposed.safeTxHash, nonce: nonce, executed: false };
  }
  var ctx = await safeOnChainContext(chainId, safe);
  var hash = safeTxHashForCall(chainId, safe, { to: MULTI_SEND_CALL_ONLY, data: data, value: 0, nonce: ctx.nonce, operation: 1 });
  var approved = await safeApprovalsOf(chainId, safe, hash, ctx.owners);
  if (!approved.some(function (owner) { return sameAddr(owner, opts.signer); })) {
    opts.setStatus('Approving the batch on the blockchain at transaction number ' + ctx.nonce + ' — confirm in your wallet…', 'pending');
    await approveSafeHashOnChain(chainId, safe, hash);
    approved = await safeApprovalsOf(chainId, safe, hash, ctx.owners);
  }
  if (approved.length >= ctx.threshold) {
    opts.setStatus('Executing the batch — confirm in your wallet…', 'pending');
    await executeSafeTx(chainId, safe, { to: MULTI_SEND_CALL_ONLY, value: 0, data: data, operation: 1, nonce: ctx.nonce, safeTxGas: 0, baseGas: 0, gasPrice: 0,
      gasToken: ZERO_ADDRESS, refundReceiver: ZERO_ADDRESS, confirmations: approved.map(function (owner) { return { owner: owner, approvedHash: true }; }) });
    return { safeTxHash: hash, nonce: ctx.nonce, executed: true };
  }
  return { safeTxHash: hash, nonce: ctx.nonce, executed: false, approvals: approved.length, threshold: ctx.threshold };
}

// EOA authority: the existing dispatcher, handed an ordered array of calls per chain.
async function sendBatchDirect(project, chains, setStatus) {
  var account = await ensureOperatorAccount(project, projectAuthorityAddress(project), setStatus);
  if (!account) return null;
  var byChain = {}, total = 0;
  chains.forEach(function (c) {
    var steps = trayFor(project, c);
    var order = checkBatchOrder(steps);
    if (!order.ok) throw new Error(chainName(c) + ': ' + order.problems[0].message);
    byChain[c.id] = steps; total += steps.length;
  });
  var buildCall = function (cid) {
    return byChain[cid].map(function (s) { return { to: s.to, data: s.data, abi: s.abi, functionName: s.functionName, args: s.args, contract: s.contractName, step: s.label }; });
  };
  var res = await runRelayrAcrossChains(chains, account, buildCall, 500000n, setStatus, {
    label: 'Batch', title: 'Send the batch',
    pendingScope: relayrActionScope(project, 'safe-batch', chains.map(function (c) { return c.id; }).join('-')),
  });
  if (!res || res.cancelled) { setStatus('Cancelled', ''); return res; }
  chains.forEach(function (c) { clearTray(c.id, pidOn(project, c.id)); });
  document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
  setStatus('Sent ' + plural(total, 'transaction') + '.', 'success');
  return res;
}

// ── Mirror ───────────────────────────────────────────────────────────────────
// Per-chain kinds re-resolve on the target chain: a pool through the preset reads, a TWAP window through the
// project's hook there. Anything priced or minted per chain is skipped with its reason.
export function mirrorResolver(project) {
  return async function (kind, toChainId, step) {
    var name = chainNameFor(toChainId);
    if (kind === 'setPoolFor') {
      var resolved = await resolvePreset(PRESETS[0], { chainId: toChainId, projectId: pidOn(project, toChainId), client: createPublicClientForChain(toChainId) });
      var wantNative = isNative(step.values.terminalToken);
      var match = resolved.steps.filter(function (s) { return s.kind === 'setPoolFor' && isNative(s.values.terminalToken) === wantNative; })[0];
      return match ? { values: match.values } : { reason: 'no live ' + (wantNative ? 'native' : 'USDC') + ' pool to carry on ' + name };
    }
    if (kind === 'setTwapWindowOf') {
      var hook = await projectBuybackHook(project, toChainId);
      if (!hook || sameAddr(hook, ZERO_ADDRESS)) return { reason: 'no buyback hook on ' + name };
      var token = mapToken(step.values.terminalToken, step.chainId, toChainId);
      if (!token) return { reason: 'its pair token has no counterpart on ' + name };
      return { to: hook, values: Object.assign({}, step.values, { terminalToken: token }) };
    }
    if (kind === 'initializePoolFor') return { reason: 'the pool price is chain-specific; initialize it on ' + name + ' directly' };
    return { reason: 'its values are chain-specific; add it on ' + name + ' directly' };
  };
}
function isNative(token) { return !token || sameAddr(token, NATIVE_TOKEN) || sameAddr(token, ZERO_ADDRESS); }
function mapToken(token, fromChainId, toChainId) {
  if (isNative(token)) return token;
  var usdc = usdcByChain();
  return sameAddr(token, usdc[Number(fromChainId)]) ? (usdc[Number(toChainId)] || null) : null;
}

export async function mirrorAcrossChains(project) {
  var chains = projectChains(project);
  var current = Number(project._urlChainId || project.chainId);
  var source = chains.filter(function (c) { return c.id === current && trayFor(project, c).length; })[0]
    || chains.filter(function (c) { return trayFor(project, c).length; })[0];
  if (!source) return { mirrored: [], skipped: [], message: 'Nothing queued to mirror.' };
  var steps = trayFor(project, source), resolve = mirrorResolver(project);
  var mirrored = [], skipped = [];
  for (var i = 0; i < chains.length; i++) {
    var target = chains[i];
    if (target.id === source.id) continue;
    var pid = pidOn(project, target.id);
    var result = await mirrorBatch(steps, source.id, target.id, resolve, pid);
    if (result.steps.length) {
      var tray = loadTray(target.id, pid);
      result.steps.forEach(function (s) { tray = upsertStep(tray, s); });
      saveTray(target.id, pid, tray);
      mirrored.push(chainName(target) + ' (' + result.steps.length + ')');
    }
    result.skipped.forEach(function (s) { skipped.push(chainName(target) + ': ' + s.label + ' — ' + s.reason); });
  }
  var message = (mirrored.length ? 'Mirrored ' + chainName(source) + '’s batch to ' + mirrored.join(', ') + '.' : 'Nothing could be mirrored from ' + chainName(source) + '.')
    + (skipped.length ? ' Skipped ' + skipped.join('; ') + '.' : '');
  return { mirrored: mirrored, skipped: skipped, message: message };
}

// ── Presets ──────────────────────────────────────────────────────────────────
// Lists the resolved steps per chain with a chain checklist, an editable TWAP window per carried pool, then adds
// them to each checked chain's tray. It does not submit.
export function openPresetDialog(project, setTrayStatus) {
  var preset = PRESETS[0];
  var chains = projectChains(project);
  var wrap = el('div', 'modal-body safe-batch-preset');
  var desc = el('div', 'modal-balance');
  desc.textContent = preset.description + ' We check each chain and list the steps it needs. Add them now, then review before sending.';
  wrap.appendChild(desc);
  var list = el('div', 'safe-batch-preset-chains'); wrap.appendChild(list);
  var status = el('div', 'modal-status'); wrap.appendChild(status);
  var setStatus = makeStatusSetter(status);
  var foot = el('div', 'modal-foot');
  var cancel = el('button', 'create-btn ghost'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  var add = el('button', 'modal-submit'); add.type = 'button'; add.textContent = 'Checking…'; add.disabled = true;
  foot.appendChild(cancel); foot.appendChild(add); wrap.appendChild(foot);
  var modal = openDialog(preset.title);
  modal.panel.appendChild(wrap);

  var rows = chains.map(function (c) {
    var row = el('div', 'safe-batch-preset-chain');
    var head = el('label', 'safe-batch-preset-head');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.disabled = true; head.appendChild(cb);
    var nm = el('span'); nm.textContent = chainName(c); head.appendChild(nm);
    row.appendChild(head);
    var st = el('div', 'safe-batch-preset-status'); st.textContent = 'Reading ' + chainName(c) + '…'; row.appendChild(st);
    var stepsEl = el('div', 'safe-batch-preset-steps'); row.appendChild(stepsEl);
    list.appendChild(row);
    return { chain: c, cb: cb, st: st, stepsEl: stepsEl, resolved: null, twap: [] };
  });
  function selectedCount() { return rows.reduce(function (n, r) { return n + (r.cb.checked && r.resolved ? r.resolved.steps.length : 0); }, 0); }
  function syncButton() {
    var pending = rows.some(function (r) { return r.resolved === null; });
    var n = selectedCount();
    add.disabled = pending || !n;
    add.textContent = pending ? 'Checking…' : 'Add ' + plural(n, 'step') + ' to batch';
  }
  rows.forEach(function (r) {
    r.cb.addEventListener('change', syncButton);
    resolvePreset(preset, { chainId: r.chain.id, projectId: pidOn(project, r.chain.id), client: createPublicClientForChain(r.chain.id) }).then(function (res) {
      r.resolved = res;
      if (!res.available || res.nothingToDo) { r.st.textContent = res.reason; return; }
      r.st.textContent = plural(res.steps.length, 'step');
      r.cb.disabled = false; r.cb.checked = true;
      res.steps.forEach(function (s, i) {
        var def = STEP_KINDS[s.kind];
        var line = el('div', 'safe-batch-preset-step');
        var text = el('span'); line.appendChild(text);
        // The pool line's window is the editable input beside it, so the description drops its own TWAP suffix.
        text.textContent = (i + 1) + '. ' + def.label + ' — ' + (s.kind === 'setPoolFor' ? def.describe(s.values).replace(/, TWAP \d+s$/, '') : def.describe(s.values));
        if (s.kind === 'setPoolFor') {
          var input = el('input', 'safe-batch-twap'); input.type = 'number'; input.min = String(MIN_TWAP_WINDOW); input.max = String(MAX_TWAP_WINDOW);
          input.value = String(s.values.twapWindow); input.setAttribute('aria-label', 'Price averaging period in seconds (TWAP)');
          line.appendChild(document.createTextNode(' Price averaging period (TWAP) ')); line.appendChild(input); line.appendChild(document.createTextNode(' s'));
          r.twap.push({ step: s, input: input });
        }
        if (s.note) { var note = el('div', 'safe-batch-preset-note'); note.textContent = s.note; line.appendChild(note); }
        r.stepsEl.appendChild(line);
      });
      res.notes.forEach(function (n) { var note = el('div', 'safe-batch-preset-note'); note.textContent = n; r.stepsEl.appendChild(note); });
    }).catch(function (e) {
      r.resolved = { available: false, steps: [] };
      r.st.textContent = 'Could not read ' + chainName(r.chain) + ': ' + errMessage(e, 'read failed');
    }).then(syncButton);
  });
  cancel.addEventListener('click', modal.requestClose);
  add.addEventListener('click', function () {
    var added = [], count = 0;
    try {
      rows.forEach(function (r) {
        if (!r.cb.checked || !r.resolved || !r.resolved.steps.length) return;
        var pid = pidOn(project, r.chain.id);
        var tray = loadTray(r.chain.id, pid);
        r.resolved.steps.forEach(function (s) {
          var values = Object.assign({}, s.values);
          var edited = r.twap.filter(function (t) { return t.step === s; })[0];
          if (edited) {
            var window = Number(edited.input.value);
            if (!Number.isInteger(window) || window < MIN_TWAP_WINDOW || window > MAX_TWAP_WINDOW) throw new Error('Enter a price averaging period (TWAP) between ' + MIN_TWAP_WINDOW + ' and ' + MAX_TWAP_WINDOW + ' seconds for ' + chainName(r.chain) + '.');
            values.twapWindow = window;
          }
          tray = upsertStep(tray, buildStep(s.kind, { chainId: r.chain.id, projectId: pid, values: values }));
          count++;
        });
        saveTray(r.chain.id, pid, tray);
        added.push(chainName(r.chain));
      });
    } catch (e) { setStatus(errMessage(e, 'Could not add the preset.'), 'error'); return; }
    modal.close();
    setTrayStatus('Added ' + plural(count, 'step') + ' to the batch for ' + added.join(', ') + '.', 'success');
  });
  return modal;
}
