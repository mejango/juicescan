// src/queue-ruleset-component.js
// Queue Ruleset component — queues new rulesets for an existing project
// Flow: project ID -> chain -> ruleset config(s) -> execute

import {
  el, createComponentWrapper, createProjectAndChainInput,
  createWalletButton, selectChain, firstChainForNetwork,
  executeTransaction, openPendingReview, renderError, getAddress, parseHashDefaults,
  createPublicClientForChain, getChainTokens,
} from './component-base.js';
import { projectDiscovery } from './project-discovery.js';
import { chainNameFor } from './chain.js';
import { createDefaultRuleset, buildRulesetConfigs } from './ruleset-config.js';
import { renderRulesetFieldset } from './ruleset-ui.js';
import { requiredFeedPairs, verifyFeedCoverage, feedCurrencyLabel } from './create-flow.js';

var accountingContextsAbi = [{
  type: 'function', name: 'accountingContextsOf', stateMutability: 'view',
  inputs: [{ name: 'projectId', type: 'uint256' }],
  outputs: [{ type: 'tuple[]', components: [
    { name: 'token', type: 'address' }, { name: 'decimals', type: 'uint8' }, { name: 'currency', type: 'uint32' },
  ] }],
}];

// A queued ruleset can repoint baseCurrency while the project's accounting contexts stay immutable —
// block a base whose (context ↔ base) JBPrices pair is unreachable, since payments in that context
// would revert under the new rules. Cross-context pairs are not probed: the queue can't change them,
// and blocking on them would also block a rescue queue (allowAddPriceFeed) on an affected project.
function verifyQueueFeedCoverage(chainId, projectId, rulesetConfigs) {
  var terminal = getAddress('JBMultiTerminal', chainId);
  if (!terminal) return Promise.resolve(); // no canonical terminal → no contexts to convert
  var bases = [];
  rulesetConfigs.forEach(function (cfg) {
    var cur = Number(cfg.metadata && cfg.metadata.baseCurrency) || 1;
    if (bases.indexOf(cur) === -1) bases.push(cur);
  });
  return createPublicClientForChain(chainId)
    .readContract({ address: terminal, abi: accountingContextsAbi, functionName: 'accountingContextsOf', args: [BigInt(projectId)] })
    .catch(function () { throw new Error('Could not check the exchange rates needed for these rules. Nothing was sent. Try again.'); })
    .then(function (ctxs) {
      var known = getChainTokens(chainId);
      var labeled = (ctxs || []).map(function (ctx) {
        var match = known.find(function (t) { return t.address.toLowerCase() === String(ctx.token).toLowerCase(); });
        return { token: ctx.token, currency: ctx.currency, symbol: match ? match.symbol.replace(' (native)', '') : null };
      });
      var pairs = requiredFeedPairs(labeled, bases, true);
      return verifyFeedCoverage(chainId, pairs, function (cur) { return feedCurrencyLabel(cur, labeled); }, { projectId: BigInt(projectId) });
    });
}

export var queueRulesetsAbi = [{
  type: 'function', name: 'queueRulesetsOf', stateMutability: 'nonpayable',
  inputs: [
    { name: 'projectId', type: 'uint256' },
    { name: 'rulesetConfigurations', type: 'tuple[]', components: [
      { name: 'mustStartAtOrAfter', type: 'uint48' },
      { name: 'duration', type: 'uint32' },
      { name: 'weight', type: 'uint112' },
      { name: 'weightCutPercent', type: 'uint32' },
      { name: 'approvalHook', type: 'address' },
      { name: 'metadata', type: 'tuple', components: [
        { name: 'reservedPercent', type: 'uint16' },
        { name: 'cashOutTaxRate', type: 'uint16' },
        { name: 'baseCurrency', type: 'uint32' },
        { name: 'pausePay', type: 'bool' },
        { name: 'pauseCreditTransfers', type: 'bool' },
        { name: 'allowOwnerMinting', type: 'bool' },
        { name: 'allowSetCustomToken', type: 'bool' },
        { name: 'allowTerminalMigration', type: 'bool' },
        { name: 'allowSetTerminals', type: 'bool' },
        { name: 'allowSetController', type: 'bool' },
        { name: 'allowAddAccountingContext', type: 'bool' },
        { name: 'allowAddPriceFeed', type: 'bool' },
        { name: 'ownerMustSendPayouts', type: 'bool' },
        { name: 'holdFees', type: 'bool' },
        { name: 'scopeCashOutsToLocalBalances', type: 'bool' },
        { name: 'useDataHookForPay', type: 'bool' },
        { name: 'useDataHookForCashOut', type: 'bool' },
        { name: 'dataHook', type: 'address' },
        { name: 'metadata', type: 'uint16' },
      ]},
      { name: 'splitGroups', type: 'tuple[]', components: [
        { name: 'groupId', type: 'uint256' },
        { name: 'splits', type: 'tuple[]', components: [
          // Canonical JBSplit field order — must match exactly or the tuple type changes the 4-byte selector
          // and every queue tx reverts (preferAddToBalance was wrongly at index 0).
          { name: 'percent', type: 'uint32' },
          { name: 'projectId', type: 'uint64' },
          { name: 'beneficiary', type: 'address' },
          { name: 'preferAddToBalance', type: 'bool' },
          { name: 'lockedUntil', type: 'uint48' },
          { name: 'hook', type: 'address' },
        ]},
      ]},
      { name: 'fundAccessLimitGroups', type: 'tuple[]', components: [
        { name: 'terminal', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'payoutLimits', type: 'tuple[]', components: [
          { name: 'amount', type: 'uint224' },
          { name: 'currency', type: 'uint32' },
        ]},
        { name: 'surplusAllowances', type: 'tuple[]', components: [
          { name: 'amount', type: 'uint224' },
          { name: 'currency', type: 'uint32' },
        ]},
      ]},
    ]},
    { name: 'memo', type: 'string' },
  ],
  outputs: [{ name: 'rulesetId', type: 'uint256' }],
}];

// Pure builder for JBController.queueRulesetsOf. `o`: { chainId, controllerAddr, projectId, rulesetConfigs
// (array of ruleset tuples, built by buildRulesetConfigs), memo }.
export function buildQueueRulesetsArgs(o) {
  return {
    chainId: o.chainId, address: o.controllerAddr, abi: queueRulesetsAbi, functionName: 'queueRulesetsOf',
    args: [BigInt(o.projectId), o.rulesetConfigs, o.memo || ''],
  };
}

export function renderQueueRulesetComponent() {
  var defaults = parseHashDefaults('queue-ruleset');

  var state = {
    phase: 'idle',
    projectId: defaults.projectId || '',
    liveChains: [],
    selectedChain: defaults.chain ? Number(defaults.chain) : null,
    network: defaults.network || 'mainnet',
    tokens: [],
    selectedToken: null,
    decimals: 18,
    rulesets: [createDefaultRuleset({ mustStartAtOrAfter: '0', weight: '' })],
    memo: '',
    error: null,
    txStatus: null,
    _defaultChain: defaults.chain ? Number(defaults.chain) : null,
  };

  var discoverProject = projectDiscovery(state, updateUI);

  var comp = createComponentWrapper('QUEUE RULESET', 'queue-ruleset', state, function() {
    var params = {};
    if (state.projectId) params.projectId = state.projectId;
    if (state.selectedChain) params.chain = state.selectedChain;
    if (state.network === 'testnet') params.network = 'testnet';
    return params;
  }, { permissionNote: 'Schedule new project rules. Requires the project owner or QUEUE_RULESETS permission.', wide: true });

  var wrapper = comp.wrapper;
  var body = comp.body;

  function updateUI() {
    body.innerHTML = '';
    body.appendChild(createProjectAndChainInput(state, scheduleDiscovery, function(cid) {
      if (cid === null) cid = firstChainForNetwork(state);
      if (cid) selectChain(state, cid);
      state.txStatus = null;
      updateUI();
    }));

    // Rulesets
    for (var ri = 0; ri < state.rulesets.length; ri++) {
      var rs = state.rulesets[ri];
      body.appendChild(renderRulesetFieldset(rs, ri, state, updateUI, {
        includeStartAt: true,
        weightHint: 'tokens per ' + (Number(rs.baseCurrency) === 2 ? 'USD' : 'ETH') + ', blank = inherit previous, 0 = no issuance',
        weightPlaceholder: 'inherit',
      }));
    }

    // Add ruleset button — queue another ruleset after this one.
    var addBtn = el('button', 'add-ruleset-btn');
    addBtn.type = 'button';
    addBtn.textContent = '+ ruleset';
    addBtn.addEventListener('click', function() {
      state.rulesets.push(createDefaultRuleset({ mustStartAtOrAfter: '0', weight: '' }));
      updateUI();
    });
    body.appendChild(addBtn);

    // Memo
    var memoSection = el('div', 'component-section');
    var memoLabel = el('label', 'input-label');
    memoLabel.innerHTML = 'note <span class="type-hint">optional</span>';
    memoSection.appendChild(memoLabel);
    var memoInput = el('input', 'field string-field optional-field');
    memoInput.type = 'text';
    memoInput.placeholder = 'Add a note (optional)';
    memoInput.value = state.memo;
    memoInput.addEventListener('input', function() { state.memo = memoInput.value; });
    memoSection.appendChild(memoInput);
    body.appendChild(memoSection);

    if (state.error) body.appendChild(renderError(state.error));
    if (state.txStatus) {
      var txDiv = el('div', state.txStatus.success ? 'tx-success' : 'component-status');
      txDiv.textContent = state.txStatus.message;
      body.appendChild(txDiv);
    }

    body.appendChild(createWalletButton('QUEUE RULESET', executeQueue, comp.permissionNote));
  }

  function scheduleDiscovery() {
    state.liveChains = [];
    state.selectedChain = null;
    state.error = null;
    state.txStatus = null;

    discoverProject(function (chainId) { selectChain(state, chainId); });
  }

  function executeQueue() {
    state.error = null;
    state.txStatus = null;

    if (!state.selectedChain || !state.projectId) {
      state.error = 'Select a project and chain'; updateUI(); return;
    }

    var controllerAddr = getAddress('JBController', state.selectedChain);
    if (!controllerAddr) { state.error = 'Juicebox contracts are unavailable on this chain'; updateUI(); return; }

    var rulesetConfigs;
    try {
      rulesetConfigs = buildRulesetConfigs(state.rulesets);
    } catch (err) {
      state.error = (err && err.message) || String(err); updateUI(); return;
    }

    var summaryRows = [
      ['Queues', rulesetConfigs.length + ' ruleset' + (rulesetConfigs.length === 1 ? '' : 's')],
      ['Project', '#' + String(state.projectId)],
      state.memo ? ['Memo', state.memo] : null,
    ].filter(Boolean);
    // Every row is known at the click, so the review opens with them; the exchange rate check still gates the send.
    var review = openPendingReview({ action: 'Queue rulesets', chain: chainNameFor(state.selectedChain), rows: summaryRows });
    if (review.closed) return;
    state.txStatus = { message: 'Checking the required exchange rates…', success: false };
    updateUI();
    verifyQueueFeedCoverage(state.selectedChain, state.projectId, rulesetConfigs).then(function() {
      if (review.closed) { state.txStatus = null; updateUI(); return; }
      executeTransaction({
        ...buildQueueRulesetsArgs({ chainId: state.selectedChain, controllerAddr: controllerAddr, projectId: state.projectId, rulesetConfigs: rulesetConfigs, memo: state.memo || '' }),
        confirmSummary: { action: 'Queue rulesets', rows: summaryRows },
        confirmSession: review,
        onStatus: function(msg) { state.txStatus = { message: msg, success: false }; updateUI(); },
        onSuccess: function(msg) { state.txStatus = { message: msg, success: true }; updateUI(); },
        onError: function(msg) { state.error = msg; state.txStatus = null; updateUI(); },
      });
    }, function(err) {
      state.error = (err && err.message) || String(err);
      state.txStatus = null;
      review.fail(state.error);
      updateUI();
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}
