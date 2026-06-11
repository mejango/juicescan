// src/queue-ruleset-component.js
// Queue Ruleset component — queues new rulesets for an existing project
// Flow: project ID -> chain -> ruleset config(s) -> execute

import {
  el, createComponentWrapper, createProjectAndChainInput,
  createWalletButton, discoverChains, selectChain, firstChainForNetwork,
  executeTransaction, renderError, getAddress, getChainTokens, parseHashDefaults,
} from './component-base.js';

var ZERO = '0x0000000000000000000000000000000000000000';

var queueRulesetsAbi = [{
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
        { name: 'useTotalSurplusForCashOuts', type: 'bool' },
        { name: 'useDataHookForPay', type: 'bool' },
        { name: 'useDataHookForCashOut', type: 'bool' },
        { name: 'dataHook', type: 'address' },
        { name: 'metadata', type: 'uint16' },
      ]},
      { name: 'splitGroups', type: 'tuple[]', components: [
        { name: 'groupId', type: 'uint256' },
        { name: 'splits', type: 'tuple[]', components: [
          { name: 'preferAddToBalance', type: 'bool' },
          { name: 'percent', type: 'uint32' },
          { name: 'projectId', type: 'uint64' },
          { name: 'beneficiary', type: 'address' },
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

var DURATION_PRESETS = [
  { label: 'None (no expiry)', seconds: 0 },
  { label: '1 day', seconds: 86400 },
  { label: '3 days', seconds: 259200 },
  { label: '7 days', seconds: 604800 },
  { label: '14 days', seconds: 1209600 },
  { label: '28 days', seconds: 2419200 },
  { label: '30 days', seconds: 2592000 },
  { label: '90 days', seconds: 7776000 },
  { label: '365 days', seconds: 31536000 },
  { label: 'Custom', seconds: -1 },
];

function createDefaultSplit() {
  return { preferAddToBalance: false, percent: '', projectId: '', beneficiary: '', lockedUntil: '', hook: '' };
}

function createDefaultSplitGroup() {
  return { groupId: '', splits: [createDefaultSplit()] };
}

function createDefaultPayoutLimit() {
  return { amount: '', currency: '' };
}

function createDefaultSurplusAllowance() {
  return { amount: '', currency: '' };
}

function createDefaultFundAccessLimitGroup() {
  return { terminal: '', token: '', payoutLimits: [createDefaultPayoutLimit()], surplusAllowances: [createDefaultSurplusAllowance()] };
}

function createDefaultRuleset() {
  return {
    mustStartAtOrAfter: '0',
    durationPreset: 0,
    durationCustom: '',
    weight: '1',
    weightCutPercent: 0,
    reservedPercent: 0,
    cashOutTaxRate: 0,
    baseCurrency: 1,
    // Flags
    pausePay: false,
    pauseCreditTransfers: false,
    allowOwnerMinting: false,
    allowSetCustomToken: true,
    allowTerminalMigration: false,
    allowSetTerminals: true,
    allowSetController: true,
    allowAddAccountingContext: true,
    allowAddPriceFeed: false,
    ownerMustSendPayouts: false,
    holdFees: false,
    useTotalSurplusForCashOuts: false,
    useDataHookForPay: false,
    useDataHookForCashOut: false,
    // Advanced
    approvalHook: '',
    dataHook: '',
    metadataExtra: '0',
    // Arrays
    splitGroups: [],
    fundAccessLimitGroups: [],
    // UI state
    flagsExpanded: false,
    splitsExpanded: false,
    fundAccessExpanded: false,
    advancedExpanded: false,
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
    rulesets: [createDefaultRuleset()],
    memo: '',
    error: null,
    txStatus: null,
    _defaultChain: defaults.chain ? Number(defaults.chain) : null,
  };

  var discoveryGeneration = 0;

  var comp = createComponentWrapper('QUEUE RULESET', 'queue-ruleset', state, function() {
    var params = {};
    if (state.projectId) params.projectId = state.projectId;
    if (state.selectedChain) params.chain = state.selectedChain;
    if (state.network === 'testnet') params.network = 'testnet';
    return params;
  }, { permissionNote: 'Requires project owner or QUEUE_RULESETS permission.', wide: true });

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
      body.appendChild(renderRulesetFieldset(state.rulesets[ri], ri, state, updateUI));
    }

    // Add ruleset button — queue another ruleset after this one.
    var addBtn = el('button', 'add-ruleset-btn');
    addBtn.type = 'button';
    addBtn.textContent = '+ ruleset';
    addBtn.addEventListener('click', function() {
      state.rulesets.push(createDefaultRuleset());
      updateUI();
    });
    body.appendChild(addBtn);

    // Memo
    var memoSection = el('div', 'component-section');
    var memoLabel = el('label', 'input-label');
    memoLabel.innerHTML = 'memo <span class="type-hint">optional</span>';
    memoSection.appendChild(memoLabel);
    var memoInput = el('input', 'field string-field optional-field');
    memoInput.type = 'text';
    memoInput.placeholder = 'Queue memo...';
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

    var pid = state.projectId;
    if (!pid || !/^\d+$/.test(pid) || pid === '0') { state.phase = 'idle'; updateUI(); return; }

    state.phase = 'discovering';
    updateUI();

    var gen = ++discoveryGeneration;
    discoverChains(pid, function(live) {
      if (gen !== discoveryGeneration) return;
      state.liveChains = live;
      var preferred = (state._defaultChain && live.indexOf(state._defaultChain) !== -1) ? state._defaultChain : firstChainForNetwork(state) || live[0];
      selectChain(state, preferred);
      state._defaultChain = null;
      state.phase = 'ready';
      updateUI();
    });
  }

  function executeQueue() {
    state.error = null;
    state.txStatus = null;

    if (!state.selectedChain || !state.projectId) {
      state.error = 'Select a project and chain'; updateUI(); return;
    }

    var controllerAddr = getAddress('JBController', state.selectedChain);
    if (!controllerAddr) { state.error = 'No controller address for this chain'; updateUI(); return; }

    var rulesetConfigs = [];
    for (var i = 0; i < state.rulesets.length; i++) {
      var rs = state.rulesets[i];
      var durationSeconds = getDurationSeconds(rs);
      var weightVal = rs.weight;
      var weightBig;
      if (Number(weightVal) <= 1) {
        weightBig = BigInt(weightVal || '0');
      } else {
        weightBig = BigInt(Math.floor(Number(weightVal) * 1e18));
      }

      rulesetConfigs.push({
        mustStartAtOrAfter: Number(rs.mustStartAtOrAfter) || 0,
        duration: durationSeconds,
        weight: weightBig,
        weightCutPercent: Math.round(rs.weightCutPercent * 10000000),
        approvalHook: (rs.approvalHook && /^0x[0-9a-fA-F]{40}$/.test(rs.approvalHook)) ? rs.approvalHook : ZERO,
        metadata: {
          reservedPercent: Math.round(rs.reservedPercent * 100),
          cashOutTaxRate: Math.round(rs.cashOutTaxRate * 100),
          baseCurrency: rs.baseCurrency,
          pausePay: rs.pausePay,
          pauseCreditTransfers: rs.pauseCreditTransfers,
          allowOwnerMinting: rs.allowOwnerMinting,
          allowSetCustomToken: rs.allowSetCustomToken,
          allowTerminalMigration: rs.allowTerminalMigration,
          allowSetTerminals: rs.allowSetTerminals,
          allowSetController: rs.allowSetController,
          allowAddAccountingContext: rs.allowAddAccountingContext,
          allowAddPriceFeed: rs.allowAddPriceFeed,
          ownerMustSendPayouts: rs.ownerMustSendPayouts,
          holdFees: rs.holdFees,
          useTotalSurplusForCashOuts: rs.useTotalSurplusForCashOuts,
          useDataHookForPay: rs.useDataHookForPay,
          useDataHookForCashOut: rs.useDataHookForCashOut,
          dataHook: (rs.dataHook && /^0x[0-9a-fA-F]{40}$/.test(rs.dataHook)) ? rs.dataHook : ZERO,
          metadata: Number(rs.metadataExtra) || 0,
        },
        splitGroups: buildSplitGroups(rs.splitGroups),
        fundAccessLimitGroups: buildFundAccessLimitGroups(rs.fundAccessLimitGroups),
      });
    }

    executeTransaction({
      chainId: state.selectedChain,
      address: controllerAddr,
      abi: queueRulesetsAbi,
      functionName: 'queueRulesetsOf',
      args: [BigInt(state.projectId), rulesetConfigs, state.memo || ''],
      onStatus: function(msg) { state.txStatus = { message: msg, success: false }; updateUI(); },
      onSuccess: function(msg) { state.txStatus = { message: msg, success: true }; updateUI(); },
      onError: function(msg) { state.error = msg; state.txStatus = null; updateUI(); },
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}

// --- Build split groups for tx ---

function buildSplitGroups(groups) {
  var result = [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (!g.groupId) continue;
    var splits = [];
    for (var j = 0; j < g.splits.length; j++) {
      var s = g.splits[j];
      if (!s.percent && !s.beneficiary && !s.projectId) continue;
      splits.push({
        preferAddToBalance: s.preferAddToBalance,
        percent: Number(s.percent) || 0,
        projectId: Number(s.projectId) || 0,
        beneficiary: (s.beneficiary && /^0x[0-9a-fA-F]{40}$/.test(s.beneficiary)) ? s.beneficiary : ZERO,
        lockedUntil: Number(s.lockedUntil) || 0,
        hook: (s.hook && /^0x[0-9a-fA-F]{40}$/.test(s.hook)) ? s.hook : ZERO,
      });
    }
    if (splits.length > 0) {
      result.push({ groupId: BigInt(g.groupId), splits: splits });
    }
  }
  return result;
}

// --- Build fund access limit groups for tx ---

function buildFundAccessLimitGroups(groups) {
  var result = [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (!g.terminal) continue;
    var payoutLimits = [];
    for (var j = 0; j < g.payoutLimits.length; j++) {
      var pl = g.payoutLimits[j];
      if (!pl.amount && pl.amount !== '0') continue;
      payoutLimits.push({
        amount: BigInt(pl.amount),
        currency: Number(pl.currency) || 0,
      });
    }
    var surplusAllowances = [];
    for (var k = 0; k < g.surplusAllowances.length; k++) {
      var sa = g.surplusAllowances[k];
      if (!sa.amount && sa.amount !== '0') continue;
      surplusAllowances.push({
        amount: BigInt(sa.amount),
        currency: Number(sa.currency) || 0,
      });
    }
    result.push({
      terminal: g.terminal,
      token: (g.token && /^0x[0-9a-fA-F]{40}$/.test(g.token)) ? g.token : ZERO,
      payoutLimits: payoutLimits,
      surplusAllowances: surplusAllowances,
    });
  }
  return result;
}

// --- Render a single ruleset fieldset ---

function renderRulesetFieldset(rs, index, state, updateUI) {
  var rsFieldset = el('div', 'config-fieldset');

  // Header — #N index, with remove for non-first rulesets
  var header = el('div', 'ruleset-header');
  var rsTitle = el('span', 'nested-index');
  rsTitle.textContent = '#' + (index + 1);
  header.appendChild(rsTitle);
  if (index > 0) {
    var removeBtn = el('button', 'ruleset-remove');
    removeBtn.type = 'button';
    removeBtn.textContent = 'remove';
    removeBtn.addEventListener('click', function() {
      state.rulesets.splice(index, 1);
      updateUI();
    });
    header.appendChild(removeBtn);
  }
  rsFieldset.appendChild(header);

  // --- Primary fields (always visible) ---

  // Start at or after
  rsFieldset.appendChild(configRow('start at or after', 'unix timestamp, 0 = now', rs, 'mustStartAtOrAfter'));

  // Duration dropdown
  rsFieldset.appendChild(durationRow(rs, updateUI));

  // Base currency pills
  rsFieldset.appendChild(currencyPills(rs, updateUI));

  // Weight (issuance — 1 = inherit previous for queue)
  rsFieldset.appendChild(
    configRow('issuance rate', 'tokens per ' + baseCurrencyLabel(rs) + ', 1 = inherit previous, 0 = no issuance', rs, 'weight', '1')
  );

  // Weight cut % (slider 0-100%)
  rsFieldset.appendChild(percentSlider('decay rate', rs, 'weightCutPercent', 100));

  // Reserved % (slider 0-100%)
  rsFieldset.appendChild(percentSlider('reserved rate', rs, 'reservedPercent', 100));

  // Cash out tax (slider 0-100%)
  rsFieldset.appendChild(percentSlider('cash out tax rate', rs, 'cashOutTaxRate', 100));

  // --- Splits (collapsible) ---
  rsFieldset.appendChild(collapsibleSection('\u25B8 Splits', '\u25BE Splits', rs, 'splitsExpanded', updateUI, function() {
    return renderSplitGroupsEditor(rs, updateUI);
  }));

  // --- Fund Access Limits (collapsible) ---
  rsFieldset.appendChild(collapsibleSection('\u25B8 Fund Access Limits', '\u25BE Fund Access Limits', rs, 'fundAccessExpanded', updateUI, function() {
    return renderFundAccessEditor(rs, updateUI);
  }));

  // --- Flags (collapsible) ---
  rsFieldset.appendChild(collapsibleSection('\u25B8 Flags', '\u25BE Flags', rs, 'flagsExpanded', updateUI, function() {
    var wrap = el('div', '');
    wrap.appendChild(configCheckbox('Pause payments', rs, 'pausePay'));
    wrap.appendChild(configCheckbox('Pause credit transfers', rs, 'pauseCreditTransfers'));
    wrap.appendChild(configCheckbox('Allow owner minting', rs, 'allowOwnerMinting'));
    wrap.appendChild(configCheckbox('Allow set custom token', rs, 'allowSetCustomToken'));
    wrap.appendChild(configCheckbox('Allow terminal migration', rs, 'allowTerminalMigration'));
    wrap.appendChild(configCheckbox('Allow set terminals', rs, 'allowSetTerminals'));
    wrap.appendChild(configCheckbox('Allow set controller', rs, 'allowSetController'));
    wrap.appendChild(configCheckbox('Allow add accounting context', rs, 'allowAddAccountingContext'));
    wrap.appendChild(configCheckbox('Allow add price feed', rs, 'allowAddPriceFeed'));
    wrap.appendChild(configCheckbox('Owner must send payouts', rs, 'ownerMustSendPayouts'));
    wrap.appendChild(configCheckbox('Hold fees', rs, 'holdFees'));
    wrap.appendChild(configCheckbox('Use total surplus for cash outs', rs, 'useTotalSurplusForCashOuts'));
    wrap.appendChild(configCheckbox('Use data hook for pay', rs, 'useDataHookForPay'));
    wrap.appendChild(configCheckbox('Use data hook for cash out', rs, 'useDataHookForCashOut'));
    return wrap;
  }));

  // --- Advanced (collapsible) ---
  rsFieldset.appendChild(collapsibleSection('\u25B8 Advanced', '\u25BE Advanced', rs, 'advancedExpanded', updateUI, function() {
    var wrap = el('div', '');
    wrap.appendChild(addressRow('approval hook', rs, 'approvalHook'));
    wrap.appendChild(addressRow('data hook', rs, 'dataHook'));
    wrap.appendChild(configRow('metadata (uint16)', 'extra metadata bits', rs, 'metadataExtra', '0'));
    return wrap;
  }));

  return rsFieldset;
}

// --- Collapsible section helper ---

function collapsibleSection(collapsedLabel, expandedLabel, rs, key, updateUI, renderContent) {
  var wrap = el('div', '');
  var toggle = el('div', 'config-fieldset-title');
  toggle.style.cursor = 'pointer';
  toggle.style.marginTop = '8px';
  toggle.textContent = rs[key] ? expandedLabel : collapsedLabel;
  toggle.addEventListener('click', function() {
    rs[key] = !rs[key];
    updateUI();
  });
  wrap.appendChild(toggle);
  if (rs[key]) {
    wrap.appendChild(renderContent());
  }
  return wrap;
}

// --- Split groups editor ---

function renderSplitGroupsEditor(rs, updateUI) {
  var wrap = el('div', 'nested-editor');

  for (var gi = 0; gi < rs.splitGroups.length; gi++) {
    (function(gIdx) {
      var group = rs.splitGroups[gIdx];
      var groupEl = el('div', 'nested-group');

      var groupHeader = el('div', 'nested-group-header');
      var groupTitle = el('span', 'nested-index');
      groupTitle.textContent = '#' + (gIdx + 1);
      groupHeader.appendChild(groupTitle);
      var removeGroupBtn = el('button', 'ruleset-remove');
      removeGroupBtn.type = 'button';
      removeGroupBtn.textContent = 'remove';
      removeGroupBtn.addEventListener('click', function() {
        rs.splitGroups.splice(gIdx, 1);
        updateUI();
      });
      groupHeader.appendChild(removeGroupBtn);
      groupEl.appendChild(groupHeader);

      groupEl.appendChild(configRow('group ID', 'uint256 (token address as number)', group, 'groupId'));

      // Splits within group
      for (var si = 0; si < group.splits.length; si++) {
        (function(sIdx) {
          var split = group.splits[sIdx];
          var splitEl = el('div', 'nested-item');

          var splitHeader = el('div', 'nested-item-header');
          var splitTitle = el('span', 'nested-index');
          splitTitle.textContent = '#' + (sIdx + 1);
          splitHeader.appendChild(splitTitle);
          if (group.splits.length > 1) {
            var removeSplitBtn = el('button', 'ruleset-remove');
            removeSplitBtn.type = 'button';
            removeSplitBtn.textContent = 'x';
            removeSplitBtn.addEventListener('click', function() {
              group.splits.splice(sIdx, 1);
              updateUI();
            });
            splitHeader.appendChild(removeSplitBtn);
          }
          splitEl.appendChild(splitHeader);

          splitEl.appendChild(splitPercentRow(split));
          splitEl.appendChild(addressRow('beneficiary', split, 'beneficiary'));
          splitEl.appendChild(configRow('project ID', 'optional, routes to project', split, 'projectId'));
          splitEl.appendChild(lockedUntilRow(split));
          splitEl.appendChild(addressRow('hook', split, 'hook'));
          splitEl.appendChild(configCheckbox('Prefer add to balance', split, 'preferAddToBalance'));

          groupEl.appendChild(splitEl);
        })(si);
      }

      var addSplitBtn = el('button', 'add-nested-btn');
      addSplitBtn.type = 'button';
      addSplitBtn.textContent = '+ split';
      addSplitBtn.addEventListener('click', function() {
        group.splits.push(createDefaultSplit());
        updateUI();
      });
      groupEl.appendChild(addSplitBtn);

      wrap.appendChild(groupEl);
    })(gi);
  }

  var addGroupBtn = el('button', 'add-nested-btn');
  addGroupBtn.type = 'button';
  addGroupBtn.textContent = '+ Add split group';
  addGroupBtn.addEventListener('click', function() {
    rs.splitGroups.push(createDefaultSplitGroup());
    updateUI();
  });
  wrap.appendChild(addGroupBtn);

  return wrap;
}

// --- Fund access limit groups editor ---

function renderFundAccessEditor(rs, updateUI) {
  var wrap = el('div', 'nested-editor');

  for (var gi = 0; gi < rs.fundAccessLimitGroups.length; gi++) {
    (function(gIdx) {
      var group = rs.fundAccessLimitGroups[gIdx];
      var groupEl = el('div', 'nested-group');

      var groupHeader = el('div', 'nested-group-header');
      var groupTitle = el('span', 'nested-index');
      groupTitle.textContent = '#' + (gIdx + 1);
      groupHeader.appendChild(groupTitle);
      var removeGroupBtn = el('button', 'ruleset-remove');
      removeGroupBtn.type = 'button';
      removeGroupBtn.textContent = 'remove';
      removeGroupBtn.addEventListener('click', function() {
        rs.fundAccessLimitGroups.splice(gIdx, 1);
        updateUI();
      });
      groupHeader.appendChild(removeGroupBtn);
      groupEl.appendChild(groupHeader);

      groupEl.appendChild(addressRow('terminal', group, 'terminal'));
      groupEl.appendChild(addressRow('token', group, 'token'));

      // Payout limits
      var plTitle = el('div', 'type-hint');
      plTitle.textContent = 'Payout Limits';
      plTitle.style.marginTop = '6px';
      plTitle.style.marginBottom = '4px';
      plTitle.style.fontWeight = 'bold';
      groupEl.appendChild(plTitle);

      for (var pi = 0; pi < group.payoutLimits.length; pi++) {
        (function(pIdx) {
          var pl = group.payoutLimits[pIdx];
          var plEl = el('div', 'nested-item');
          var plHeader = el('div', 'nested-item-header');
          var plLabel = el('span', 'nested-index');
          plLabel.textContent = '#' + (pIdx + 1);
          plHeader.appendChild(plLabel);
          if (group.payoutLimits.length > 1) {
            var removePlBtn = el('button', 'ruleset-remove');
            removePlBtn.type = 'button';
            removePlBtn.textContent = 'x';
            removePlBtn.addEventListener('click', function() {
              group.payoutLimits.splice(pIdx, 1);
              updateUI();
            });
            plHeader.appendChild(removePlBtn);
          }
          plEl.appendChild(plHeader);
          plEl.appendChild(configRow('amount', 'uint224 (use max for unlimited)', pl, 'amount'));
          plEl.appendChild(configRow('currency', 'uint32', pl, 'currency'));
          groupEl.appendChild(plEl);
        })(pi);
      }

      var addPlBtn = el('button', 'add-nested-btn');
      addPlBtn.type = 'button';
      addPlBtn.textContent = '+ payout limit';
      addPlBtn.addEventListener('click', function() {
        group.payoutLimits.push(createDefaultPayoutLimit());
        updateUI();
      });
      groupEl.appendChild(addPlBtn);

      // Surplus allowances
      var saTitle = el('div', 'type-hint');
      saTitle.textContent = 'Surplus Allowances';
      saTitle.style.marginTop = '6px';
      saTitle.style.marginBottom = '4px';
      saTitle.style.fontWeight = 'bold';
      groupEl.appendChild(saTitle);

      for (var si = 0; si < group.surplusAllowances.length; si++) {
        (function(sIdx) {
          var sa = group.surplusAllowances[sIdx];
          var saEl = el('div', 'nested-item');
          var saHeader = el('div', 'nested-item-header');
          var saLabel = el('span', 'nested-index');
          saLabel.textContent = '#' + (sIdx + 1);
          saHeader.appendChild(saLabel);
          if (group.surplusAllowances.length > 1) {
            var removeSaBtn = el('button', 'ruleset-remove');
            removeSaBtn.type = 'button';
            removeSaBtn.textContent = 'x';
            removeSaBtn.addEventListener('click', function() {
              group.surplusAllowances.splice(sIdx, 1);
              updateUI();
            });
            saHeader.appendChild(removeSaBtn);
          }
          saEl.appendChild(saHeader);
          saEl.appendChild(configRow('amount', 'uint224', sa, 'amount'));
          saEl.appendChild(configRow('currency', 'uint32', sa, 'currency'));
          groupEl.appendChild(saEl);
        })(si);
      }

      var addSaBtn = el('button', 'add-nested-btn');
      addSaBtn.type = 'button';
      addSaBtn.textContent = '+ surplus allowance';
      addSaBtn.addEventListener('click', function() {
        group.surplusAllowances.push(createDefaultSurplusAllowance());
        updateUI();
      });
      groupEl.appendChild(addSaBtn);

      wrap.appendChild(groupEl);
    })(gi);
  }

  var addGroupBtn = el('button', 'add-nested-btn');
  addGroupBtn.type = 'button';
  addGroupBtn.textContent = '+ Add fund access limit group';
  addGroupBtn.addEventListener('click', function() {
    rs.fundAccessLimitGroups.push(createDefaultFundAccessLimitGroup());
    updateUI();
  });
  wrap.appendChild(addGroupBtn);

  return wrap;
}

// --- Shared form helpers ---

function getDurationSeconds(rs) {
  if (rs.durationPreset === -1) return Number(rs.durationCustom) || 0;
  return rs.durationPreset;
}

function durationRow(rs, updateUI) {
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  lbl.textContent = 'duration';
  row.appendChild(lbl);
  var sel = el('select', 'field');
  sel.style.maxWidth = '180px';
  for (var i = 0; i < DURATION_PRESETS.length; i++) {
    var opt = document.createElement('option');
    opt.value = DURATION_PRESETS[i].seconds;
    opt.textContent = DURATION_PRESETS[i].label;
    if (rs.durationPreset === DURATION_PRESETS[i].seconds) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', function() {
    rs.durationPreset = Number(sel.value);
    updateUI();
  });
  row.appendChild(sel);
  if (rs.durationPreset === -1) {
    var custom = el('input', 'field numeric-field');
    custom.type = 'text';
    custom.placeholder = 'seconds';
    custom.value = rs.durationCustom;
    custom.style.maxWidth = '100px';
    custom.addEventListener('input', function() { rs.durationCustom = custom.value.trim(); });
    row.appendChild(custom);
  }
  return row;
}

// Locked-until field — internal `lockedUntil` is a unix timestamp (seconds).
// The UI shows a `datetime-local` picker (the browser handles the local time
// zone) and a hint with the user's resolved IANA timezone.
function lockedUntilRow(split) {
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  var tz;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch (_) { tz = 'local'; }
  lbl.innerHTML = 'locked until <span class="type-hint">' + tz + '</span>';
  row.appendChild(lbl);

  var input = el('input', 'field datetime-field');
  input.type = 'datetime-local';

  function tsToLocalInput(ts) {
    var n = Number(ts || 0);
    if (!n) return '';
    var d = new Date(n * 1000);
    if (isNaN(d.getTime())) return '';
    var pad = function(x) { return x < 10 ? '0' + x : '' + x; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  input.value = tsToLocalInput(split.lockedUntil);
  input.addEventListener('input', function() {
    if (!input.value) { split.lockedUntil = 0; return; }
    var d = new Date(input.value);
    split.lockedUntil = isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
  });

  row.appendChild(input);

  var clearLink = document.createElement('a');
  clearLink.className = 'datetime-clear';
  clearLink.href = '#';
  clearLink.textContent = 'clear';
  clearLink.addEventListener('click', function(e) {
    e.preventDefault();
    split.lockedUntil = 0;
    input.value = '';
  });
  row.appendChild(clearLink);

  return row;
}

// Split percent slider — internal split value is raw out of 1,000,000,000
// (SPLITS_TOTAL_PERCENT). The slider shows it as 0–100% with two decimals.
function splitPercentRow(split) {
  var SPLITS_MAX = 1000000000;
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  lbl.innerHTML = 'percent <span class="type-hint">share of group</span>';
  row.appendChild(lbl);
  var slider = el('input', 'config-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '0.5';
  var currentPct = (Number(split.percent || 0) / SPLITS_MAX) * 100;
  slider.value = currentPct;
  var valInput = el('input', 'config-slider-input');
  valInput.type = 'text';
  valInput.value = (Math.round(currentPct * 100) / 100).toString();
  var suffix = el('span', 'config-percent-suffix');
  suffix.textContent = '%';
  function commit(pct) {
    var raw = Math.round((pct / 100) * SPLITS_MAX);
    if (raw < 0) raw = 0;
    if (raw > SPLITS_MAX) raw = SPLITS_MAX;
    split.percent = raw;
  }
  slider.addEventListener('input', function() {
    var pct = Number(slider.value);
    commit(pct);
    valInput.value = (Math.round(pct * 100) / 100).toString();
  });
  valInput.addEventListener('input', function() {
    var v = parseFloat(valInput.value);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      commit(v);
      slider.value = String(v);
    }
  });
  valInput.addEventListener('blur', function() {
    var pct = (Number(split.percent || 0) / SPLITS_MAX) * 100;
    valInput.value = (Math.round(pct * 100) / 100).toString();
  });
  row.appendChild(slider);
  row.appendChild(valInput);
  row.appendChild(suffix);
  return row;
}

function percentSlider(label, rs, key, max) {
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  lbl.textContent = label;
  row.appendChild(lbl);
  var slider = el('input', 'config-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(max);
  slider.step = '0.5';
  slider.value = rs[key];
  var valInput = el('input', 'config-slider-input');
  valInput.type = 'text';
  valInput.value = rs[key];
  var suffix = el('span', 'config-percent-suffix');
  suffix.textContent = '%';
  slider.addEventListener('input', function() {
    rs[key] = Number(slider.value);
    valInput.value = slider.value;
  });
  valInput.addEventListener('input', function() {
    var v = parseFloat(valInput.value);
    if (!isNaN(v) && v >= 0 && v <= max) {
      rs[key] = v;
      slider.value = v;
    }
  });
  valInput.addEventListener('blur', function() {
    valInput.value = rs[key];
  });
  row.appendChild(slider);
  row.appendChild(valInput);
  row.appendChild(suffix);
  return row;
}

function currencyPills(rs, updateUI) {
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  lbl.textContent = 'base currency';
  row.appendChild(lbl);
  var pills = el('div', 'currency-pills');
  var opts = [{ val: 1, label: 'ETH' }, { val: 2, label: 'USD' }];
  for (var i = 0; i < opts.length; i++) {
    (function(o) {
      var pill = el('button', 'pill' + (rs.baseCurrency === o.val ? ' selected' : ''));
      pill.type = 'button';
      pill.textContent = o.label;
      pill.addEventListener('click', function() { rs.baseCurrency = o.val; updateUI(); });
      pills.appendChild(pill);
    })(opts[i]);
  }
  row.appendChild(pills);
  return row;
}

function baseCurrencyLabel(rs) {
  return Number(rs.baseCurrency) === 2 ? 'USD' : 'ETH';
}

function configRow(label, hint, st, key, placeholder) {
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  lbl.innerHTML = label + ' <span class="type-hint">' + hint + '</span>';
  row.appendChild(lbl);
  var input = el('input', 'field numeric-field' + (/optional/i.test(hint || '') ? ' optional-field' : ''));
  input.type = 'text';
  input.placeholder = placeholder || '0';
  input.value = st[key];
  input.addEventListener('input', function() { st[key] = input.value.trim(); });
  row.appendChild(input);
  return row;
}

function addressRow(label, st, key) {
  var row = el('div', 'config-row');
  var lbl = el('label', 'input-label');
  lbl.textContent = label;
  row.appendChild(lbl);
  var input = el('input', 'field address-field');
  input.type = 'text';
  input.placeholder = '0x0000...0000';
  input.value = st[key];
  input.addEventListener('input', function() { st[key] = input.value.trim(); });
  row.appendChild(input);
  return row;
}

function configCheckbox(label, st, key) {
  var row = el('label', 'config-row-checkbox');
  var cb = el('input', '');
  cb.type = 'checkbox';
  cb.checked = st[key];
  cb.addEventListener('change', function() { st[key] = cb.checked; });
  row.appendChild(cb);
  row.appendChild(document.createTextNode(label));
  return row;
}
