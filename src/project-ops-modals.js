// Add-liquidity and move-between-chains modals. Loaded on demand from a project's actions menu.
import { el, getAddress, formatAmount, parseAmount, truncAddr, getAccount, getEffectiveAccount, getViewAs, VIEW_AS_TX_ERROR, connect, executeTransaction, onEffectiveAccountChange, resolveContractName, ZERO_ADDRESS, NATIVE_TOKEN, errMessage, isSafeConnected } from './component-base.js';
import { quotedOutputFloor } from './slippage.js';
import { txHashForSafeTx } from './safe-app.js';
import {
  PERMIT2_ADDRESS, POOL_MANAGER_BY_CHAIN, POSITION_MANAGER_BY_CHAIN, acctKindsForFunds,
  borrowCurrencyForAccountContext, buildSuckerPrepareArgs, buildSuckerToRemoteArgs, cashOutProtocolFee,
  classifySuckerInfra, clientFor, currentSurplusOfAbi, erc20BalanceOfAbi, feeFreeSurplusOfAbi, findToRemoteValue,
  formatBalance, formatEth, formatPrice, formatTokens, isFeelessAddress, issuancePairUnitMismatch,
  lpAddLiquidityCalls, lpAmountsModeNote, lpDeadlineSecs, lpDefaultRange, lpDepthMarkerLabelLayout,
  lpFullRangeBounds, lpIsSmartWallet, lpPairFor, lpSolveRangeFromAmounts, lpTrimNum, moveChainName, noteLocalLpWrite,
  openTxConfirm, opsChainSelect, opsPercentButtons, pidOn, prepareAddLiquidity, previewCashOutAbi, read,
  readAmmPrice, readCashoutPrice, readIssuancePairRate, readSuckerPairsOf, readUserBalance, readWalletTokenBalance,
  renderBalanceTables, renderExplorerTxLink, resolveAcctToken, resolveFundsKindAcct, runAddLiquidityTxs,
  suckerTokenMappingAbi, toBigInt, tokenOfAbi, totalSupplyAbi,
} from './discover.js';

// The connected wallet's CLAIMED ERC-20 balance — the only kind a sucker can bridge — plus the token
// address. `verified` distinguishes a confirmed missing ERC-20 from an RPC/deployment read failure; those must
// never share a UI state because only the former can safely tell a user to claim tokens first.
function readBridgeableBalance(project, chainId) {
  var acct = getEffectiveAccount();
  var tokens = getAddress('JBTokens', chainId);
  if (!acct || !tokens) return Promise.resolve({ verified: false, token: null, balance: null });
  var client = clientFor(chainId);
  return client.readContract({ address: tokens, abi: tokenOfAbi, functionName: 'tokenOf', args: [pidOn(project, chainId)] })
    .then(function (erc20) {
      if (!erc20 || erc20 === ZERO_ADDRESS) return { verified: true, token: null, balance: 0n };
      return client.readContract({ address: erc20, abi: erc20BalanceOfAbi, functionName: 'balanceOf', args: [acct] })
        .then(function (b) { return { verified: true, token: erc20, balance: BigInt(b) }; });
    })
    .catch(function () { return { verified: false, token: null, balance: null }; });
}

export function buildMoveModal(project) {
  var sym = project.tokenSymbol || 'tokens';
  var wrap = el('div', 'modal-body');
  var chains = project.chains || [];
  var state = { from: chains[0] && chains[0].id, to: chains[1] && chains[1].id, balance: null, balanceVerified: false, token: null, pairs: null, sucker: null, kinds: null, backingKey: null };

  // Per-chain balances at the top (card) — your tokens + the project's accounting balances.
  var moveBalTable = el('div', 'cashout-bal-table'); wrap.appendChild(moveBalTable);

  // "From [chain] to [chain] with [token]" — one sentence. The "with [token]" backing picker shows only for
  // multi-token projects (the sucker reclaims + bridges that specific token; it must be mapped on the route).
  var sent = el('div', 'cashout-selrow');
  sent.appendChild(document.createTextNode('From'));
  var fromSel = opsChainSelect(project, function (cid) { state.from = cid; onFromChange(); }); sent.appendChild(fromSel);
  sent.appendChild(document.createTextNode('to'));
  var toSel = opsChainSelect(project, function (cid) { state.to = cid; resolveRoute(); }); if (chains[1]) toSel.value = String(chains[1].id); sent.appendChild(toSel);
  var withWrap = el('span', 'cashout-reclaim'); withWrap.style.display = 'none';
  withWrap.appendChild(document.createTextNode('with'));
  var bringSel = el('select', 'field create-input'); bringSel.style.width = 'auto'; bringSel.style.minWidth = '0';
  bringSel.addEventListener('change', function () { state.backingKey = bringSel.value; loadBacking(); updateBacking(); });
  withWrap.appendChild(bringSel); sent.appendChild(withWrap);
  wrap.appendChild(sent);

  // Bridge route — and when a pair carries both a native and a CCIP sucker, a picker + tradeoff blurb.
  var route = el('div', 'modal-status modal-route'); wrap.appendChild(route);
  var bridgeRow = el('div', 'ops-bridge-row'); bridgeRow.style.display = 'none';
  var bridgeSel = el('select', 'field create-input'); bridgeSel.style.width = 'auto'; bridgeSel.style.minWidth = '0'; bridgeRow.appendChild(bridgeSel);
  var bridgeNote = el('div', 'ops-bridge-note'); bridgeRow.appendChild(bridgeNote);
  bridgeSel.addEventListener('change', function () {
    var m = state._matches && state._matches[Number(bridgeSel.value)];
    if (m) state.sucker = m.local;
    updateBridgeNote(); updateMoveBtn();
  });
  wrap.appendChild(bridgeRow);

  var lbl = el('div', 'modal-label move-label'); lbl.textContent = 'Amount'; lbl.style.marginTop = '12px'; wrap.appendChild(lbl);
  var bal = el('div', 'modal-balance'); wrap.appendChild(bal);
  var inRow = el('div', 'ops-inrow');
  var amtField = el('div', 'ops-field');
  var amt = el('input', 'ops-amount'); amt.type = 'number'; amt.step = 'any'; amt.placeholder = '0.00'; amtField.appendChild(amt);
  var unit = el('span', 'ops-unit'); unit.textContent = sym; amtField.appendChild(unit);
  inRow.appendChild(amtField);
  wrap.appendChild(inRow);
  wrap.appendChild(opsPercentButtons(amt, function () { return state.balance; }));

  var note = el('div', 'modal-status');
  function updateMoveNote() { var s = (state.backing && state.backing.symbol) || sym; note.textContent = 'A proportional share of the revnet’s ' + s + ' surplus (funds beyond payouts) moves too.'; }
  updateMoveNote();
  wrap.appendChild(note);

  // "Amount that will move" — the proportional backing (ETH) that bridges alongside the tokens.
  var backing = el('div', 'modal-status move-backing'); backing.style.display = 'none'; wrap.appendChild(backing);
  amt.addEventListener('input', function () { updateBacking(); updateMoveBtn(); });

  var status = el('div', 'modal-status'); wrap.appendChild(status);

  var hint = el('div', 'modal-status');
  hint.textContent = 'Once it’s bridged, claim it on the destination from the Queued movements table below.';
  wrap.appendChild(hint);

  var foot = el('div', 'modal-foot');
  var btn = document.createElement('button'); btn.className = 'modal-submit'; btn.textContent = 'Move ' + sym;
  foot.appendChild(btn); wrap.appendChild(foot);

  var moveBalanceSeq = 0;
  var movePairsSeq = 0;
  var moveBackingSeq = 0;
  function onFromChange() { refreshBalance(); loadPairs(); loadBacking(); }
  function refreshBalance() {
    var from = state.from;
    var seq = ++moveBalanceSeq;
    state.balance = null; state.balanceVerified = false; state.token = null;
    bal.textContent = 'Your balance: …';
    readBridgeableBalance(project, from).then(function (r) {
      if (seq !== moveBalanceSeq || state.from !== from) return;
      state.balance = r.balance; state.balanceVerified = !!r.verified; state.token = r.token;
      if (!getEffectiveAccount()) { bal.textContent = 'Connect a wallet to see your balance.'; updateMoveBtn(); return; }
      if (!r.verified) { bal.textContent = 'Could not verify your bridgeable balance on ' + moveChainName(from) + '. Try again shortly.'; updateMoveBtn(); return; }
      if (!r.token) { bal.textContent = 'No ERC-20 ' + sym + ' on ' + moveChainName(from) + ' — claim your tokens there first to bridge.'; updateMoveBtn(); return; }
      bal.textContent = 'Your ' + sym + ' available on ' + moveChainName(from) + ': ' + formatTokens(r.balance) + ' ' + sym;
      updateMoveBtn();
    });
  }
  // Disable Move with a clear reason when there's nothing to bridge — otherwise the button looks active
  // but the click silently no-ops (the #1 "I clicked and nothing happened" confusion). Suckers bridge the
  // ERC-20, so credits-only / zero-balance / same-chain all block it.
  function moveBlockReason() {
    if (!getEffectiveAccount()) return ''; // allow click → connect()
    if (state.from === state.to) return 'Pick two different chains to bridge between.';
    if (state.pairs == null) return 'Finding a verified bridge route…';
    if (!state.sucker) return 'No verified bridge route connects these chains.';
    if (!state.backing) return 'Loading the verified backing token…';
    if (!state.balanceVerified) return 'Could not verify your bridgeable balance. Try again shortly.';
    if (!state.token) return 'No ERC-20 ' + sym + ' on ' + moveChainName(state.from) + ' yet — claim your ' + sym + ' to an ERC-20 there first, then bridge.';
    if (state.balance != null && state.balance === 0n) return 'You have no ' + sym + ' to bridge on ' + moveChainName(state.from) + '.';
    return '';
  }
  function updateMoveBtn() {
    var why = moveBlockReason();
    btn.disabled = !!why;
    btn.title = why || '';
    if (why) { status.classList.remove('pending'); status.textContent = why; }
    else if (status.textContent === btn.title || /no ERC-20|to bridge on|Pick two different|Finding a verified|No verified bridge|Loading the verified backing|Could not verify your bridgeable/i.test(status.textContent)) status.textContent = '';
  }
  // The proportional backing that bridges with the tokens: terminalBalance × amount / totalSupply (suckers
  // move the full proportional share, no cash out tax). Read on the FROM chain.
  function loadBacking() {
    var from = state.from;
    var backingKey = state.backingKey;
    var seq = ++moveBackingSeq;
    state.fromSupply = null; state.fromBacking = null; state.backing = null; updateBacking(); updateMoveBtn();
    var pid = pidOn(project, from); // the project's id on the SOURCE chain
    // The chosen backing token (multi-token picker), else the project's primary accounting token.
    var selectedKind = null;
    if (state.kinds && backingKey) selectedKind = state.kinds.filter(function (x) { return x.key === backingKey; })[0];
    var acctP = selectedKind
      ? resolveFundsKindAcct(from, pid, selectedKind).then(function (acct) { if (!acct) throw new Error('This backing token is not configured on the source chain.'); return acct; })
      : resolveAcctToken(from, pid);
    acctP.then(function (acct) {
      if (seq !== moveBackingSeq || state.from !== from || state.backingKey !== backingKey) return null;
      state.backing = acct;
      updateMoveBtn();
      var term = getAddress('JBMultiTerminal', from);
      return Promise.all([
        read(from, 'JBTokens', totalSupplyAbi, 'totalSupplyOf', [pid]).catch(function () { return null; }),
        // What bridges = the sucker's cash out of the moved tokens, which draws from this token's SURPLUS
        // (balance − payout limit) at 0% tax — not the full balance. A token with unlimited payouts has 0.
        term ? read(from, 'JBTerminalStore', currentSurplusOfAbi, 'currentSurplusOf', [pid, [], [acct.address], BigInt(acct.decimals), borrowCurrencyForAccountContext(acct)]).catch(function () { return null; }) : Promise.resolve(null),
      ]);
    }).then(function (res) {
      if (!res || seq !== moveBackingSeq || state.from !== from || state.backingKey !== backingKey) return;
      state.fromSupply = res[0] != null ? BigInt(res[0]) : null;
      state.fromBacking = res[1] != null ? BigInt(res[1]) : null;
      updateBacking();
    }).catch(function () {
      if (seq !== moveBackingSeq || state.from !== from || state.backingKey !== backingKey) return;
      state.backing = null; state.fromSupply = null; state.fromBacking = null; updateBacking(); updateMoveBtn();
    });
  }
  function updateBacking() {
    updateMoveNote(); // reflect the chosen backing token in the "proportional share" note
    backing.style.display = 'none';
    if (!state.backing || state.fromSupply == null || state.fromBacking == null || state.fromSupply === 0n) return;
    var amount; try { amount = parseAmount(amt.value, 18); } catch (_) { return; }
    if (amount === 0n) return;
    var moved = state.fromBacking * amount / state.fromSupply;
    backing.innerHTML = '';
    var b = el('strong'); b.textContent = 'Surplus that will move: ';
    backing.appendChild(b);
    backing.appendChild(document.createTextNode(formatBalance(moved, state.backing.decimals, state.backing.symbol)));
    // Explain a zero: the token's payout limit covers its whole balance, so there's no surplus to bridge.
    if (state.fromBacking === 0n) {
      var why = el('div', 'move-backing-why'); why.textContent = 'No ' + state.backing.symbol + ' surplus on ' + moveChainName(state.from) + ' — its payout limit covers the whole balance' + (state.kinds && state.kinds.length > 1 ? '. Try another token above.' : '.');
      backing.appendChild(why);
    }
    backing.style.display = '';
  }
  // Tradeoff blurb under the bridge picker, with a docs link for DYOR.
  function updateBridgeNote() {
    var m = state._matches && state._matches[Number(bridgeSel.value)];
    if (!m) { bridgeNote.style.display = 'none'; return; }
    bridgeNote.innerHTML = '';
    var txt, href, linkLabel;
    if (m._infra === 'CCIP') {
      txt = 'CCIP delivers in minutes by relaying through Chainlink’s cross-chain network — faster, but it depends on Chainlink.';
      href = 'https://docs.chain.link/ccip'; linkLabel = 'About Chainlink CCIP ↗';
    } else if (m._infra === 'native') {
      txt = 'Native bridges route through the chain’s own canonical bridge — slower, but their security comes from the chain itself, not a third party.';
      href = 'https://docs.juicebox.money/v4/learn/glossary/sucker/'; linkLabel = 'About suckers ↗';
    } else {
      txt = 'The bridge type could not be verified. Fee-sensitive actions stay unavailable until this route can be read again.';
      href = 'https://docs.juicebox.money/v4/learn/glossary/sucker/'; linkLabel = 'About suckers ↗';
    }
    bridgeNote.appendChild(document.createTextNode(txt + ' '));
    var a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = linkLabel;
    bridgeNote.appendChild(a);
    bridgeNote.style.display = '';
  }
  function loadPairs() {
    var from = state.from;
    var seq = ++movePairsSeq;
    state.pairs = null; resolveRoute();
    readSuckerPairsOf(pidOn(project, from), from).then(function (pairs) {
      if (seq !== movePairsSeq || state.from !== from) return;
      state.pairs = pairs; resolveRoute();
    }).catch(function () {
      if (seq !== movePairsSeq || state.from !== from) return;
      state.pairs = []; state.sucker = null; state._matches = null;
      bridgeRow.style.display = 'none'; bridgeNote.style.display = 'none';
      route.textContent = 'Could not verify bridge routes on ' + moveChainName(from) + '. Try again shortly.';
      updateMoveBtn();
    });
  }
  function resolveRoute() {
    state.sucker = null; state._matches = null; bridgeRow.style.display = 'none'; bridgeNote.style.display = 'none';
    updateMoveBtn();
    if (state.from === state.to) { route.textContent = 'Pick two different chains.'; return; }
    if (state.pairs == null) { route.textContent = 'Finding bridge route…'; return; }
    var matches = state.pairs.filter(function (x) { return x.remoteChainId === state.to; });
    if (!matches.length) { route.textContent = 'No bridge from ' + moveChainName(state.from) + ' to ' + moveChainName(state.to) + '.'; return; }
    if (matches.length === 1) {
      state.sucker = matches[0].local;
      route.textContent = 'Bridges via sucker ' + truncAddr(matches[0].local) + '.';
      updateMoveBtn();
      return;
    }
    // Two suckers connect this pair (a native bridge and a CCIP bridge) — classify each and let the user pick.
    route.textContent = 'Two bridges connect these chains — pick one:';
    var from = state.from, to = state.to; // guard against chain switches mid-classification
    Promise.all(matches.map(function (m) {
      return m._infra ? Promise.resolve(m._infra) : classifySuckerInfra(state.from, m.local).then(function (i) { m._infra = i; return i; });
    })).then(function (infras) {
      if (state.from !== from || state.to !== to) return;
      bridgeSel.innerHTML = '';
      matches.forEach(function (m, i) {
        var o = document.createElement('option'); o.value = String(i);
        var infraLabel = infras[i] === 'CCIP' ? 'CCIP' : (infras[i] === 'native' ? 'Native' : 'Unverified');
        o.textContent = infraLabel + ' bridge | ' + truncAddr(m.local);
        bridgeSel.appendChild(o);
      });
      // Default to the native (canonical) bridge when one exists — it's zero-cost (only the registry fee),
      // whereas CCIP also charges a messaging fee. EXCEPT when the backing token is an ERC-20 (USDC):
      // native bridges can't deliver it (funds strand in escrow), so CCIP is the only working route.
      var nativeIdx = infras.indexOf('native');
      var erc20Backing = state.backing && state.backing.address && state.backing.address.toLowerCase() !== NATIVE_TOKEN.toLowerCase();
      var ccipIdx = infras.indexOf('CCIP');
      var def = erc20Backing ? (ccipIdx >= 0 ? ccipIdx : 0) : (nativeIdx >= 0 ? nativeIdx : 0);
      bridgeSel.value = String(def);
      state._matches = matches;
      state.sucker = matches[def].local;
      bridgeRow.style.display = '';
      updateBridgeNote(); updateMoveBtn();
    });
  }

  onFromChange();
  onEffectiveAccountChange(function () { if (wrap.isConnected) refreshBalance(); });
  renderBalanceTables(moveBalTable, project, sym);
  // Multi-token projects: offer a backing-token picker (default to the primary), then recompute backing.
  acctKindsForFunds(project).then(function (kinds) {
    state.kinds = kinds;
    if (kinds && kinds.length > 1) {
      bringSel.innerHTML = '';
      kinds.forEach(function (k) { var o = document.createElement('option'); o.value = k.key; o.textContent = k.symbol; bringSel.appendChild(o); });
      state.backingKey = kinds[0].key; bringSel.value = state.backingKey;
      withWrap.style.display = 'inline-flex';
      loadBacking();
    }
  }).catch(function () {});

  btn.addEventListener('click', function () {
    if (getViewAs()) { status.textContent = VIEW_AS_TX_ERROR; return; }
    var acct = getAccount && getAccount();
    if (!acct) { connect().then(refreshBalance).catch(function () {}); return; }
    if (state.from === state.to) { status.textContent = 'Pick two different chains.'; return; }
    if (!state.balanceVerified) { status.textContent = 'Could not verify your bridgeable balance. Try again shortly.'; return; }
    if (!state.token) { status.textContent = 'No ERC-20 ' + sym + ' to bridge on ' + moveChainName(state.from) + '.'; return; }
    if (!state.sucker) { status.textContent = 'No bridge route between these chains.'; return; }
    var amount; try { amount = parseAmount(amt.value, 18); } catch (_) { status.textContent = 'Invalid amount'; return; }
    if (amount === 0n) { status.textContent = 'Enter an amount'; return; }
    if (amount > state.balance) { status.textContent = 'Amount exceeds your bridgeable balance'; return; }

    // beneficiary is the recipient on the remote chain — the caller, left-padded to bytes32.
    var beneficiary32 = '0x' + acct.slice(2).toLowerCase().padStart(64, '0');
    var metadata = '0x' + '0'.repeat(64);
    var sucker = state.sucker, token = state.token, from = state.from, to = state.to, backingKey = state.backingKey;
    btn.disabled = true; status.textContent = '';
    var onStatus = function (m, kind) { status.classList.toggle('pending', kind === 'pending'); status.textContent = m; };
    var fail = function (m) { status.classList.remove('pending'); status.textContent = m; btn.disabled = false; };

    // The TERMINAL (backing) token the sucker reclaims + bridges alongside the project tokens. This is the
    // project's accounting token — USDC for a USDC project, NATIVE_TOKEN only for an ETH project. The sucker
    // keys its token mapping/outbox tree by this address, so passing the wrong token reverts or bridges the
    // wrong tree. Use the resolved backing token (loadBacking), re-resolving if it hasn't populated yet.
    if (!state.backing || !state.backing.address) { fail('The backing token is still loading or could not be verified.'); return; }
    var termP = Promise.resolve(state.backing.address);
    termP.then(function (termToken) {
      if (!termToken) { fail('Could not resolve the backing token to bridge.'); return; }
      onStatus('Verifying the bridge token and previewing backing…', 'pending');
      var terminal = getAddress('JBMultiTerminal', from);
      if (!terminal) { fail('No terminal on the source chain.'); return; }
      var remoteBackingP;
      var selectedKind = state.kinds && state.backingKey
        ? state.kinds.filter(function (kind) { return kind.key === state.backingKey; })[0]
        : null;
      var fromPid = pidOn(project, from); // project id on the SOURCE chain
      var toPid = pidOn(project, to);     // project id on the DESTINATION chain (may differ for linked deployments)
      if (selectedKind) {
        remoteBackingP = resolveFundsKindAcct(to, toPid, selectedKind).catch(function () { return null; });
      } else {
        remoteBackingP = resolveAcctToken(to, toPid).catch(function () { return null; });
      }
      return Promise.all([
        clientFor(from).readContract({ address: sucker, abi: suckerTokenMappingAbi, functionName: 'projectId', args: [] }),
        clientFor(from).readContract({ address: sucker, abi: suckerTokenMappingAbi, functionName: 'remoteTokenFor', args: [termToken] }),
        clientFor(from).readContract({ address: terminal, abi: previewCashOutAbi, functionName: 'previewCashOutFrom', args: [sucker, fromPid, amount, termToken, sucker, '0x'] }),
        isFeelessAddress(from, sucker, Number(fromPid)),
        read(from, 'JBMultiTerminal', feeFreeSurplusOfAbi, 'feeFreeSurplusOf', [fromPid, termToken]).then(toBigInt),
        classifySuckerInfra(from, sucker),
        remoteBackingP,
      ]).then(function (checks) {
        if (toBigInt(checks[0]) !== fromPid) throw new Error('The selected bridge belongs to a different project.');
        var mapping = checks[1];
        if (!mapping || !mapping.enabled || !mapping.addr || /^0x0+$/.test(mapping.addr)) throw new Error('This backing token is not mapped on the selected bridge.');
        if (checks[5] === 'unknown') throw new Error('The selected bridge type could not be verified. Try again when the source RPC is available.');
        // Canonical ERC-20s (USDC) over an OP-stack/Arbitrum NATIVE sucker strand in bridge escrow — the
        // mapping may exist on-chain (the guards are bridge-blind) but the delivery leg can never settle.
        if (checks[5] === 'native' && termToken.toLowerCase() !== NATIVE_TOKEN.toLowerCase()) {
          throw new Error('This pair’s native bridge can’t deliver ' + ((state.backing && state.backing.symbol) || 'this backing token') + ' — canonical tokens sent over a native bridge get stuck in escrow. Pick the CCIP bridge for this move.');
        }
        if (checks[3] == null) throw new Error('The bridge fee status could not be verified. Nothing was sent.');
        var remoteBacking = checks[6];
        if (!remoteBacking || !remoteBacking.address) throw new Error('The matching backing token is not configured on the destination chain.');
        var mappedRemote = '0x' + String(mapping.addr).slice(-40).toLowerCase();
        if (mappedRemote !== String(remoteBacking.address).toLowerCase()) {
          throw new Error('The selected bridge maps this backing token to a different destination token.');
        }
        var cashPreview = checks[2];
        var gross = toBigInt(cashPreview && (cashPreview.reclaimAmount != null ? cashPreview.reclaimAmount : cashPreview[1]));
        var taxRate = Number(cashPreview && (cashPreview.cashOutTaxRate != null ? cashPreview.cashOutTaxRate : cashPreview[2]) || 0);
        var net = gross - cashOutProtocolFee(gross, taxRate, !!checks[3], checks[4]);
        var minReclaimed = quotedOutputFloor(net, 9900);
        if (state.from !== from || state.to !== to || state.sucker !== sucker || state.token !== token || state.backingKey !== backingKey
          || !state.backing || state.backing.address.toLowerCase() !== termToken.toLowerCase()
          || amt.value.trim() === '' || parseAmount(amt.value, 18) !== amount
          || !getAccount() || getAccount().toLowerCase() !== acct.toLowerCase()) {
          throw new Error('Movement inputs or the connected account changed while the backing preview was loading. Review and try again.');
        }
        // Step 1: approve the sucker for the ERC-20, then prepare (cash out to terminal funds + insert outbox
        // leaf). A positive backing preview gets a 99% onchain floor. Zero backing can still move the same project
        // token count to the remote chain, but the confirmation calls that out explicitly instead of hiding min=0.
        var backingText = net > 0n
          ? '≈ ' + formatBalance(net, state.backing ? state.backing.decimals : 18, state.backing ? state.backing.symbol : 'backing tokens') + ' (at least ' + formatBalance(minReclaimed, state.backing ? state.backing.decimals : 18, state.backing ? state.backing.symbol : 'backing tokens') + ')'
          : 'none — this chain currently contributes zero backing';
        var moveSteps = ['Approve token access if needed', 'Prepare the movement', 'Send the queued movements to ' + moveChainName(to)];
        executeTransaction(Object.assign(buildSuckerPrepareArgs({
          chainId: from, sucker: sucker, projectTokenCount: amount, beneficiary32: beneficiary32, minReclaimed: minReclaimed,
          termToken: termToken, metadata: metadata, approvalToken: token, approvalAmount: amount,
        }), {
          confirmTitle: 'Move ' + sym,
          confirmText: 'Prepare',
          confirmSteps: moveSteps, confirmStepIndex: 0, keepConfirmOpen: true,
          confirmSummary: { action: 'Prepare the movement', rows: [
            ['Moving', formatTokens(amount) + ' ' + sym],
            ['From', moveChainName(from)],
            ['To', moveChainName(to)],
            ['Backing that moves', backingText],
            ['Bridge', checks[5] === 'native' ? 'native bridge' : 'CCIP'],
          ] },
          confirmNote: net > 0n
            ? 'The live bridge cash out preview is ' + formatBalance(net, state.backing ? state.backing.decimals : 18, state.backing ? state.backing.symbol : 'backing tokens') + '; this reverts below the 99% floor.'
            : 'This source chain currently contributes zero backing. The same project-token count will still be minted remotely, but no backing tokens will move with it.',
          onStatus: onStatus, onError: fail,
          onSuccess: function (m, meta) {
          var session = meta && meta.confirmSession;
          // Step 2: ship the outbox root to the remote chain. Discover the exact msg.value the bridge needs
          // by simulating toRemote at increasing values (handles native-bridge fee-only AND CCIP messaging).
          onStatus('Prepared — finding bridge fee…', 'pending');
          if (session) session.showStatus('Prepared. Finding the bridge fee…', 'pending');
          findToRemoteValue(from, sucker, termToken, acct).then(function (fee) {
            if (fee == null) {
              var notReady = 'Prepared, but the bridge queue isn’t ready to send yet — reopen and try again shortly.';
              if (session) session.showStatus(notReady, 'error');
              fail(notReady); return;
            }
            onStatus('Sending to ' + moveChainName(to) + '…', 'pending');
            executeTransaction(Object.assign(buildSuckerToRemoteArgs({
              chainId: from, sucker: sucker, termToken: termToken, value: fee,
            }), {
              confirmTitle: 'Move ' + sym,
              confirmText: 'Send',
              confirmSession: session, confirmSteps: moveSteps, confirmStepIndex: 2,
              confirmSummary: { action: 'Send the queued movements to ' + moveChainName(to), rows: [
                ['Sends', 'every queued movement (yours and anyone else’s) in one bridge message'],
                ['Bridge fee', formatEth(fee) + ' — paid to relay the message, not the bridged tokens'],
                ['From', moveChainName(from)],
                ['To', moveChainName(to)],
              ] },
              confirmDescription: 'The prepare step queued your move into the bridge’s outbox. '
                + 'This step ships that queued batch to ' + moveChainName(to) + ' — it delivers every pending move in the '
                + 'queue (yours and anyone else’s) in one bridge message, so anyone can trigger it. The small value is the '
                + 'bridge’s messaging fee — you pay it to relay the message; it’s not the bridged tokens (those move from the '
                + 'project’s funds). Once it lands, claim your tokens on ' + moveChainName(to) + ' from the Queued movements table.',
              onStatus: onStatus, onError: fail,
              onSuccess: function () {
                status.classList.remove('pending');
                status.textContent = 'Bridging to ' + moveChainName(to) + ' — once it delivers (a few minutes for native bridges) claim it from the Queued movements table.';
                btn.disabled = false;
                document.dispatchEvent(new CustomEvent('jb:bridge-updated'));
              },
            }));
          });
          },
        }));
      });
    }).catch(function (error) { fail(errMessage(error, 'Could not safely preview this movement.')); });
  });
  return wrap;
}

// Concentrated-liquidity deposit counterpart. Given one side's amount, the current price `p` and the
// range [pa, pb] (all ETH-per-token), return the other side's amount using Uniswap V3/V4 math.
// driverIsEth=true → input is ETH, returns token; false → input is token, returns ETH.
// Outside the range it's single-sided: returns 0 for the side that isn't needed, or null if the
// requested side can't fund the position.
function lpCounterpart(amount, driverIsEth, p, pa, pb) {
  if (!(amount > 0) || !(p > 0) || !(pa > 0) || !(pb > pa)) return null;
  var sp = Math.sqrt(p), sa = Math.sqrt(pa), sb = Math.sqrt(pb);
  if (p <= pa) return driverIsEth ? null : 0;   // all token: no ETH side
  if (p >= pb) return driverIsEth ? 0 : null;   // all ETH: no token side
  if (driverIsEth) {
    var L = amount / (sp - sa);
    return L * (1 / sp - 1 / sb); // token amount
  }
  var Lx = amount / (1 / sp - 1 / sb);
  return Lx * (sp - sa); // ETH amount
}

// A compact number-line of the LP price range relative to the cash out floor, current pool price,
// and issuance ceiling. All values are pair/base token per project token.
function renderLpRangeSvg(floor, ceiling, poolP, pa, pb) {
  var pts = [floor, ceiling, poolP, pa, pb].filter(function (v) { return v > 0; });
  if (!pts.length) return { html: '<div class="modal-balance">Range preview unavailable.</div>', maxV: 0, W: 320, padL: 6, padR: 6 };
  var maxV = Math.max.apply(null, pts) * 1.12;
  var W = 320, padL = 6, padR = 6;
  function X(v) { return padL + (W - padL - padR) * (v / maxV); }
  var topMarkers = [
    { value: floor, color: '#2c2018', label: 'Floor' },
    { value: ceiling, color: '#1a8a8a', label: 'Ceiling' },
  ].filter(function (marker) { return marker.value > 0; });
  var topLabels = lpDepthMarkerLabelLayout(topMarkers.map(function (marker) {
    return { x: X(marker.value), label: marker.label + ' ' + formatPrice(marker.value) };
  }), W);
  var topRows = topLabels.reduce(function (max, label) { return Math.max(max, label.row + 1); }, 0);
  var topH = Math.max(24, topRows * 22 + 2), baseY = topH + 18, H = baseY + 32;
  // Uniform scaling (no preserveAspectRatio="none") so the text labels don't render horizontally stretched.
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" class="lp-graph-svg">';
  svg += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (W - padR) + '" y2="' + baseY + '" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>';
  if (pa > 0 && pb > pa) {
    svg += '<rect x="' + X(pa).toFixed(1) + '" y="' + (baseY - 9) + '" width="' + Math.max(1, X(pb) - X(pa)).toFixed(1) + '" height="18" fill="rgba(110,196,196,0.35)" stroke="#1a8a8a" stroke-width="1"/>';
  }
  function marker(v, color, label, up, layout) {
    if (!(v > 0)) return '';
    var xv = X(v);
    var valStr = formatPrice(v);
    // Keep the whole label inside the chart: anchor by where its half-width would overflow an edge.
    // (~0.3 ≈ half the ~0.6em monospace glyph advance at font-size 8.) Use the wider of label/value.
    var half = Math.max(label.length, valStr.length) * 8 * 0.3;
    var anchor = 'middle', tx = layout ? layout.x : xv;
    if (!layout && anchor === 'middle') {
      if (xv - half < padL) { anchor = 'start'; tx = padL; }
      else if (xv + half > W - padR) { anchor = 'end'; tx = W - padR; }
    }
    var x = xv.toFixed(1);
    var labelY = up ? (10 + layout.row * 22) : H - 13, valY = up ? (20 + layout.row * 22) : H - 3;
    return '<line x1="' + x + '" y1="' + (baseY - 13) + '" x2="' + x + '" y2="' + (baseY + 13) + '" stroke="' + color + '" stroke-width="1.5"/>'
      + '<text x="' + tx.toFixed(1) + '" y="' + labelY + '" font-size="8" fill="' + color + '" text-anchor="' + anchor + '">' + label + '</text>'
      + '<text x="' + tx.toFixed(1) + '" y="' + valY + '" font-size="8" font-weight="bold" fill="' + color + '" text-anchor="' + anchor + '">' + valStr + '</text>';
  }
  topMarkers.forEach(function (spec, index) { svg += marker(spec.value, spec.color, spec.label, true, topLabels[index]); });
  svg += marker(poolP, '#b8602e', 'Current pool price', false, null);
  svg += '</svg>';
  return { html: svg, maxV: maxV, W: W, padL: padL, padR: padR };
}

function lpFmtDuration(secs) {
  if (secs % 86400 === 0) return (secs / 86400) + (secs === 86400 ? ' day' : ' days');
  if (secs % 3600 === 0) return (secs / 3600) + (secs === 3600 ? ' hour' : ' hours');
  return Math.round(secs / 60) + ' minutes';
}

// Build the "exact transaction" preview payload (mirrors the Pay confirm), for openTxConfirm.
function buildAddLiquidityPayload(chainId, chainName, sym, prep) {
  var pair = prep.pair || { symbol: 'ETH', decimals: 18, isNative: true };
  // amount0Max/amount1Max are currency-ordered; map back to pair vs project token for display.
  var pairMax = prep.pairIsC0 ? prep.amount0Max : prep.amount1Max;
  var tokenMax = prep.pairIsC0 ? prep.amount1Max : prep.amount0Max;
  // Plain-language summary shown first; the decoded call + raw unlockData hex move behind "Show raw data".
  var deposit = [];
  if (tokenMax > 1n) deposit.push(formatTokens(tokenMax) + ' ' + sym);
  if (pairMax > 1n) deposit.push(formatBalance(pairMax, pair.decimals, pair.symbol));
  var approvalRows = (prep.erc20 || []).map(function (s) {
    var label = (s.currency || '').toLowerCase() === (pair.addr || '').toLowerCase() ? pair.symbol : sym;
    return [label + ' approval', s.approved && s.permitReady ? 'already set — no approval step will run'
      : s.approved ? 'token allowance reused — only the Permit2 step remains'
      : 'runs before the mint'];
  });
  return {
    summary: {
      action: 'Add liquidity to the ' + sym + '/' + pair.symbol + ' pool',
      rows: [
        ['Deposit up to', deposit.join(' + ') + ' — the mint pulls only what the position needs'],
        prep.pa > 0 && prep.pb > prep.pa ? ['Price range', formatPrice(prep.pa) + ' – ' + formatPrice(prep.pb) + ' ' + pair.symbol + ' per ' + sym] : null,
        ['Position NFT to', prep.acct],
        ['Mint deadline', lpFmtDuration(lpDeadlineSecs(prep)) + (prep.smartWallet ? ' — survives a multisig signing queue' : '')],
      ].concat(approvalRows).filter(Boolean),
    },
    chain: chainName,
    chainId: chainId,
    contract: 'Uniswap V4 PositionManager',
    address: prep.posm,
    'function': 'modifyLiquidities',
    txlinkUnavailableReason: 'The final liquidity calldata may include Permit2 signatures bound to the connected wallet, so it does not exist before confirmation.',
    value: prep.value > 0n ? (prep.value.toString() + ' wei (' + formatEth(prep.value) + ')') : '0',
    erc20Approvals: (prep.erc20 || []).map(function (s) {
      return { token: s.currency, via: 'Permit2', spender: prep.posm, amount: s.max.toString(),
        status: s.approved && s.permitReady ? 'already approved — no approval step will run'
          : s.approved ? 'token allowance already set (reused) — only the Permit2 approval step remains'
          : 'approval will run first' };
    }),
    position: {
      actions: pair.isNative ? 'MINT_POSITION, CLOSE, CLOSE, SWEEP (0x02121214)' : 'MINT_POSITION, CLOSE, CLOSE (0x021212)',
      poolFee: Number(prep.key.fee),
      hooks: prep.key.hooks,
      tickLower: prep.tickLower,
      tickUpper: prep.tickUpper,
      liquidity: prep.liquidity.toString(),
      ['max' + pair.symbol]: formatBalance(pairMax, pair.decimals, pair.symbol),
      maxToken: formatTokens(tokenMax) + ' ' + sym,
      recipient: prep.acct,
    },
    args: { unlockData: prep.unlockData, deadline: 'set at signing (~' + lpFmtDuration(lpDeadlineSecs(prep)) + ')' },
  };
}

export function buildAddLiquidityModal(project) {
  var sym = project.tokenSymbol || 'tokens';
  var wrap = el('div', 'modal-body');
  var lpChains = (project.chains || []).filter(function (c) { return POSITION_MANAGER_BY_CHAIN[c.id] && POOL_MANAGER_BY_CHAIN[c.id]; });
  if (!lpChains.length) {
    var n = el('div', 'modal-status'); n.textContent = 'No Uniswap V4 position manager on this project’s chains.'; wrap.appendChild(n); return wrap;
  }
  // Issuance ceiling = base-currency units per project token at the current issuance weight (the top of
  // the AMM band). Pool price and the cash-out floor are PAIR-token units — when the ruleset's base
  // currency differs, the ceiling converts through JBPrices before seeding the default range; with no
  // feed it's dropped (0) so lpDefaultRange widens around the pool price instead of consuming a
  // wrong-unit bound.
  var weight = project.ruleset ? Number(project.ruleset.weight) : 0;
  var ceilingBase = weight > 0 ? 1e18 / weight : 0;
  var ceiling = issuancePairUnitMismatch(project) ? 0 : ceilingBase;
  // ethBal holds the PAIR-token balance (native ETH or USDC); pair is the resolved accounting/pair token.
  var state = { chainId: lpChains[0].id, poolP: 0, floor: 0, ceiling: ceiling, revBal: null, ethBal: null, driver: null, pair: null, mode: 'amounts' };
  if (ceilingBase > 0 && ceiling === 0) {
    readIssuancePairRate(project, state.chainId).then(function (rate) {
      if (!rate) return; // no feed — keep the widened default range
      ceiling = ceilingBase * rate;
      state.ceiling = ceiling;
      if (state.pair) refreshPrice(); // re-seed the defaults now the economic corridor is known
    });
  }
  function pairSym() { return state.pair ? state.pair.symbol : 'accounting token'; }
  function pairDec() { return state.pair ? state.pair.decimals : 18; }

  var intro = el('div', 'modal-balance');
  intro.textContent = 'Add tokens to the trading pool so payments can buy existing project tokens. The pool’s current price sets the ratio of tokens you add.';
  wrap.appendChild(intro);

  // Your balance per chain, boxed at the top (like the cash out modal). Add-liquidity skips project balances.
  var balTable = el('div', 'cashout-bal-table'); wrap.appendChild(balTable);
  renderBalanceTables(balTable, project, sym, { skipProjectBalances: true });

  var chainRow = el('div', 'ops-chainrow');
  var chainSel = opsChainSelect(project, function (cid) { state.chainId = cid; refreshPair(); }, { chains: lpChains });
  chainRow.appendChild(chainSel);
  wrap.appendChild(chainRow);

  // Slim line for the pair token (ETH/USDC) balance — the table above covers the project token.
  var balLine = el('div', 'modal-balance'); balLine.style.marginTop = '8px'; wrap.appendChild(balLine);
  var priceLine = el('div', 'modal-balance'); wrap.appendChild(priceLine);

  // Number-line of where the selected range sits relative to floor / pool price / issuance ceiling.
  var graphWrap = el('div', 'lp-graph'); wrap.appendChild(graphWrap);
  var graphHolder = el('div', 'lp-graph-holder'); graphWrap.appendChild(graphHolder);
  var graphTip = el('div', 'lp-graph-tip'); graphTip.style.display = 'none'; graphWrap.appendChild(graphTip);
  var graphScale = null;
  // Hover anywhere on the range bar to read the price at that point (mapping cursor x → pair-token value).
  graphWrap.addEventListener('mousemove', function (e) {
    if (!graphScale || !graphScale.maxV) { graphTip.style.display = 'none'; return; }
    var rect = graphHolder.getBoundingClientRect();
    if (rect.width <= 0) return;
    var svgX = (e.clientX - rect.left) / rect.width * graphScale.W;
    var span = graphScale.W - graphScale.padL - graphScale.padR;
    var value = span > 0 ? (svgX - graphScale.padL) / span * graphScale.maxV : 0;
    if (!(value > 0)) { graphTip.style.display = 'none'; return; }
    graphTip.textContent = '≈ ' + formatPrice(value) + ' ' + pairSym() + ' / ' + sym;
    graphTip.style.display = '';
    graphTip.style.left = Math.max(2, Math.min(rect.width - 110, e.clientX - rect.left + 8)) + 'px';
    // Signal that the range ends are draggable when the cursor is over one.
    var rr = currentRange();
    var near = state.mode === 'range' && rr.pa > 0 && rr.pb > rr.pa
      && Math.min(Math.abs(value - rr.pa), Math.abs(value - rr.pb)) <= graphScale.maxV * 14 / graphScale.W;
    graphWrap.style.cursor = near || dragEdge ? 'ew-resize' : '';
  });
  graphWrap.addEventListener('mouseleave', function () { graphTip.style.display = 'none'; });

  // Drag either end of the range bar. Reuses the hover tip's x -> price mapping; the scale is
  // frozen for the duration so an edge pulled outward doesn't slide away from the pointer.
  var dragEdge = null, dragScale = null;
  function graphValueAt(clientX, scale) {
    var rect = graphHolder.getBoundingClientRect();
    if (rect.width <= 0 || !scale || !scale.maxV) return null;
    var span = scale.W - scale.padL - scale.padR;
    if (!(span > 0)) return null;
    return ((clientX - rect.left) / rect.width * scale.W - scale.padL) / span * scale.maxV;
  }
  graphWrap.addEventListener('pointerdown', function (e) {
    if (state.mode !== 'range' || !graphScale || !graphScale.maxV) return;
    var r = currentRange();
    if (!(r.pa > 0) || !(r.pb > r.pa)) return;
    var at = graphValueAt(e.clientX, graphScale);
    if (at == null) return;
    // Grab whichever end is nearer, but only from within ~14px of it.
    var grab = graphScale.maxV * 14 / graphScale.W;
    var edge = Math.abs(at - r.pa) <= Math.abs(at - r.pb) ? 'pa' : 'pb';
    if (Math.abs(at - r[edge]) > grab) return;
    e.preventDefault();
    dragEdge = edge; dragScale = graphScale;
    if (graphWrap.setPointerCapture) graphWrap.setPointerCapture(e.pointerId);
  });
  graphWrap.addEventListener('pointermove', function (e) {
    if (!dragEdge) return;
    var raw = graphValueAt(e.clientX, dragScale);
    if (raw == null) return;
    var r = currentRange();
    // Keep the ends ordered with a sliver of daylight between them.
    var gap = dragScale.maxV / 400;
    var next = dragEdge === 'pa' ? Math.min(raw, r.pb - gap) : Math.max(raw, r.pa + gap);
    if (!(next > 0)) return;
    (dragEdge === 'pa' ? minInput : maxInput).value = lpTrimNum(next);
    onRangeChange();
    // onRangeChange redraws with a fresh scale; keep dragging against the frozen one.
    graphScale = dragScale;
  });
  function endGraphDrag() { dragEdge = null; dragScale = null; drawGraph(); }
  graphWrap.addEventListener('pointerup', endGraphDrag);
  graphWrap.addEventListener('pointercancel', endGraphDrag);

  // Sizing mode: "By amounts" (default — type both deposits, the range is solved around them) or
  // "By price range" (pick the range, the counterpart amount follows).
  var modeRow = el('div', 'chain-pills-row'); modeRow.style.marginTop = '8px'; wrap.appendChild(modeRow);
  var modeAmountsBtn = el('button', 'chain-pill'); modeAmountsBtn.type = 'button'; modeAmountsBtn.textContent = 'By amounts'; modeRow.appendChild(modeAmountsBtn);
  var modeFullBtn = el('button', 'chain-pill'); modeFullBtn.type = 'button'; modeFullBtn.textContent = 'Full range'; modeRow.appendChild(modeFullBtn);
  var modeRangeBtn = el('button', 'chain-pill'); modeRangeBtn.type = 'button'; modeRangeBtn.textContent = 'By price range'; modeRow.appendChild(modeRangeBtn);
  modeAmountsBtn.addEventListener('click', function () { setMode('amounts'); });
  modeFullBtn.addEventListener('click', function () { setMode('full'); });
  modeRangeBtn.addEventListener('click', function () { setMode('range'); });

  var lblR = el('div', 'modal-label'); lblR.textContent = 'Price range (ETH per ' + sym + ')'; wrap.appendChild(lblR);
  var rnote = el('div', 'modal-balance'); rnote.textContent = 'Defaults span the current cash out reference and token creation price.'; wrap.appendChild(rnote);
  var rangeRow = el('div', 'ops-rangerow');
  var minField = el('div', 'ops-field ops-field--grow');
  var minInput = el('input', 'ops-amount'); minInput.type = 'number'; minInput.step = 'any'; minInput.placeholder = 'Min'; minField.appendChild(minInput);
  rangeRow.appendChild(minField);
  var toSpan = el('span', 'ops-between'); toSpan.textContent = 'to'; rangeRow.appendChild(toSpan);
  var maxField = el('div', 'ops-field ops-field--grow');
  var maxInput = el('input', 'ops-amount'); maxInput.type = 'number'; maxInput.step = 'any'; maxInput.placeholder = 'Max'; maxField.appendChild(maxInput);
  rangeRow.appendChild(maxField);
  wrap.appendChild(rangeRow);
  var rangeReadout = el('div', 'modal-balance'); rangeReadout.style.display = 'none'; wrap.appendChild(rangeReadout);
  minInput.addEventListener('input', onRangeChange);
  maxInput.addEventListener('input', onRangeChange);

  // Token + ETH amounts — editing one auto-fills the other at the current price within the range.
  // Both sides share one row (two columns).
  var addGrid = el('div', 'lp-add-grid'); wrap.appendChild(addGrid);
  var tokCol = el('div', 'lp-add-col'); addGrid.appendChild(tokCol);
  var tokHead = el('div', 'lp-add-head'); tokCol.appendChild(tokHead);
  var lbl1 = el('div', 'modal-label'); lbl1.textContent = sym + ' to add'; tokHead.appendChild(lbl1);
  var tokMax = el('button', 'lp-max'); tokMax.textContent = 'Max'; tokHead.appendChild(tokMax);
  var tokField = el('div', 'ops-field ops-field--grow');
  var tokAmt = el('input', 'ops-amount'); tokAmt.type = 'number'; tokAmt.step = 'any'; tokAmt.placeholder = '0.00'; tokField.appendChild(tokAmt);
  var tu = el('span', 'ops-unit'); tu.textContent = sym; tokField.appendChild(tu); tokCol.appendChild(tokField);

  var ethCol = el('div', 'lp-add-col'); addGrid.appendChild(ethCol);
  var ethHead = el('div', 'lp-add-head'); ethCol.appendChild(ethHead);
  var lbl2 = el('div', 'modal-label'); lbl2.textContent = 'ETH to add'; ethHead.appendChild(lbl2);
  var ethMax = el('button', 'lp-max'); ethMax.textContent = 'Max'; ethHead.appendChild(ethMax);
  var ethField = el('div', 'ops-field ops-field--grow');
  var ethAmt = el('input', 'ops-amount'); ethAmt.type = 'number'; ethAmt.step = 'any'; ethAmt.placeholder = '0.00'; ethField.appendChild(ethAmt);
  var eu = el('span', 'ops-unit'); eu.textContent = 'ETH'; ethField.appendChild(eu); ethCol.appendChild(ethField);

  var pairNote = el('div', 'modal-balance'); pairNote.style.marginTop = '6px';
  wrap.appendChild(pairNote);
  var sideNote = el('div', 'modal-balance'); sideNote.style.marginTop = '4px'; sideNote.style.color = '#b8602e'; sideNote.style.display = 'none';
  wrap.appendChild(sideNote);

  // Re-label everything that names the pair token (range unit, second amount, ratio note) once it's known.
  function applyPairLabels() {
    var ps = pairSym();
    lblR.textContent = 'Price range (' + ps + ' per ' + sym + ')';
    lbl2.textContent = ps + ' to add';
    eu.textContent = ps;
    if (state.mode !== 'amounts') {
      pairNote.textContent = 'Enter either amount; the other is calculated at the pool price. Near Min uses more '
        + sym + '; near Max uses more ' + ps + '.';
    }
  }
  applyPairLabels();

  function onAmountInput(side) {
    if (state.mode === 'amounts') { solveAmounts(); return; }
    state.driver = side;
    autofill();
  }
  tokAmt.addEventListener('input', function () { onAmountInput('tok'); });
  ethAmt.addEventListener('input', function () { onAmountInput('eth'); });
  tokMax.addEventListener('click', function () {
    if (state.revBal == null) { connect(); return; }
    tokAmt.value = formatAmount(state.revBal, 18); onAmountInput('tok');
  });
  ethMax.addEventListener('click', function () {
    if (!state.pair) { status.textContent = 'Accounting token is still loading.'; return; }
    if (state.ethBal == null) { connect(); return; }
    // Keep ~0.001 ETH for gas only when the pair IS native ETH; an ERC-20 pair (USDC) can go to the brim.
    var buf = state.pair.isNative ? 1000000000000000n : 0n;
    var v = state.ethBal > buf ? state.ethBal - buf : 0n;
    ethAmt.value = formatAmount(v, pairDec()); onAmountInput('eth');
  });

  // Amounts mode: both deposits are free-typed; the solved range feeds the same inputs, graph, and
  // submit path the range mode uses.
  function solveAmounts() {
    var t = parseFloat(tokAmt.value); t = t > 0 ? t : 0;
    var e = parseFloat(ethAmt.value); e = e > 0 ? e : 0;
    var solved = state.poolP > 0
      ? lpSolveRangeFromAmounts({ price: state.poolP, tokenAmount: t, pairAmount: e, floorHint: state.floor, ceilingHint: ceiling })
      : null;
    if (solved) {
      minInput.value = lpTrimNum(solved.minPrice);
      maxInput.value = lpTrimNum(solved.maxPrice);
      rangeReadout.textContent = 'Price range: ' + formatPrice(solved.minPrice) + ' to ' + formatPrice(solved.maxPrice) + ' ' + pairSym() + ' per ' + sym + '.';
    } else {
      rangeReadout.textContent = '';
    }
    pairNote.textContent = lpAmountsModeNote({
      tokenAmount: t, pairAmount: e, solved: solved,
      floorHint: state.floor, ceilingHint: ceiling,
      tokenSymbol: sym, pairSymbol: pairSym(),
    });
    drawGraph();
  }

  // Full-range mode presets bounds spanning the whole curve; the classic counterpart autofill over
  // that span then couples the amounts at the v2 pool ratio.
  function applyFullRange() {
    var bounds = lpFullRangeBounds(state.poolP);
    if (bounds) {
      minInput.value = lpTrimNum(bounds.minPrice);
      maxInput.value = lpTrimNum(bounds.maxPrice);
    }
    pairNote.textContent = 'Your liquidity works at every price, like a classic v2 pool. Enter either amount; the other follows at the pool price.';
    autofill();
  }

  function setMode(mode) {
    state.mode = mode;
    modeAmountsBtn.classList.toggle('selected', mode === 'amounts');
    modeFullBtn.classList.toggle('selected', mode === 'full');
    modeRangeBtn.classList.toggle('selected', mode === 'range');
    var hideRange = mode !== 'range';
    lblR.style.display = hideRange ? 'none' : '';
    rnote.style.display = hideRange ? 'none' : '';
    rangeRow.style.display = hideRange ? 'none' : '';
    graphWrap.style.display = mode === 'full' ? 'none' : '';
    rangeReadout.style.display = mode === 'amounts' ? '' : 'none';
    if (mode === 'range') {
      applyPairLabels();
      onRangeChange();
      return;
    }
    tokAmt.disabled = false; ethAmt.disabled = false;
    tokCol.style.opacity = ''; ethCol.style.opacity = '';
    tokMax.style.visibility = ''; ethMax.style.visibility = '';
    sideNote.style.display = 'none'; sideNote.textContent = '';
    if (mode === 'amounts') solveAmounts();
    else applyFullRange();
  }

  // Execution deadline: how long the signed/queued mint stays executable before it reverts as stale. Price
  // protection comes from the bounded max amounts, not from this — a long deadline only lets a queued tx wait.
  var dlRow = el('div', 'ops-chainrow'); dlRow.style.marginTop = '8px';
  var dlLab = el('span', 'modal-balance'); dlLab.textContent = 'Execution deadline';
  var dlSel = el('select', 'field create-input'); dlSel.style.width = 'auto'; dlSel.style.minWidth = '0';
  [['', 'Auto — 20 min (30 days from a multisig)'], ['1200', '20 minutes'], ['3600', '1 hour'], ['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days']].forEach(function (o) {
    var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; dlSel.appendChild(op);
  });
  dlSel.title = 'The mint reverts if executed after this. Price protection comes from the bounded max amounts, not the deadline.';
  dlRow.appendChild(dlLab); dlRow.appendChild(dlSel);
  wrap.appendChild(dlRow);
  // Resolve the Auto label to what it will actually pick for the connected account (EOA vs multisig).
  function updateDlAuto() {
    var acct = getAccount && getAccount(), cid = state.chainId;
    if (!acct) { dlSel.options[0].textContent = 'Auto — 20 min (30 days from a multisig)'; return; }
    lpIsSmartWallet(cid, acct).then(function (smart) {
      if (state.chainId !== cid || !getAccount() || getAccount().toLowerCase() !== acct.toLowerCase()) return;
      dlSel.options[0].textContent = smart ? 'Auto — 30 days (multisig connected)' : 'Auto — 20 minutes';
    });
  }

  var status = el('div', 'modal-status'); wrap.appendChild(status);
  var foot = el('div', 'modal-foot');
  var btn = document.createElement('button'); btn.className = 'modal-submit'; btn.textContent = 'Add liquidity';
  foot.appendChild(btn); wrap.appendChild(foot);

  function currentRange() {
    var pa = parseFloat(minInput.value), pb = parseFloat(maxInput.value);
    return { pa: pa > 0 ? pa : 0, pb: pb > 0 ? pb : 0 };
  }
  function drawGraph() {
    var r = currentRange();
    var g = renderLpRangeSvg(state.floor, state.ceiling, state.poolP, r.pa, r.pb);
    graphHolder.innerHTML = g.html;
    graphScale = g.maxV ? g : null;
  }
  // Which token(s) the position actually needs at the current price + range. At/above the range top the position is
  // single-sided in the PAIR (USDC/ETH); at/below the bottom it's single-sided in the project token; strictly inside,
  // both. Order-independent: lpCounterpart returns 0/null on these same boundaries regardless of pool token ordering.
  function activeSides(r) {
    var p = state.poolP;
    if (!(p > 0) || !(r.pa > 0) || !(r.pb > r.pa)) return { tok: true, eth: true };
    if (p >= r.pb) return { tok: false, eth: true };   // all pair — the project token isn't part of the position here
    if (p <= r.pa) return { tok: true, eth: false };   // all project token — the pair isn't part of the position here
    return { tok: true, eth: true };
  }
  // Enable only the side(s) the position needs; disable + zero the other so typing there can't clear the active side.
  function applySides() {
    var s = activeSides(currentRange());
    tokAmt.disabled = !s.tok; ethAmt.disabled = !s.eth;
    tokCol.style.opacity = s.tok ? '' : '0.45'; ethCol.style.opacity = s.eth ? '' : '0.45';
    tokMax.style.visibility = s.tok ? '' : 'hidden'; ethMax.style.visibility = s.eth ? '' : 'hidden';
    if (!s.tok) tokAmt.value = '0';
    if (!s.eth) ethAmt.value = '0';
    if (s.tok && s.eth) { sideNote.style.display = 'none'; sideNote.textContent = ''; }
    else {
      sideNote.style.display = '';
      sideNote.textContent = s.eth
        ? 'At the current price (top of your range) the position is single-sided ' + pairSym() + ' — add ' + pairSym() + ' only. To seed ' + sym + ', the pool price has to be lower within your range (move the price down with a swap, or widen the range).'
        : 'At the current price (bottom of your range) the position is single-sided ' + sym + ' — add ' + sym + ' only. To seed ' + pairSym() + ', the pool price has to be higher within your range.';
    }
  }
  function autofill() {
    var r = currentRange();
    var s = activeSides(r);
    // Single-sided: the inactive side is 0; leave the active side's user-entered amount alone (no counterpart to fill).
    if (!(s.tok && s.eth)) { if (!s.tok) tokAmt.value = '0'; if (!s.eth) ethAmt.value = '0'; return; }
    if (state.driver === 'eth') {
      var eth = parseFloat(ethAmt.value);
      if (!(eth > 0)) { tokAmt.value = ''; return; }
      var tok = lpCounterpart(eth, true, state.poolP, r.pa, r.pb);
      if (tok != null) tokAmt.value = lpTrimNum(tok);
    } else if (state.driver === 'tok') {
      var t = parseFloat(tokAmt.value);
      if (!(t > 0)) { ethAmt.value = ''; return; }
      var e = lpCounterpart(t, false, state.poolP, r.pa, r.pb);
      if (e != null) ethAmt.value = lpTrimNum(e);
    }
  }
  function onRangeChange() {
    if (state.mode === 'amounts') { solveAmounts(); return; }
    if (state.mode === 'full') { applyFullRange(); return; }
    drawGraph(); applySides(); autofill();
  }

  // Resolve the pair (accounting) token for the selected chain, then refresh labels, balances, and price.
  var pairSeq = 0;
  var lpBalanceSeq = 0;
  var lpPriceSeq = 0;
  function refreshPair() {
    var cid = state.chainId, seq = ++pairSeq;
    ++lpBalanceSeq; ++lpPriceSeq;
    state.pair = null; state.revBal = null; state.ethBal = null;
    state.poolP = 0; state.floor = 0;
    btn.disabled = true; balLine.textContent = 'Loading the verified accounting token…'; priceLine.textContent = '';
    lpPairFor(project, cid).then(function (p) {
      if (seq !== pairSeq || state.chainId !== cid) return;
      if (!p) throw new Error('Could not resolve the project’s accounting token.');
      state.pair = p; applyPairLabels();
      btn.disabled = true; status.textContent = '';
      refreshBalances(); refreshPrice();
    }).catch(function () {
      if (seq !== pairSeq || state.chainId !== cid) return;
      state.pair = null; btn.disabled = true;
      balLine.textContent = 'Could not verify the project’s accounting token on this chain.';
    });
  }

  function refreshBalances() {
    if (!state.pair) return;
    var cid = state.chainId, pair = state.pair, seq = ++lpBalanceSeq;
    var acct = getEffectiveAccount();
    updateDlAuto();
    if (!acct) { balLine.textContent = ''; state.revBal = null; state.ethBal = null; return; }
    balLine.textContent = 'Your ' + pairSym() + ': …';
    var pairTokenAddr = pair.isNative ? NATIVE_TOKEN : pair.addr;
    Promise.all([readUserBalance(project, cid), readWalletTokenBalance(cid, pairTokenAddr, acct)]).then(function (r) {
      if (seq !== lpBalanceSeq || state.chainId !== cid || state.pair !== pair || !getEffectiveAccount() || getEffectiveAccount().toLowerCase() !== acct.toLowerCase()) return;
      state.revBal = r[0]; state.ethBal = r[1];
      balLine.textContent = 'Your ' + pair.symbol + ': ' + (r[1] != null ? formatBalance(r[1], pair.decimals, pair.symbol) : '—');
    });
  }

  function refreshPrice() {
    if (!state.pair) return;
    var cid = state.chainId, pair = state.pair, seq = ++lpPriceSeq;
    priceLine.textContent = 'Pool price: …';
    Promise.all([readAmmPrice(project, cid), readCashoutPrice(project, cid)]).then(function (res) {
      if (seq !== lpPriceSeq || state.chainId !== cid || state.pair !== pair) return;
      var amm = res[0], floor = res[1];
      state.poolP = (amm && amm > 0) ? amm : 0;
      state.floor = (floor && floor > 0) ? floor : 0;
      btn.disabled = !amm;
      priceLine.textContent = amm ? ('Pool price: ~' + formatPrice(amm) + ' ' + pair.symbol + ' / ' + sym) : 'Pool not initialized on this chain.';
      var poolP = state.poolP > 0 ? state.poolP : (ceiling > 0 ? ceiling / 10 : 0);
      var defaultRange = lpDefaultRange(poolP, state.floor, ceiling);
      if (defaultRange.min > 0) minInput.value = lpTrimNum(defaultRange.min);
      if (defaultRange.max > 0) maxInput.value = lpTrimNum(defaultRange.max);
      rnote.textContent = defaultRange.economic
        ? 'Defaults span the cash out reference (' + formatPrice(state.floor) + ') and token creation price.'
        : (state.floor > 0
          ? 'The floor and ceiling do not straddle the pool price. The default range is widened so both tokens can be added.'
          : 'No cash out reference yet. The default range is wider around the trading price so both tokens can be added.');
      onRangeChange();
    }).catch(function () {
      if (seq !== lpPriceSeq || state.chainId !== cid || state.pair !== pair) return;
      state.poolP = 0; state.floor = 0; btn.disabled = true;
      priceLine.textContent = 'Could not verify the current pool price.';
    });
  }

  setMode(state.mode);
  refreshPair();

  btn.addEventListener('click', function () {
    if (getViewAs()) { status.className = 'modal-status error'; status.textContent = VIEW_AS_TX_ERROR; return; }
    if (!(getAccount && getAccount())) { connect(); return; }
    if (!state.pair) { status.className = 'modal-status error'; status.textContent = 'Could not verify the project’s accounting token.'; return; }
    var cid = state.chainId;
    var inputSnapshot = [minInput.value, maxInput.value, tokAmt.value, ethAmt.value, dlSel.value].join('|');
    var pairAmount, tokenAmount;
    try { pairAmount = ethAmt.value ? parseAmount(ethAmt.value, pairDec()) : 0n; } catch (_) { status.className = 'modal-status error'; status.textContent = 'Invalid ' + pairSym() + ' amount'; return; }
    try { tokenAmount = tokAmt.value ? parseAmount(tokAmt.value, 18) : 0n; } catch (_) { status.className = 'modal-status error'; status.textContent = 'Invalid ' + sym + ' amount'; return; }
    if (pairAmount <= 0n && tokenAmount <= 0n) { status.className = 'modal-status error'; status.textContent = 'Enter an amount'; return; }
    if (state.revBal == null || state.ethBal == null) { status.className = 'modal-status error'; status.textContent = 'Wallet balances are still loading or could not be verified.'; return; }
    if (tokenAmount > state.revBal) { status.className = 'modal-status error'; status.textContent = sym + ' amount exceeds your balance.'; return; }
    if (pairAmount > state.ethBal) { status.className = 'modal-status error'; status.textContent = pairSym() + ' amount exceeds your balance.'; return; }
    var r = currentRange();
    if (!(r.pa > 0) || !(r.pb > r.pa)) { status.className = 'modal-status error'; status.textContent = 'Set a valid price range'; return; }
    btn.disabled = true;
    status.className = 'modal-status'; status.textContent = 'Preparing…';
    var lpOpts = { project: project, chainId: cid, pairAmount: pairAmount, tokenAmount: tokenAmount, pa: r.pa, pb: r.pb, deadlineSecs: dlSel.value ? Number(dlSel.value) : null };
    prepareAddLiquidity(lpOpts).then(function (prep) {
      if (state.chainId !== cid || inputSnapshot !== [minInput.value, maxInput.value, tokAmt.value, ethAmt.value, dlSel.value].join('|')
        || !state.pair || state.pair.addr !== prep.pair.addr || !getAccount() || getAccount().toLowerCase() !== prep.acct.toLowerCase()) throw new Error('Liquidity inputs or the connected account changed while the transaction was being prepared. Review and try again.');
      btn.disabled = false;
      status.textContent = '';
      var chainName = (lpChains.filter(function (c) { return c.id === cid; })[0] || {}).name || ('Chain ' + cid);
      // Show the exact transaction before signing — same confirm modal as the Pay flow.
      var lpSteps = [];
      (prep.erc20 || []).forEach(function (s) {
        var label = prep.pair && (s.currency || '').toLowerCase() === (prep.pair.addr || '').toLowerCase() ? prep.pair.symbol : sym;
        if (!s.approved) lpSteps.push('Approve ' + label + ' for Permit2');
        if (!s.permitReady) lpSteps.push(prep.smartWallet ? 'Approve ' + label + ' on Permit2' : 'Sign the ' + label + ' Permit2 approval');
      });
      lpSteps.push('Mint the position');
      // Inside the Safe App a multi-call sequence is proposed as ONE batch: preview every call with the exact
      // now/deadline the submit reuses, and replace the per-step wallet list with the single proposal.
      var payload = buildAddLiquidityPayload(cid, chainName, sym, prep);
      var plan = null;
      if (prep.smartWallet && isSafeConnected()) {
        var planNow = Math.floor(Date.now() / 1000), planDl = lpDeadlineSecs(prep);
        var planned = lpAddLiquidityCalls(prep, (prep.erc20 || []).map(function (s) { return { approve: !s.approved, permit2: !s.permitReady }; }), planNow, planDl, BigInt(planNow + planDl));
        if (planned.length > 1) {
          plan = { now: planNow, deadline: BigInt(planNow + planDl), calls: planned };
          payload.transactions = planned.map(function (c) {
            return { step: c.label, chain: chainName, chainId: cid, contract: resolveContractName(c.to, cid) || (c.to === PERMIT2_ADDRESS ? 'Permit2' : c.to === prep.posm ? 'Uniswap V4 PositionManager' : c.to),
              address: c.to, calldata: c.data, abi: c.abi, functionName: c.functionName, rawArgs: c.args, value: String(c.value) };
          });
        }
      }
      openTxConfirm(payload, function (ctx) {
        ctx.confirm.disabled = true; ctx.cancel.disabled = true;
        runAddLiquidityTxs(cid, prep, function (m, kind, meta) { ctx.showStatus(m, kind, meta); }, plan).then(function (result) {
          if (result && result.safeTxHash) {
            // A proposal, not an execution: keep the dialog up, let it close, and watch the Safe for the executed tx.
            ctx.cancel.disabled = false; ctx.cancel.textContent = 'Close';
            ctx.showStatus('Proposed to your Safe as one batch of ' + result.calls + ' calls — sign and execute it in your Safe queue. This page watches for the execution.', 'pending');
            (function watch(tries) {
              if (tries > 40) return;
              setTimeout(function () {
                txHashForSafeTx(result.safeTxHash).then(function (executed) {
                  if (!executed) { watch(tries + 1); return; }
                  ctx.modal.close();
                  status.className = 'modal-status success';
                  status.innerHTML = '';
                  status.appendChild(document.createTextNode('Liquidity added | TX: '));
                  status.appendChild(renderExplorerTxLink(cid, executed, truncAddr(executed)));
                  noteLocalLpWrite(cid, prep.poolId);
                  refreshBalances(); refreshPrice();
                });
              }, 15000);
            })(1);
            return;
          }
          var hash = result;
          ctx.modal.close();
          status.className = 'modal-status success';
          status.innerHTML = '';
          status.appendChild(document.createTextNode('Liquidity added | TX: '));
          status.appendChild(renderExplorerTxLink(cid, hash, truncAddr(hash)));
          noteLocalLpWrite(cid, prep.poolId);
          refreshBalances(); refreshPrice();
        }).catch(function (e) {
          ctx.confirm.disabled = false; ctx.cancel.disabled = false;
          if (e && e.txStatusKind === 'pending') {
            ctx.showStatus(e.message, 'pending');
            // Watch the step's on-chain effect for up to ~10 min so an executed Safe tx flips the stale
            // "waiting for co-signers" state into a clear "continue" prompt.
            if (e.recheck) (function watch(tries) {
              if (tries > 40) return;
              setTimeout(function () {
                e.recheck().then(function (ok) {
                  if (ok) ctx.showStatus('Your multisig executed this step — click Confirm & add liquidity to continue.', 'success');
                  else watch(tries + 1);
                }, function () { watch(tries + 1); });
              }, 15000);
            })(1);
            return;
          }
          var msg = errMessage(e, 'Add liquidity failed');
          ctx.showStatus(msg.length > 160 ? msg.slice(0, 160) + '…' : msg, 'error');
        });
      }, {
        title: 'Confirm add liquidity', confirmText: plan ? 'Confirm & propose batch' : 'Confirm & add liquidity', closeOnConfirm: false,
        sequenceSteps: plan ? ['Propose the batch to your Safe'] : lpSteps,
        sequenceIntro: plan ? 'Goes to your Safe as one batch of ' + plan.calls.length + ' calls: approved once, executed together.' : undefined,
        description: plan ? 'Execute the batch within days of queueing it: the mint’s price-drift headroom and its 30-day approvals are finite. Already-queued steps are detected and refused, so a second confirm never double-proposes.'
          : prep.smartWallet
          ? 'Multisig detected: this runs as up to 3 sequential Safe transactions (token approval → Permit2 approval → mint), each proposed here and executed from your Safe queue. If you leave while one is pending, come back and confirm again — completed and already-queued steps are detected and skipped. Execute the mint within days of queueing it: its price-drift headroom and 30-day approvals are finite.'
          : undefined,
      });
    }).catch(function (e) {
      btn.disabled = false;
      status.className = 'modal-status error';
      var msg = errMessage(e, 'Could not prepare');
      status.textContent = msg.length > 160 ? msg.slice(0, 160) + '…' : msg;
    });
  });
  return wrap;
}
