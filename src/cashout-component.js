// src/cashout-component.js
// Cash Out component
// Flow: Project ID -> chain -> token to reclaim -> amount of project tokens -> beneficiary -> execute

import {
  el, createComponentWrapper, createProjectAndChainInput,
  createBeneficiaryInput, createWalletButton, discoverChains, selectChain,
  firstChainForNetwork, executeTransaction, executeRead, renderError, getAddress,
  getAccount, getChainTokens, parseAmount, formatAmount, parseHashDefaults,
  getBeneficiaryAddress,
} from './component-base.js';

var cashOutAbi = [{
  type: 'function', name: 'cashOutTokensOf', stateMutability: 'nonpayable',
  inputs: [
    { name: 'holder', type: 'address' },
    { name: 'projectId', type: 'uint256' },
    { name: 'cashOutCount', type: 'uint256' },
    { name: 'tokenToReclaim', type: 'address' },
    { name: 'minTokensReclaimed', type: 'uint256' },
    { name: 'beneficiary', type: 'address' },
    { name: 'metadata', type: 'bytes' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}];

var totalBalanceOfAbi = [{
  type: 'function', name: 'totalBalanceOf', stateMutability: 'view',
  inputs: [
    { name: 'holder', type: 'address' },
    { name: 'projectId', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}];

export function renderCashOutComponent() {
  var defaults = parseHashDefaults('cashout');

  var initialChain = defaults.chain ? Number(defaults.chain) : 1; // default Ethereum mainnet
  var initialTokens = getChainTokens(initialChain);

  var state = {
    phase: 'idle',
    projectId: defaults.projectId || '',
    liveChains: [],
    selectedChain: initialChain,
    network: defaults.network || 'mainnet',
    tokens: initialTokens,
    selectedToken: initialTokens[0] || null,
    decimals: 18,
    amount: defaults.amount || '',
    beneficiary: defaults.beneficiary ? 'custom' : 'self',
    customBeneficiary: defaults.beneficiary || '',
    balance: null,
    error: null,
    txStatus: null,
    _defaultChain: defaults.chain ? Number(defaults.chain) : null,
  };

  var discoveryGeneration = 0;

  var comp = createComponentWrapper('CASH OUT', 'cashout', state, function() {
    var params = {};
    if (state.projectId) params.projectId = state.projectId;
    if (state.selectedChain) params.chain = state.selectedChain;
    if (state.selectedToken) params.token = state.selectedToken.address;
    if (state.amount) params.amount = state.amount;
    if (state.beneficiary === 'custom' && state.customBeneficiary) params.beneficiary = state.customBeneficiary;
    if (state.network === 'testnet') params.network = 'testnet';
    return params;
  }, { permissionNote: 'Token holder burns their own tokens to reclaim a share of the project\'s funds.' });
  var wrapper = comp.wrapper;
  var body = comp.body;

  function updateUI() {
    body.innerHTML = '';
    body.appendChild(createProjectAndChainInput(state, scheduleDiscovery, function(cid) {
      if (cid === null) cid = firstChainForNetwork(state);
      if (cid) selectChain(state, cid);
      state.balance = null;
      state.txStatus = null;
      updateUI();
      loadBalance();
    }));


    // Balance display
    if (state.balance !== null) {
      var balBox = el('div', 'pay-preview');
      var row = el('div', 'preview-row');
      var lbl = el('span', 'preview-label');
      lbl.textContent = 'Your project token balance';
      row.appendChild(lbl);
      var val = el('span', 'preview-value');
      val.textContent = formatAmount(state.balance, 18);
      row.appendChild(val);
      balBox.appendChild(row);
      body.appendChild(balBox);
    }

    // Token to reclaim selector
    var tokenSection = el('div', 'component-section');
    var tokenLabel = el('label', 'input-label');
    tokenLabel.textContent = 'token to reclaim';
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
            break;
          }
        }
      });
      tokenSection.appendChild(tokenSelect);
    }
    body.appendChild(tokenSection);

    // Cash out count (project tokens to burn)
    var amtSection = el('div', 'component-section');
    var amtLabel = el('label', 'input-label');
    amtLabel.innerHTML = 'project tokens to cash out <span class="type-hint">18 decimals</span>';
    amtSection.appendChild(amtLabel);
    var amtInput = el('input', 'field numeric-field');
    amtInput.type = 'text';
    amtInput.placeholder = '100';
    amtInput.value = state.amount;
    amtInput.addEventListener('input', function() { state.amount = amtInput.value.trim(); });
    amtSection.appendChild(amtInput);
    body.appendChild(amtSection);

    // Beneficiary
    body.appendChild(createBeneficiaryInput(state, function() { updateUI(); }));

    if (state.error) body.appendChild(renderError(state.error));
    if (state.txStatus) {
      var txDiv = el('div', state.txStatus.success ? 'tx-success' : 'component-status');
      txDiv.textContent = state.txStatus.message;
      body.appendChild(txDiv);
    }

    body.appendChild(createWalletButton('CASH OUT', executeCashOut, comp.permissionNote));
  }

  function scheduleDiscovery() {
    state.liveChains = [];
    state.selectedChain = null;
    state.balance = null;
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
      loadBalance();
    });
  }

  function loadBalance() {
    var account = getAccount();
    if (!account || !state.selectedChain || !state.projectId) return;
    var tokensAddr = getAddress('JBTokens', state.selectedChain);
    if (!tokensAddr) return;

    executeRead({
      chainId: state.selectedChain,
      address: tokensAddr,
      abi: totalBalanceOfAbi,
      functionName: 'totalBalanceOf',
      args: [account, BigInt(state.projectId)],
    }).then(function(result) {
      state.balance = result;
      updateUI();
    }).catch(function() {});
  }

  // JBMultiTerminal.previewCashOutFrom — hook-aware reclaim (net of any data-hook fee, before the 2.5%
  // protocol fee). Used to set a slippage floor so a surplus drop / MEV can't turn a burn into ~0 reclaim.
  var previewCashOutAbi = [{
    type: 'function', name: 'previewCashOutFrom', stateMutability: 'view',
    inputs: [
      { name: 'holder', type: 'address' }, { name: 'projectId', type: 'uint256' },
      { name: 'cashOutCount', type: 'uint256' }, { name: 'tokenToReclaim', type: 'address' },
      { name: 'beneficiary', type: 'address' }, { name: 'metadata', type: 'bytes' },
    ],
    outputs: [
      { name: 'ruleset', type: 'tuple', components: [
        { name: 'cycleNumber', type: 'uint256' }, { name: 'id', type: 'uint256' },
        { name: 'basedOnId', type: 'uint256' }, { name: 'start', type: 'uint256' },
        { name: 'duration', type: 'uint256' }, { name: 'weight', type: 'uint256' },
        { name: 'weightCutPercent', type: 'uint256' }, { name: 'approvalHook', type: 'address' },
        { name: 'metadata', type: 'uint256' },
      ]},
      { name: 'reclaimAmount', type: 'uint256' },
      { name: 'cashOutTaxRate', type: 'uint256' },
      { name: 'hookSpecifications', type: 'tuple[]', components: [
        { name: 'hook', type: 'address' }, { name: 'noop', type: 'bool' },
        { name: 'amount', type: 'uint256' }, { name: 'metadata', type: 'bytes' },
      ]},
    ],
  }];

  async function executeCashOut() {
    state.error = null;
    state.txStatus = null;

    if (!state.selectedChain || !state.projectId) {
      state.error = 'Select a project and chain'; updateUI(); return;
    }
    if (!state.amount) { state.error = 'Enter a token count'; updateUI(); return; }
    if (!state.selectedToken) { state.error = 'Select a token to reclaim'; updateUI(); return; }

    var cashOutCount;
    try { cashOutCount = parseAmount(state.amount, 18); } catch (_) {
      state.error = 'Invalid token count'; updateUI(); return;
    }

    var holder = getAccount();
    if (!holder) { state.error = 'Connect wallet first'; updateUI(); return; }

    var beneficiary = getBeneficiaryAddress(state);
    if (!beneficiary) {
      state.error = state.beneficiary === 'custom' ? 'Enter a valid beneficiary address' : 'Connect wallet first';
      updateUI(); return;
    }

    var terminalAddr = getAddress('JBMultiTerminal', state.selectedChain);
    if (!terminalAddr) { state.error = 'No terminal address for this chain'; updateUI(); return; }

    // Slippage floor: 95% of the previewed reclaim (covers the 2.5% protocol fee + ~2.5% tolerance). Reverts
    // a burn that would reclaim near-zero (surplus drained / MEV) instead of letting it silently succeed.
    var minReclaimed = 0n;
    try {
      var preview = await executeRead({
        chainId: state.selectedChain, address: terminalAddr, abi: previewCashOutAbi, functionName: 'previewCashOutFrom',
        args: [holder, BigInt(state.projectId), cashOutCount, state.selectedToken.address, beneficiary, '0x'],
      });
      var reclaim = preview && (preview.reclaimAmount != null ? preview.reclaimAmount : preview[1]);
      if (reclaim != null && BigInt(reclaim) > 0n) minReclaimed = BigInt(reclaim) * 95n / 100n;
    } catch (_) {} // cash-out delay active or read failed → fall back to no floor (tx still reviewable)

    executeTransaction({
      chainId: state.selectedChain,
      address: terminalAddr,
      abi: cashOutAbi,
      functionName: 'cashOutTokensOf',
      args: [holder, BigInt(state.projectId), cashOutCount, state.selectedToken.address, minReclaimed, beneficiary, '0x'],
      onStatus: function(msg) { state.txStatus = { message: msg, success: false }; updateUI(); },
      onSuccess: function(msg) { state.txStatus = { message: msg, success: true }; loadBalance(); updateUI(); },
      onError: function(msg) { state.error = msg; state.txStatus = null; updateUI(); },
    });
  }

  updateUI();
  if (state.projectId) scheduleDiscovery();
  return wrapper;
}
