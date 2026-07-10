// src/payouts-component.js
// Send Payouts component
// Flow: Project ID -> chain -> token -> amount -> execute

import {
  el, createComponentWrapper, createProjectAndChainInput,
  createWalletButton, discoverChains, selectChain, firstChainForNetwork,
  executeTransaction, renderError, getAddress,
  getChainTokens, parseAmount, parseHashDefaults, createPublicClientForChain, getAccount, truncAddr,
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
  if (o.minPaidOut == null || BigInt(o.minPaidOut) <= 0n) throw new Error('A non-zero payout quote is required.');
  return {
    chainId: o.chainId, address: o.terminalAddr, abi: sendPayoutsAbi, functionName: 'sendPayoutsOf',
    args: [BigInt(o.projectId), o.token, o.amount, BigInt(o.currency), BigInt(o.minPaidOut)],
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

export function payoutCurrencyIdForSelection(mode, customCurrency, tokenAddr, accountingCurrency) {
  if (mode === 'eth') return 1n;
  if (mode === 'usd') return 2n;
  if (mode === 'custom') return parsePayoutCurrencyId(customCurrency);
  if (accountingCurrency != null) return BigInt(accountingCurrency);
  return tokenCurrencyId(tokenAddr);
}

// JBCurrencyAmount.amount always has the accounting token's fixed-point decimals, even when denominated in
// ETH, USD, or another currency. A USD payout limit for a 6-decimal USDC context is therefore still 6 decimals.
export function payoutAmountDecimals(mode, tokenDecimals) {
  return tokenDecimals == null ? 18 : Number(tokenDecimals);
}

export function normalizePayoutContext(context, catalog) {
  var address = context && String(context.token || '');
  var decimals = Number(context && context.decimals);
  var currency;
  try { currency = BigInt(context && context.currency); } catch (_) { throw new Error('Invalid accounting-context currency.'); }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid accounting-context token.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid accounting-context decimals.');
  if (currency <= 0n || currency > 0xffffffffn) throw new Error('Invalid accounting-context currency.');
  var known = tokenByAddress(catalog || [], address);
  return { address: address, decimals: decimals, currency: currency, symbol: known ? known.symbol : truncAddr(address) };
}

var accountingContextsAbi = [{ type: 'function', name: 'accountingContextsOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ name: 'contexts', type: 'tuple[]', components: [{ name: 'token', type: 'address' }, { name: 'decimals', type: 'uint256' }, { name: 'currency', type: 'uint256' }] }] }];
var currentRulesetAbi = [{ type: 'function', name: 'currentRulesetOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ name: 'ruleset', type: 'tuple', components: [{ name: 'cycleNumber', type: 'uint256' }, { name: 'id', type: 'uint256' }, { name: 'basedOnId', type: 'uint256' }, { name: 'start', type: 'uint256' }, { name: 'duration', type: 'uint256' }, { name: 'weight', type: 'uint256' }, { name: 'weightCutPercent', type: 'uint256' }, { name: 'approvalHook', type: 'address' }, { name: 'metadata', type: 'uint256' }] }] }];
var payoutLimitsAbi = [{ type: 'function', name: 'payoutLimitsOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'rulesetId', type: 'uint256' }, { name: 'terminal', type: 'address' }, { name: 'token', type: 'address' }], outputs: [{ name: 'limits', type: 'tuple[]', components: [{ name: 'amount', type: 'uint256' }, { name: 'currency', type: 'uint256' }] }] }];
var usedPayoutLimitAbi = [{ type: 'function', name: 'usedPayoutLimitOf', stateMutability: 'view', inputs: [{ name: 'terminal', type: 'address' }, { name: 'projectId', type: 'uint256' }, { name: 'token', type: 'address' }, { name: 'rulesetCycleNumber', type: 'uint256' }, { name: 'currency', type: 'uint256' }], outputs: [{ type: 'uint256' }] }];

export function payoutOutputFloor(quoted, exact) {
  quoted = BigInt(quoted || 0);
  if (quoted <= 0n) return 0n;
  if (exact) return quoted;
  var floor = quoted * 99n / 100n;
  return floor > 0n ? floor : 1n;
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
    decimals: initialToken && initialToken.decimals != null ? Number(initialToken.decimals) : 18,
    amount: defaults.amount || '',
    currencyMode: initialCurrencyMode(defaults.currency),
    customCurrency: defaults.currency && !/^(token|eth|usd|1|2)$/.test(defaults.currency) ? defaults.currency : '',
    error: null,
    txStatus: null,
    _defaultChain: defaults.chain ? Number(defaults.chain) : null,
    _defaultToken: defaults.token || null,
    contextsVerified: false,
    contextsLoading: false,
  };

  var discoveryGeneration = 0;
  var tokenGeneration = 0;

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

  function loadPayoutTokens(chainId) {
    var term = getAddress('JBMultiTerminal', chainId);
    var client = createPublicClientForChain(chainId);
    var wanted = state._defaultToken || (state.selectedToken && state.selectedToken.address);
    state.contextsVerified = false; state.contextsLoading = true;
    state.tokens = []; state.selectedToken = null;
    if (!term || !client || !state.projectId) {
      state.contextsLoading = false; state.error = 'Could not verify this project’s accepted payout tokens.'; updateUI(); return;
    }
    var gen = ++tokenGeneration;
    updateUI();
    client.readContract({ address: term, abi: accountingContextsAbi, functionName: 'accountingContextsOf', args: [BigInt(state.projectId)] }).then(function (contexts) {
      if (gen !== tokenGeneration || state.selectedChain !== chainId) return;
      var catalog = getChainTokens(chainId);
      var tokens = (contexts || []).map(function (context) { return normalizePayoutContext(context, catalog); });
      if (!tokens.length) throw new Error('No accounting contexts');
      state.tokens = tokens;
      state.selectedToken = tokenByAddress(tokens, wanted) || tokens[0];
      state.decimals = state.selectedToken.decimals;
      state._defaultToken = null;
      state.contextsVerified = true; state.contextsLoading = false; state.error = null;
      updateUI();
    }).catch(function () {
      if (gen !== tokenGeneration || state.selectedChain !== chainId) return;
      state.tokens = []; state.selectedToken = null;
      state.contextsVerified = false; state.contextsLoading = false;
      state.error = 'Could not verify this project’s accepted payout tokens.'; updateUI();
    });
  }

  function updateUI() {
    body.innerHTML = '';
    body.appendChild(createProjectAndChainInput(state, scheduleDiscovery, function(cid) {
      if (cid === null) cid = firstChainForNetwork(state);
      if (cid) { selectChain(state, cid); loadPayoutTokens(cid); }
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
            state.decimals = state.tokens[ti].decimals;
            break;
          }
        }
        updateUI();
      });
      tokenSection.appendChild(tokenSelect);
    } else if (state.contextsLoading) {
      var loadingTokens = el('div', 'type-hint'); loadingTokens.textContent = 'Loading verified accounting contexts…'; tokenSection.appendChild(loadingTokens);
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
    var tokenCurrency = state.selectedToken ? payoutCurrencyIdForSelection('token', '', state.selectedToken.address, state.selectedToken.currency) : null;
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
    // The currency changes the unit, not the fixed-point scale: every limit uses this token context's decimals.
    if (state.currencyMode !== 'token') {
      var curHint = el('div');
      curHint.style.fontSize = '12px'; curHint.style.color = 'var(--muted)'; curHint.style.marginTop = '4px';
      curHint.textContent = state.currencyMode === 'eth' ? 'Amount is denominated in ETH, using the selected token context’s ' + state.decimals + '-decimal scale, then converted on-chain.'
        : state.currencyMode === 'usd' ? 'Amount is denominated in USD, using the selected token context’s ' + state.decimals + '-decimal scale, then converted on-chain.'
        : 'Amount is denominated in this currency id and uses the selected token context’s ' + state.decimals + '-decimal scale.';
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
    state.tokens = [];
    state.selectedToken = null;
    state.contextsVerified = false;
    state.contextsLoading = false;
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
      if (!live.length) { state.phase = 'idle'; state.error = 'Project not found on a reachable supported chain.'; updateUI(); return; }
      var preferred = (state._defaultChain && live.indexOf(state._defaultChain) !== -1) ? state._defaultChain : firstChainForNetwork(state) || live[0];
      selectChain(state, preferred);
      state._defaultChain = null;
      state.phase = 'ready';
      updateUI();
      loadPayoutTokens(preferred);
    });
  }

  function executeSendPayouts() {
    state.error = null;
    state.txStatus = null;

    if (!state.selectedChain || !state.projectId) {
      state.error = 'Select a project and chain'; updateUI(); return;
    }
    if (!state.contextsVerified) { state.error = state.contextsLoading ? 'Payout tokens are still loading.' : 'Could not verify this project’s accepted payout tokens.'; updateUI(); return; }
    if (!state.selectedToken) { state.error = 'Select a token'; updateUI(); return; }
    if (!state.amount) { state.error = 'Enter an amount'; updateUI(); return; }

    var amountParsed;
    // The unit is the selected currency, but the fixed-point scale is always the accounting token's decimals.
    try { amountParsed = parseAmount(state.amount, payoutAmountDecimals(state.currencyMode, state.decimals)); } catch (_) {
      state.error = 'Invalid amount'; updateUI(); return;
    }

    var terminalAddr = getAddress('JBMultiTerminal', state.selectedChain);
    if (!terminalAddr) { state.error = 'No terminal address for this chain'; updateUI(); return; }

    var tokenAddr = state.selectedToken.address;
    var accountingCurrency = state.selectedToken.currency;
    var amountText = state.amount;
    var currencyMode = state.currencyMode;
    var customCurrency = state.customCurrency;
    var currency = payoutCurrencyIdForSelection(state.currencyMode, state.customCurrency, tokenAddr, state.selectedToken.currency);
    if (currency == null) { state.error = 'Invalid payout limit currency'; updateUI(); return; }
    var chainId = state.selectedChain;
    var controller = getAddress('JBController', chainId);
    var limitsAddr = getAddress('JBFundAccessLimits', chainId);
    var store = getAddress('JBTerminalStore', chainId);
    var client = createPublicClientForChain(chainId);
    var account = getAccount();
    if (!controller || !limitsAddr || !store || !client || !account) { state.error = 'Could not resolve the payout contracts or wallet.'; updateUI(); return; }

    state.phase = 'confirming'; state.txStatus = { message: 'Refreshing the payout limit and simulating output…', success: false }; updateUI();
    client.readContract({ address: controller, abi: currentRulesetAbi, functionName: 'currentRulesetOf', args: [BigInt(state.projectId)] }).then(function (current) {
      var ruleset = current && current.id != null ? current : (current && current[0]);
      if (!ruleset || BigInt(ruleset.id || 0) === 0n) throw new Error('No current ruleset.');
      return client.readContract({ address: limitsAddr, abi: payoutLimitsAbi, functionName: 'payoutLimitsOf', args: [BigInt(state.projectId), BigInt(ruleset.id), terminalAddr, tokenAddr] }).then(function (limits) {
        var configured = (limits || []).filter(function (limit) { return BigInt(limit.currency) === currency; })[0];
        if (!configured) throw new Error('This currency is not a configured payout limit for the selected token.');
        return client.readContract({ address: store, abi: usedPayoutLimitAbi, functionName: 'usedPayoutLimitOf', args: [terminalAddr, BigInt(state.projectId), tokenAddr, BigInt(ruleset.cycleNumber), currency] }).then(function (used) {
          var cap = BigInt(configured.amount), consumed = BigInt(used);
          var remaining = cap > consumed ? cap - consumed : 0n;
          if (amountParsed > remaining) throw new Error('Amount exceeds the remaining payout limit (' + String(remaining) + ' raw units).');
          return client.simulateContract({ account: account, address: terminalAddr, abi: sendPayoutsAbi, functionName: 'sendPayoutsOf', args: [BigInt(state.projectId), tokenAddr, amountParsed, currency, 0n] });
        });
      });
    }).then(function (simulation) {
      if (state.selectedChain !== chainId || state.amount !== amountText || state.currencyMode !== currencyMode
        || state.customCurrency !== customCurrency || !state.selectedToken
        || state.selectedToken.address.toLowerCase() !== tokenAddr.toLowerCase()
        || !getAccount() || getAccount().toLowerCase() !== account.toLowerCase()) {
        throw new Error('Payout inputs or the connected account changed while the quote was loading. Review the form and try again.');
      }
      var quoted = BigInt(simulation.result || 0);
      var exactCurrency = accountingCurrency != null && currency === BigInt(accountingCurrency);
      var minPaidOut = payoutOutputFloor(quoted, exactCurrency);
      if (minPaidOut === 0n) throw new Error('This request would pay out 0 terminal tokens.');
      state.phase = 'ready'; state.txStatus = null; updateUI();
      executeTransaction({
        ...buildSendPayoutsArgs({ chainId: chainId, terminalAddr: terminalAddr, projectId: state.projectId, token: tokenAddr, amount: amountParsed, currency: currency, minPaidOut: minPaidOut }),
        confirmNote: 'The live simulation returned ' + String(quoted) + ' raw terminal-token units. This transaction reverts below ' + String(minPaidOut) + ' instead of silently paying less.',
        onStatus: function(msg) { state.txStatus = { message: msg, success: false }; updateUI(); },
        onSuccess: function(msg) { state.txStatus = { message: msg, success: true }; updateUI(); },
        onError: function(msg) { state.error = msg; state.txStatus = null; updateUI(); },
      });
    }).catch(function (error) {
      state.phase = 'ready'; state.txStatus = null;
      state.error = (error && (error.shortMessage || error.message)) || 'Could not safely quote this payout.'; updateUI();
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}
