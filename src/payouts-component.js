// src/payouts-component.js
// Send Payouts component
// Flow: Project ID -> chain -> token -> amount -> execute

import {
  el, createComponentWrapper, createProjectAndChainInput,
  createWalletButton, discoverChains, selectChain, firstChainForNetwork,
  executeTransaction, renderError, getAddress,
  getChainTokens, parseAmount, parseHashDefaults,
} from './component-base.js';

var sendPayoutsAbi = [{
  type: 'function', name: 'sendPayoutsOf', stateMutability: 'nonpayable',
  inputs: [
    { name: 'projectId', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'currency', type: 'uint32' },
    { name: 'minTokensPaidOut', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}];

export function renderPayoutsComponent() {
  var defaults = parseHashDefaults('payouts');

  var state = {
    phase: 'idle',
    projectId: defaults.projectId || '',
    liveChains: [],
    selectedChain: defaults.chain ? Number(defaults.chain) : 1,
    network: defaults.network || 'mainnet',
    tokens: getChainTokens(defaults.chain ? Number(defaults.chain) : 1),
    selectedToken: getChainTokens(defaults.chain ? Number(defaults.chain) : 1)[0] || null,
    decimals: 18,
    amount: defaults.amount || '',
    error: null,
    txStatus: null,
    _defaultChain: defaults.chain ? Number(defaults.chain) : null,
  };

  var discoveryGeneration = 0;

  var comp = createComponentWrapper('SEND PAYOUTS', 'payouts', state, function() {
    var params = {};
    if (state.projectId) params.projectId = state.projectId;
    if (state.selectedChain) params.chain = state.selectedChain;
    if (state.selectedToken) params.token = state.selectedToken.address;
    if (state.amount) params.amount = state.amount;
    if (state.network === 'testnet') params.network = 'testnet';
    return params;
  }, { permissionNote: 'Permissionless unless ruleset has ownerMustSendPayouts enabled.' });
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


    // Token selector
    var tokenSection = el('div', 'component-section');
    var tokenLabel = el('label', 'input-label');
    tokenLabel.textContent = 'token';
    tokenSection.appendChild(tokenLabel);
    if (state.tokens.length > 0) {
      var tokenSelect = el('select', 'field');
      tokenSelect.style.maxWidth = '320px';
      for (var t = 0; t < state.tokens.length; t++) {
        var opt = document.createElement('option');
        opt.value = state.tokens[t].address;
        opt.textContent = state.tokens[t].symbol;
        if (state.selectedToken && state.selectedToken.address.toLowerCase() === state.tokens[t].address.toLowerCase()) {
          opt.selected = true;
        }
        tokenSelect.appendChild(opt);
      }
      tokenSelect.addEventListener('change', function() {
        var addr = tokenSelect.value;
        for (var ti = 0; ti < state.tokens.length; ti++) {
          if (state.tokens[ti].address === addr) {
            state.selectedToken = state.tokens[ti];
            state.decimals = state.tokens[ti].decimals || 18;
            break;
          }
        }
      });
      tokenSection.appendChild(tokenSelect);
    }
    body.appendChild(tokenSection);

    // Amount
    var amtSection = el('div', 'component-section');
    var amtLabel = el('label', 'input-label');
    amtLabel.innerHTML = 'amount <span class="type-hint">' + state.decimals + ' decimals</span>';
    amtSection.appendChild(amtLabel);
    var amtInput = el('input', 'field numeric-field');
    amtInput.type = 'text';
    amtInput.placeholder = '1.0';
    amtInput.value = state.amount;
    amtInput.addEventListener('input', function() { state.amount = amtInput.value.trim(); });
    amtSection.appendChild(amtInput);
    body.appendChild(amtSection);

    if (state.error) body.appendChild(renderError(state.error));
    if (state.txStatus) {
      var txDiv = el('div', state.txStatus.success ? 'tx-success' : 'component-status');
      txDiv.textContent = state.txStatus.message;
      body.appendChild(txDiv);
    }

    body.appendChild(createWalletButton('SEND PAYOUTS', executeSendPayouts, comp.permissionNote));
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

  function executeSendPayouts() {
    state.error = null;
    state.txStatus = null;

    if (!state.selectedChain || !state.projectId) {
      state.error = 'Select a project and chain'; updateUI(); return;
    }
    if (!state.selectedToken) { state.error = 'Select a token'; updateUI(); return; }
    if (!state.amount) { state.error = 'Enter an amount'; updateUI(); return; }

    var amountParsed;
    try { amountParsed = parseAmount(state.amount, state.decimals); } catch (_) {
      state.error = 'Invalid amount'; updateUI(); return;
    }

    var terminalAddr = getAddress('JBMultiTerminal', state.selectedChain);
    if (!terminalAddr) { state.error = 'No terminal address for this chain'; updateUI(); return; }

    // currency = uint32(uint160(token))
    var tokenAddr = state.selectedToken.address;
    var currency = Number(BigInt(tokenAddr) & 0xFFFFFFFFn);

    executeTransaction({
      chainId: state.selectedChain,
      address: terminalAddr,
      abi: sendPayoutsAbi,
      functionName: 'sendPayoutsOf',
      args: [BigInt(state.projectId), tokenAddr, amountParsed, currency, 0n],
      onStatus: function(msg) { state.txStatus = { message: msg, success: false }; updateUI(); },
      onSuccess: function(msg) { state.txStatus = { message: msg, success: true }; updateUI(); },
      onError: function(msg) { state.error = msg; state.txStatus = null; updateUI(); },
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}
