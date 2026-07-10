// src/payouts-component.js
// Send Payouts component
// Flow: Project ID -> chain -> token -> amount -> execute

import {
  el, createComponentWrapper, createProjectAndChainInput,
  createWalletButton, discoverChains, selectChain, firstChainForNetwork,
  executeTransaction, renderError, getAddress,
  getChainTokens, parseAmount, parseHashDefaults,
} from './component-base.js';

export var sendPayoutsAbi = [{
  type: 'function', name: 'sendPayoutsOf', stateMutability: 'nonpayable',
  inputs: [
    { name: 'projectId', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'currency', type: 'uint256' }, // JBCurrencyIds is uint256 on-chain — uint32 here changed the selector → tx reverted
    { name: 'minTokensPaidOut', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}];

// Pure builder for JBMultiTerminal.sendPayoutsOf. `o`: { chainId, terminalAddr, projectId, token, amount
// (bigint), currency (the project's payout-limit currency id), minPaidOut (bigint) }.
export function buildSendPayoutsArgs(o) {
  return {
    chainId: o.chainId, address: o.terminalAddr, abi: sendPayoutsAbi, functionName: 'sendPayoutsOf',
    args: [BigInt(o.projectId), o.token, o.amount, BigInt(o.currency), o.minPaidOut || 0n],
  };
}

export function tokenCurrencyId(tokenAddr) {
  try { return BigInt(tokenAddr) & 0xFFFFFFFFn; } catch (_) { return null; }
}

export function parsePayoutCurrencyId(value) {
  try {
    if (value == null || String(value).trim() === '') return null;
    var currency = BigInt(String(value).trim());
    return currency >= 0n ? currency : null;
  } catch (_) {
    return null;
  }
}

export function payoutCurrencyIdForSelection(mode, customCurrency, tokenAddr) {
  if (mode === 'eth') return 1n;
  if (mode === 'usd') return 2n;
  if (mode === 'custom') return parsePayoutCurrencyId(customCurrency);
  return tokenCurrencyId(tokenAddr);
}

// sendPayoutsOf's `amount` is denominated in the SELECTED payout-limit currency, so it must be parsed in that
// currency's fixed-point decimals — NOT the token's transfer decimals. A token-accounting-context currency
// ('token' mode) uses the token's own decimals; the standard JB currencies ETH(1)/USD(2) are 18-dec. A custom
// id isn't decimal-derivable, so assume the 18-dec JB standard (the amount hint states this). Parsing on the
// token decimals for a non-token currency mis-scales — e.g. USD on a 6-dec USDC token is a 1e12 under-scale.
export function payoutAmountDecimals(mode, tokenDecimals) {
  return mode === 'token' ? (tokenDecimals || 18) : 18;
}

function initialCurrencyMode(defaultCurrency) {
  if (defaultCurrency === '1' || defaultCurrency === 'eth') return 'eth';
  if (defaultCurrency === '2' || defaultCurrency === 'usd') return 'usd';
  if (defaultCurrency && defaultCurrency !== 'token') return 'custom';
  return 'token';
}

function tokenByAddress(tokens, addr) {
  if (!addr) return null;
  var lower = String(addr).toLowerCase();
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].address && tokens[i].address.toLowerCase() === lower) return tokens[i];
  }
  return null;
}

export function renderPayoutsComponent() {
  var defaults = parseHashDefaults('payouts');
  var initialChain = defaults.chain ? Number(defaults.chain) : 1;
  var initialTokens = getChainTokens(initialChain);
  var initialToken = tokenByAddress(initialTokens, defaults.token) || initialTokens[0] || null;

  var state = {
    phase: 'idle',
    projectId: defaults.projectId || '',
    liveChains: [],
    selectedChain: initialChain,
    network: defaults.network || 'mainnet',
    tokens: initialTokens,
    selectedToken: initialToken,
    decimals: initialToken ? (initialToken.decimals || 18) : 18,
    amount: defaults.amount || '',
    currencyMode: initialCurrencyMode(defaults.currency),
    customCurrency: defaults.currency && !/^(token|eth|usd|1|2)$/.test(defaults.currency) ? defaults.currency : '',
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
    if (state.currencyMode === 'custom' && state.customCurrency) params.currency = state.customCurrency;
    else if (state.currencyMode && state.currencyMode !== 'token') params.currency = state.currencyMode;
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
        updateUI();
      });
      tokenSection.appendChild(tokenSelect);
    }
    body.appendChild(tokenSection);

    // Amount
    var amtSection = el('div', 'component-section');
    var amtLabel = el('label', 'input-label');
    amtLabel.innerHTML = 'amount <span class="type-hint">' + payoutAmountDecimals(state.currencyMode, state.decimals) + ' decimals</span>';
    amtSection.appendChild(amtLabel);
    var amtInput = el('input', 'field numeric-field');
    amtInput.type = 'text';
    amtInput.placeholder = '1.0';
    amtInput.value = state.amount;
    amtInput.addEventListener('input', function() { state.amount = amtInput.value.trim(); });
    amtSection.appendChild(amtInput);
    body.appendChild(amtSection);

    // Payout limit currency
    var curSection = el('div', 'component-section');
    var curLabel = el('label', 'input-label');
    curLabel.textContent = 'payout limit currency';
    curSection.appendChild(curLabel);
    var curSelect = el('select', 'field');
    curSelect.style.maxWidth = '320px';
    var tokenCurrency = state.selectedToken ? tokenCurrencyId(state.selectedToken.address) : null;
    var options = [
      { value: 'token', label: state.selectedToken ? ('Token currency (' + String(tokenCurrency) + ')') : 'Token currency' },
      { value: 'eth', label: 'ETH (1)' },
      { value: 'usd', label: 'USD (2)' },
      { value: 'custom', label: 'Custom id' },
    ];
    for (var ci = 0; ci < options.length; ci++) {
      var copt = document.createElement('option');
      copt.value = options[ci].value;
      copt.textContent = options[ci].label;
      if (state.currencyMode === options[ci].value) copt.selected = true;
      curSelect.appendChild(copt);
    }
    curSelect.addEventListener('change', function() {
      state.currencyMode = curSelect.value;
      updateUI();
    });
    curSection.appendChild(curSelect);
    if (state.currencyMode === 'custom') {
      var customInput = el('input', 'field numeric-field');
      customInput.type = 'text';
      customInput.placeholder = '1';
      customInput.value = state.customCurrency;
      customInput.addEventListener('input', function() { state.customCurrency = customInput.value.trim(); });
      curSection.appendChild(customInput);
    }
    // The amount is parsed in the selected currency's decimals — spell out the non-token scale so a 6-dec token
    // paired with an 18-dec ETH/USD/custom limit doesn't get silently mis-scaled.
    if (state.currencyMode !== 'token') {
      var curHint = el('div');
      curHint.style.fontSize = '12px'; curHint.style.color = 'var(--muted)'; curHint.style.marginTop = '4px';
      curHint.textContent = state.currencyMode === 'eth' ? 'Amount is in ETH (18 decimals), converted to the token at the on-chain price.'
        : state.currencyMode === 'usd' ? 'Amount is in USD (18 decimals), converted to the token at the on-chain price.'
        : 'Amount is in this currency’s units — 18 decimals assumed (the JB standard). If your id is a token accounting context with different decimals, enter the raw-scaled value accordingly.';
      curSection.appendChild(curHint);
    }
    body.appendChild(curSection);

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
    // Parse in the SELECTED currency's decimals, not the token's transfer decimals — sendPayoutsOf reads `amount`
    // in the payout-limit currency (token mode = token decimals; ETH/USD/custom = the 18-dec JB standard).
    try { amountParsed = parseAmount(state.amount, payoutAmountDecimals(state.currencyMode, state.decimals)); } catch (_) {
      state.error = 'Invalid amount'; updateUI(); return;
    }

    var terminalAddr = getAddress('JBMultiTerminal', state.selectedChain);
    if (!terminalAddr) { state.error = 'No terminal address for this chain'; updateUI(); return; }

    var tokenAddr = state.selectedToken.address;
    var currency = payoutCurrencyIdForSelection(state.currencyMode, state.customCurrency, tokenAddr);
    if (currency == null) { state.error = 'Invalid payout limit currency'; updateUI(); return; }

    executeTransaction({
      ...buildSendPayoutsArgs({ chainId: state.selectedChain, terminalAddr: terminalAddr, projectId: state.projectId, token: tokenAddr, amount: amountParsed, currency: currency, minPaidOut: 0n }),
      onStatus: function(msg) { state.txStatus = { message: msg, success: false }; updateUI(); },
      onSuccess: function(msg) { state.txStatus = { message: msg, success: true }; updateUI(); },
      onError: function(msg) { state.error = msg; state.txStatus = null; updateUI(); },
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}
