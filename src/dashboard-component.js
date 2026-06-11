// src/dashboard-component.js
// Read-only dashboard showing project state
// Reads: current ruleset, total supply, pending reserved, terminal balance, surplus

import {
  el, createComponentWrapper, createProjectInput, createChainSelector,
  discoverChains, selectChain, firstChainForNetwork, executeRead, renderError,
  getAddress, getChainTokens, formatAmount, parseHashDefaults, NATIVE_TOKEN,
} from './component-base.js';

var currentRulesetAbi = [{
  type: 'function', name: 'currentRulesetOf', stateMutability: 'view',
  inputs: [{ name: 'projectId', type: 'uint256' }],
  outputs: [
    { name: 'ruleset', type: 'tuple', components: [
      { name: 'cycleNumber', type: 'uint256' },
      { name: 'id', type: 'uint256' },
      { name: 'basedOnId', type: 'uint256' },
      { name: 'start', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'weight', type: 'uint256' },
      { name: 'weightCutPercent', type: 'uint256' },
      { name: 'approvalHook', type: 'address' },
      { name: 'metadata', type: 'uint256' },
    ]},
    { name: 'metadata', type: 'tuple', components: [
      { name: 'reservedPercent', type: 'uint256' },
      { name: 'cashOutTaxRate', type: 'uint256' },
      { name: 'baseCurrency', type: 'uint256' },
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
      { name: 'metadata', type: 'uint256' },
    ]},
  ],
}];

var totalSupplyAbi = [{
  type: 'function', name: 'totalSupplyOf', stateMutability: 'view',
  inputs: [{ name: 'projectId', type: 'uint256' }],
  outputs: [{ name: '', type: 'uint256' }],
}];

var pendingReservedAbi = [{
  type: 'function', name: 'pendingReservedTokenBalanceOf', stateMutability: 'view',
  inputs: [{ name: 'projectId', type: 'uint256' }],
  outputs: [{ name: '', type: 'uint256' }],
}];

var currentSurplusAbi = [{
  type: 'function', name: 'currentSurplusOf', stateMutability: 'view',
  inputs: [
    { name: 'projectId', type: 'uint256' },
    { name: 'decimals', type: 'uint256' },
    { name: 'currency', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}];

export function renderDashboardComponent() {
  var defaults = parseHashDefaults('dashboard');

  var state = {
    phase: 'idle',
    projectId: defaults.projectId || '',
    liveChains: [],
    selectedChain: defaults.chain ? Number(defaults.chain) : null,
    network: defaults.network || 'mainnet',
    tokens: [],
    selectedToken: null,
    decimals: 18,
    data: null,
    loading: false,
    error: null,
    txStatus: null,
    _defaultChain: defaults.chain ? Number(defaults.chain) : null,
  };

  var discoveryGeneration = 0;

  var comp = createComponentWrapper('PROJECT DASHBOARD', 'dashboard', state, function() {
    var params = {};
    if (state.projectId) params.projectId = state.projectId;
    if (state.selectedChain) params.chain = state.selectedChain;
    if (state.network === 'testnet') params.network = 'testnet';
    return params;
  }, { permissionNote: 'Read-only. No wallet required.' });
  var wrapper = comp.wrapper;
  var body = comp.body;

  function updateUI() {
    body.innerHTML = '';
    body.appendChild(createProjectInput(state, scheduleDiscovery));

    if (state.phase === 'idle' || state.phase === 'discovering') {
      if (state.error) body.appendChild(renderError(state.error));
      return;
    }

    body.appendChild(createChainSelector(state, function(cid) {
      selectChain(state, cid);
      state.data = null;
      updateUI();
      loadDashboard();
    }));

    if (state.loading) {
      var loadEl = el('div', 'component-status component-discovering');
      loadEl.textContent = 'Loading project data...';
      body.appendChild(loadEl);
      return;
    }

    if (state.data) {
      var grid = el('div', 'dashboard-grid');

      // Ruleset info
      if (state.data.ruleset) {
        var rs = state.data.ruleset;
        var md = state.data.metadata;
        grid.appendChild(dashCard('Current Ruleset', [
          ['Cycle', '#' + rs.cycleNumber],
          ['Duration', rs.duration > 0 ? formatDuration(rs.duration) : 'Infinite'],
          ['Weight', formatAmount(rs.weight, 18)],
          ['Weight Cut', (Number(rs.weightCutPercent) / 10000000).toFixed(2) + '%'],
        ]));

        grid.appendChild(dashCard('Configuration', [
          ['Reserved %', (Number(md.reservedPercent) / 100).toFixed(2) + '%'],
          ['Cash Out Tax', (Number(md.cashOutTaxRate) / 100).toFixed(2) + '%'],
          ['Pay Paused', md.pausePay ? 'Yes' : 'No'],
          ['Owner Minting', md.allowOwnerMinting ? 'Allowed' : 'Disabled'],
        ]));
      }

      // Supply + reserved
      grid.appendChild(dashCard('Token Supply', [
        ['Total Supply', state.data.totalSupply !== null ? formatAmount(state.data.totalSupply, 18) : '-'],
        ['Pending Reserved', state.data.pendingReserved !== null ? formatAmount(state.data.pendingReserved, 18) : '-'],
      ]));

      // Surplus
      grid.appendChild(dashCard('Treasury', [
        ['Surplus (ETH)', state.data.surplus !== null ? formatAmount(state.data.surplus, 18) + ' ETH' : '-'],
      ]));

      body.appendChild(grid);
    }

    if (state.error) body.appendChild(renderError(state.error));

    // Permission note
    if (comp.permissionNote) {
      var note = el('div', 'component-permission-note');
      note.style.marginTop = '10px';
      note.textContent = comp.permissionNote;
      body.appendChild(note);
    }
  }

  function dashCard(title, rows) {
    var card = el('div', 'dashboard-card');
    var h = el('div', 'dashboard-card-title');
    h.textContent = title;
    card.appendChild(h);
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'preview-row');
      var lbl = el('span', 'preview-label');
      lbl.textContent = rows[i][0];
      row.appendChild(lbl);
      var val = el('span', 'preview-value');
      val.textContent = rows[i][1];
      row.appendChild(val);
      card.appendChild(row);
    }
    return card;
  }

  function formatDuration(secs) {
    var s = Number(secs);
    if (s >= 86400) return (s / 86400).toFixed(1) + ' days';
    if (s >= 3600) return (s / 3600).toFixed(1) + ' hours';
    return s + ' seconds';
  }

  function scheduleDiscovery() {
    state.liveChains = [];
    state.selectedChain = null;
    state.data = null;
    state.error = null;

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
      loadDashboard();
    });
  }

  function loadDashboard() {
    if (!state.selectedChain || !state.projectId) return;
    state.loading = true;
    updateUI();

    var controllerAddr = getAddress('JBController', state.selectedChain);
    var tokensAddr = getAddress('JBTokens', state.selectedChain);
    var storeAddr = getAddress('JBTerminalStore', state.selectedChain);
    var pid = BigInt(state.projectId);

    var data = { ruleset: null, metadata: null, totalSupply: null, pendingReserved: null, surplus: null };

    var promises = [];

    if (controllerAddr) {
      promises.push(
        executeRead({
          chainId: state.selectedChain,
          address: controllerAddr,
          abi: currentRulesetAbi,
          functionName: 'currentRulesetOf',
          args: [pid],
        }).then(function(result) {
          data.ruleset = result[0];
          data.metadata = result[1];
        }).catch(function() {})
      );

      promises.push(
        executeRead({
          chainId: state.selectedChain,
          address: controllerAddr,
          abi: pendingReservedAbi,
          functionName: 'pendingReservedTokenBalanceOf',
          args: [pid],
        }).then(function(result) {
          data.pendingReserved = result;
        }).catch(function() {})
      );
    }

    if (tokensAddr) {
      promises.push(
        executeRead({
          chainId: state.selectedChain,
          address: tokensAddr,
          abi: totalSupplyAbi,
          functionName: 'totalSupplyOf',
          args: [pid],
        }).then(function(result) {
          data.totalSupply = result;
        }).catch(function() {})
      );
    }

    if (storeAddr) {
      // Surplus in ETH terms (18 decimals, currency 1 = ETH)
      promises.push(
        executeRead({
          chainId: state.selectedChain,
          address: storeAddr,
          abi: currentSurplusAbi,
          functionName: 'currentSurplusOf',
          args: [pid, 18n, 1n],
        }).then(function(result) {
          data.surplus = result;
        }).catch(function() {})
      );
    }

    Promise.all(promises).then(function() {
      state.data = data;
      state.loading = false;
      updateUI();
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}
