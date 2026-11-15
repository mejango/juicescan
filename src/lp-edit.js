// Edit a Uniswap V4 position in ONE transaction: set what it should hold and, optionally, the band it covers.
// The rule juicebox.money follows (src/lib/edit-liquidity.ts), ported by hand so both sites build the same call;
// test/lp-edit.test.js pins every kind to that function's output. Pure: no wallet, no reads.
//
// Target amounts are ceilings: the band and the current price fix the ratio, so the position ends up holding at
// most the target on each side. Which actions run depends on what changed:
//   same band, more liquidity  INCREASE_LIQUIDITY + CLOSE x2 [+ SWEEP]: the wallet funds the difference, with 1%
//                              price headroom in the maxima.
//   same band, less liquidity  DECREASE_LIQUIDITY + TAKE_PAIR: the freed share returns behind 95% floors.
//   new band                   BURN_POSITION + MINT_POSITION + SETTLE per funded currency + TAKE_PAIR: the burn funds the mint inside
//                              the unlock; only the difference touches the wallet, in either direction.
//   nothing on either side     BURN_POSITION + TAKE_PAIR: the full exit.
// Every path reverts as a whole if the live price outruns the reviewed maxima or floors.

import { encodeAbiParameters, encodeFunctionData, formatUnits, parseUnits } from 'viem';
import { el, errMessage, openPendingReview } from './component-base.js';
import {
  POSITION_MANAGER_BY_CHAIN, chainNameOf, formatBalance, formatPrice, formatTokens, lpApprovalRows, lpBandPricesOf, lpConfirmAndSend,
  lpGetAmountsForLiquidity, lpGetLiquidityForAmounts, lpMintPlan, lpPositionManagerAbi, lpSqrtAtTick,
  lpSafeBatchPreview, lpWithAllowanceFlags, noteLocalLpWrite, openModal, readWalletTokenBalance, refreshLpPositionForRemoval, runAddLiquidityTxs,
} from './discover.js';
import { quotedOutputFloor } from './slippage.js';

var MODIFY = [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }];
var BURN = [{ type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }];
var MINT = [
  { type: 'tuple', components: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }] },
  { type: 'int24' }, { type: 'int24' }, { type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'address' }, { type: 'bytes' },
];

function floor95(amount) { return quotedOutputFloor(amount, 9500); }

// A MINT_POSITION's parameters for a sized mint ({ tickLower, tickUpper, liquidity, amount0Max, amount1Max }).
export function lpMintParams(key, mint, account) {
  return encodeAbiParameters(MINT, [
    [key.currency0, key.currency1, Number(key.fee), Number(key.tickSpacing), key.hooks],
    mint.tickLower, mint.tickUpper, mint.liquidity, mint.amount0Max, mint.amount1Max, account, '0x',
  ]);
}

// Settlement the wallet may fund: close both currencies, and sweep unused native value back.
export function lpCloseActions(pool, account, value) {
  var key = pool.key;
  var parameters = [encodeAbiParameters([{ type: 'address' }], [key.currency0]), encodeAbiParameters([{ type: 'address' }], [key.currency1])];
  if (value > 0n) parameters.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [pool.pairIsC0 ? key.currency0 : key.currency1, account]));
  return { actions: value > 0n ? '121214' : '1212', parameters: parameters };
}

// Settlement of a plan that burns one band to mint another. The mint's maxima bound what the mint takes in, not what
// the wallet pays once the burn's return is counted, so closing the net would let a price move pull more than was
// reviewed. This pays in exactly the reviewed caps (SETTLE, payer is the caller) and takes everything left over
// (TAKE_PAIR), which reverts when a currency is still owed: the wallet can never pay more than the caps.
// value: the native cap; erc20: [{ currency, max }] caps.
export function lpCappedClose(pool, account, value, erc20) {
  var key = pool.key, actions = '', parameters = [];
  [key.currency0, key.currency1].forEach(function (currency) {
    var approved = erc20.find(function (entry) { return entry.currency.toLowerCase() === currency.toLowerCase(); });
    var cap = /^0x0{40}$/.test(currency) ? value : approved ? approved.max : 0n;
    if (cap <= 0n) return;
    actions += '0b';
    parameters.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [currency, cap, true]));
  });
  parameters.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }], [key.currency0, key.currency1, account]));
  return { actions: actions + '11', parameters: parameters };
}

export function lpEncodeUnlock(actions, parameters) {
  return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], ['0x' + actions, parameters]);
}

// One position's edit as bare V4 actions, before settlement.
// pool: { key, sqrtP, pair: { decimals, isNative }, pairIsC0 }
// position: { tokenId, liquidity, tickLower, tickUpper, pairAmount, tokenAmount } as read at the pool's sqrtP
// target: { pairAmount, tokenAmount }; range: null keeps the band, { pa, pb } (pair per token) re-mints it.
export function lpEditOperations(pool, position, target, range, account) {
  if (target.pairAmount < 0n || target.tokenAmount < 0n) throw new Error('Enter a valid amount.');
  var key = pool.key, sqrtP = pool.sqrtP, pairIsC0 = pool.pairIsC0;
  var byCurrency = function (pairAmount, tokenAmount) { return pairIsC0 ? { amount0: pairAmount, amount1: tokenAmount } : { amount0: tokenAmount, amount1: pairAmount }; };
  var byPair = function (amounts) { return pairIsC0 ? { pair: amounts.amount0, token: amounts.amount1 } : { pair: amounts.amount1, token: amounts.amount0 }; };
  var nativeIsC0 = pairIsC0 && pool.pair.isNative, nativeIsC1 = !pairIsC0 && pool.pair.isNative;
  var tokenId = BigInt(position.tokenId);
  var base = function (more) {
    return Object.assign({
      tokenId: tokenId, liquidityBefore: position.liquidity, tickLower: position.tickLower, tickUpper: position.tickUpper,
      liquidityDelta: 0n, pairFunding: 0n, tokenFunding: 0n, value: 0n, erc20: [], pairMinimum: 0n, tokenMinimum: 0n,
      amount0Max: 0n, amount1Max: 0n,
    }, more);
  };
  var burnParams = function (pairMinimum, tokenMinimum) {
    return encodeAbiParameters(BURN, [tokenId, pairIsC0 ? pairMinimum : tokenMinimum, pairIsC0 ? tokenMinimum : pairMinimum, '0x']);
  };

  if (target.pairAmount <= 0n && target.tokenAmount <= 0n) {
    var exitPair = floor95(position.pairAmount), exitToken = floor95(position.tokenAmount);
    return base({
      kind: 'remove', actions: '03', parameters: [burnParams(exitPair, exitToken)], liquidity: 0n,
      pairHolding: 0n, tokenHolding: 0n, pairFlow: -position.pairAmount, tokenFlow: -position.tokenAmount,
      pairMinimum: exitPair, tokenMinimum: exitToken,
    });
  }

  if (range === null) {
    var sqrtA = lpSqrtAtTick(position.tickLower), sqrtB = lpSqrtAtTick(position.tickUpper);
    var wanted = byCurrency(target.pairAmount, target.tokenAmount);
    var targetLiquidity = lpGetLiquidityForAmounts(sqrtP, sqrtA, sqrtB, wanted.amount0, wanted.amount1);
    if (targetLiquidity <= 0n) {
      // In range, both sides are needed: a zero on one side is a band that cannot hold what was asked.
      throw new Error(target.pairAmount <= 0n || target.tokenAmount <= 0n
        ? 'At the current price this band holds both ' + (pool.pair.symbol || 'the pair token') + ' and the project token. Set both, or move the band to one side of the price to hold one of them only.'
        : 'Amounts are too small for this band.');
    }
    // Holdings come from liquidity with rounding, so an untouched target can land a hair off; that is not an edit.
    var drift = targetLiquidity > position.liquidity ? targetLiquidity - position.liquidity : position.liquidity - targetLiquidity;
    if (drift * 1000000n <= position.liquidity) throw new Error('This leaves the position as it is.');
    var holding = byPair(lpGetAmountsForLiquidity(sqrtP, sqrtA, sqrtB, targetLiquidity));
    if (targetLiquidity > position.liquidity) {
      var added = targetLiquidity - position.liquidity;
      var required = lpGetAmountsForLiquidity(sqrtP, sqrtA, sqrtB, added);
      var max0 = required.amount0 + required.amount0 / 100n + 1n, max1 = required.amount1 + required.amount1 / 100n + 1n;
      var erc20 = [];
      if (!nativeIsC0 && max0 > 1n) erc20.push({ currency: key.currency0, max: max0 });
      if (!nativeIsC1 && max1 > 1n) erc20.push({ currency: key.currency1, max: max1 });
      var pull = byPair(required), funding = byPair({ amount0: max0, amount1: max1 });
      return base({
        kind: 'increase', actions: '00', parameters: [encodeAbiParameters(MODIFY, [tokenId, added, max0, max1, '0x'])],
        liquidity: targetLiquidity, liquidityDelta: added, pairHolding: holding.pair, tokenHolding: holding.token,
        pairFlow: pull.pair, tokenFlow: pull.token, pairFunding: funding.pair, tokenFunding: funding.token,
        value: nativeIsC0 ? max0 : nativeIsC1 ? max1 : 0n, erc20: erc20, amount0Max: max0, amount1Max: max1,
      });
    }
    var freedLiquidity = position.liquidity - targetLiquidity;
    var freed = lpGetAmountsForLiquidity(sqrtP, sqrtA, sqrtB, freedLiquidity);
    var min0 = floor95(freed.amount0), min1 = floor95(freed.amount1);
    var returned = byPair(freed), minimum = byPair({ amount0: min0, amount1: min1 });
    return base({
      kind: 'decrease', actions: '01', parameters: [encodeAbiParameters(MODIFY, [tokenId, freedLiquidity, min0, min1, '0x'])],
      liquidity: targetLiquidity, liquidityDelta: freedLiquidity, pairHolding: holding.pair, tokenHolding: holding.token,
      pairFlow: -returned.pair, tokenFlow: -returned.token, pairMinimum: minimum.pair, tokenMinimum: minimum.token,
    });
  }

  // A new band: burn and re-mint. The share of each target the old position already covers is shaved 1% for
  // price drift; anything beyond it is new wallet capital and carries the mint's own 1% headroom instead.
  var budget = function (want, held) { var covered = want < held ? want : held; return want - covered / 100n; };
  var mint = lpMintPlan(pool, budget(target.pairAmount, position.pairAmount), budget(target.tokenAmount, position.tokenAmount), range.pa, range.pb);
  var minted = byPair(mint.need);
  // A single-sided mint carries a 1-wei maximum on its empty side; that dust is not wallet funding.
  var beyondDust = function (amount) { return amount > 1n ? amount : 0n; };
  var mintMax = byPair({ amount0: mint.amount0Max, amount1: mint.amount1Max });
  var pairFunding = beyondDust(mintMax.pair - position.pairAmount), tokenFunding = beyondDust(mintMax.token - position.tokenAmount);
  var funding0 = pairIsC0 ? pairFunding : tokenFunding, funding1 = pairIsC0 ? tokenFunding : pairFunding;
  var moveErc20 = [];
  if (!nativeIsC0 && funding0 > 0n) moveErc20.push({ currency: key.currency0, max: funding0 });
  if (!nativeIsC1 && funding1 > 0n) moveErc20.push({ currency: key.currency1, max: funding1 });
  var pairMinimum = floor95(position.pairAmount), tokenMinimum = floor95(position.tokenAmount);
  var mintParams = lpMintParams(key, mint, account);
  return base({
    kind: 'move', actions: '0302', parameters: [burnParams(pairMinimum, tokenMinimum), mintParams],
    tickLower: mint.tickLower, tickUpper: mint.tickUpper, liquidity: mint.liquidity,
    pairHolding: minted.pair, tokenHolding: minted.token,
    pairFlow: minted.pair - position.pairAmount, tokenFlow: minted.token - position.tokenAmount,
    pairFunding: pairFunding, tokenFunding: tokenFunding, value: nativeIsC0 ? funding0 : nativeIsC1 ? funding1 : 0n,
    erc20: moveErc20, pairMinimum: pairMinimum, tokenMinimum: tokenMinimum, amount0Max: mint.amount0Max, amount1Max: mint.amount1Max,
    // The band this burns, and the most each currency may pull from the wallet net of the burn's return.
    burned: { tickLower: position.tickLower, tickUpper: position.tickUpper, funding0: funding0, funding1: funding1 },
  });
}

// Whether a move's mint, at the live price, still costs the wallet no more than reviewed once the burn's return
// is counted. The mint's own maxima bound what it takes in, not the difference the wallet pays.
export function lpMoveStillCovered(move, sqrtP) {
  if (!move.burned) return true;
  var minted = lpGetAmountsForLiquidity(sqrtP, lpSqrtAtTick(move.tickLower), lpSqrtAtTick(move.tickUpper), move.liquidity);
  var returned = lpGetAmountsForLiquidity(sqrtP, lpSqrtAtTick(move.burned.tickLower), lpSqrtAtTick(move.burned.tickUpper), move.liquidityBefore);
  return minted.amount0 - returned.amount0 <= move.burned.funding0 && minted.amount1 - returned.amount1 <= move.burned.funding1;
}

// The whole unlock: a plan that returns funds ends in TAKE_PAIR; an increase closes both currencies and sweeps
// unused native value back; a move pays in its reviewed caps and takes the rest (lpCappedClose).
export function lpEditPlan(pool, position, target, range, account) {
  var ops = lpEditOperations(pool, position, target, range, account);
  var key = pool.key, parts = ops.parameters.slice(), actions = ops.actions;
  if (ops.kind === 'decrease' || ops.kind === 'remove') {
    actions += '11';
    parts.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }], [key.currency0, key.currency1, account]));
  } else {
    var close = ops.kind === 'move' ? lpCappedClose(pool, account, ops.value, ops.erc20) : lpCloseActions(pool, account, ops.value);
    actions += close.actions;
    parts = parts.concat(close.parameters);
  }
  return Object.assign(ops, { unlockData: lpEncodeUnlock(actions, parts) });
}

// Why a reviewed plan no longer fits the pool, or null: the position is unchanged and, for an increase or a move,
// the live price has not pushed what it pulls past the reviewed maxima. Floors are enforced by the contract.
export function lpEditStillFits(plan, live) {
  if (live.liquidity !== plan.liquidityBefore) return 'This position changed. Review it again before sending.';
  if (plan.kind !== 'move' && plan.kind !== 'increase') return null;
  var required = lpGetAmountsForLiquidity(live.sqrtP, lpSqrtAtTick(plan.tickLower), lpSqrtAtTick(plan.tickUpper),
    plan.kind === 'move' ? plan.liquidity : plan.liquidityDelta);
  return required.amount0 > plan.amount0Max || required.amount1 > plan.amount1Max || !lpMoveStillCovered(plan, live.sqrtP)
    ? 'The pool price moved beyond the reviewed range. Review fresh amounts.' : null;
}

// Why the wallet cannot fund a reviewed change, or null. Gated on what the pool pulls, not on the maxima, whose
// 1% headroom is spent only if the price moves; a change that pays in its caps (paysCap) must hold them whole,
// and native value is sent whole, headroom included. A side that pulls nothing is not read against a balance.
// held: { token, pair } balances, null where a read failed.
export function lpBalanceProblem(plan, paysCap, held, sym, pairSym) {
  var tokenNeed = paysCap ? plan.tokenFunding : plan.tokenFlow, pairNeed = paysCap ? plan.pairFunding : plan.pairFlow;
  if (plan.value > pairNeed) pairNeed = plan.value;
  if ((tokenNeed > 0n && held.token === null) || (pairNeed > 0n && held.pair === null)) return 'Could not read your wallet balances.';
  if (tokenNeed > 0n && tokenNeed > held.token) return 'That\'s more ' + sym + ' than your balance.';
  if (pairNeed > 0n && pairNeed > held.pair) return 'That\'s more ' + pairSym + ' than your balance.';
  return null;
}
// Refuses a change the wallet cannot fund. pos: a refreshed position of the pool.
export function lpRequireBalances(chainId, pos, acct, plan, paysCap, sym) {
  var native = function (currency) { return /^0x0{40}$/.test(currency) ? null : currency; };
  var key = pos.key;
  return Promise.all([readWalletTokenBalance(chainId, pos.pairIsC0 ? key.currency1 : key.currency0, acct),
    readWalletTokenBalance(chainId, native(pos.pairIsC0 ? key.currency0 : key.currency1), acct)]).then(function (held) {
    var problem = lpBalanceProblem(plan, paysCap, { token: held[0], pair: held[1] }, sym, pos.pair.symbol);
    if (problem) throw new Error(problem);
  });
}

// Plain words for a reviewed edit, the same lines juicebox.money shows: what moves between the wallet and the
// position, what the position holds afterwards, and what the wallet authorizes. `fmt` supplies
// token(amount) and pair(amount); `band` is the resulting band, already formatted, for a re-band.
export function describeLpEdit(plan, fmt, pairIsNative, pairSymbol, band) {
  var both = function (tokenAmount, pairAmount) { return fmt.token(tokenAmount) + ' + ' + fmt.pair(pairAmount); };
  var id = '#' + plan.tokenId.toString();
  var holds = 'about ' + both(plan.tokenHolding, plan.pairHolding);
  var authorizing = plan.tokenFunding > 0n || plan.pairFunding > 0n
    ? 'Your wallet authorizes up to ' + [plan.tokenFunding > 0n ? fmt.token(plan.tokenFunding) : null, plan.pairFunding > 0n ? fmt.pair(plan.pairFunding) : null].filter(Boolean).join(' and ')
      + ' — 1% price headroom' + (pairIsNative && plan.pairFunding > 0n ? '; unused ' + pairSymbol + ' is refunded' : '') + '.'
    : null;
  var floors = 'At least ' + both(plan.tokenMinimum, plan.pairMinimum) + ' is enforced onchain (95% floors).';
  var fees = 'Unclaimed fees return to your wallet in the same transaction.';
  if (plan.kind === 'increase') {
    return { lead: 'Adds about ' + both(plan.tokenFlow, plan.pairFlow) + ' from your wallet; position ' + id + ' then holds ' + holds + '.',
      detail: ((authorizing || '') + ' Unclaimed fees offset what your wallet pays.').trim() };
  }
  if (plan.kind === 'decrease') {
    return { lead: 'Frees about ' + both(-plan.tokenFlow, -plan.pairFlow) + ' to your wallet; position ' + id + ' keeps ' + holds + '.', detail: floors + ' ' + fees };
  }
  if (plan.kind === 'move') {
    var flows = [
      plan.tokenFlow > 0n ? 'pulls about ' + fmt.token(plan.tokenFlow) : plan.tokenFlow < 0n ? 'gets back about ' + fmt.token(-plan.tokenFlow) : null,
      plan.pairFlow > 0n ? 'pulls about ' + fmt.pair(plan.pairFlow) : plan.pairFlow < 0n ? 'gets back about ' + fmt.pair(-plan.pairFlow) : null,
    ].filter(Boolean);
    return { lead: 'Burns position ' + id + ' and mints a new one' + (band ? ' in the ' + band + ' band' : '') + ' holding ' + holds + '.'
        + (flows.length ? ' Your wallet ' + flows.join(' and ') + '.' : ''),
      detail: (authorizing ? authorizing + ' ' : '') + 'The burn funds the mint inside one transaction; ' + floors.charAt(0).toLowerCase() + floors.slice(1) + ' ' + fees };
  }
  return { lead: 'Burns position ' + id + ' and returns everything it holds — about ' + both(-plan.tokenFlow, -plan.pairFlow) + ' — to your wallet.', detail: floors + ' ' + fees };
}

// The plan a filled form asks for, built on the freshly read position `pos`. `prefill` is what the form showed
// when it opened: an untouched amount asks for exactly what the position holds now, and an untouched range keeps
// the position's own ticks.
export function lpEditFromForm(pos, prefill, values, account) {
  var amount = function (text, decimals, held, shown) {
    text = String(text).trim();
    if (text === shown) return held;
    if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') throw new Error('Enter a valid amount.');
    return parseUnits(text, decimals);
  };
  var sameBand = values.min === prefill.min && values.max === prefill.max;
  var pa = Number(values.min), pb = Number(values.max);
  if (!sameBand && (!(pa > 0) || !(pb > pa))) throw new Error('Set a valid positive price range (min below max).');
  return lpEditPlan({ key: pos.key, sqrtP: pos.sqrtP, pair: pos.pair, pairIsC0: pos.pairIsC0 },
    { tokenId: pos.tokenId, liquidity: pos.liquidity, tickLower: pos.tickLower, tickUpper: pos.tickUpper, pairAmount: pos.pairAmt, tokenAmount: pos.tokAmt },
    { pairAmount: amount(values.pair, pos.pair.decimals, pos.pairAmt, prefill.pair), tokenAmount: amount(values.token, 18, pos.tokAmt, prefill.token) },
    sameBand ? null : { pa: pa, pb: pb }, account);
}

var TITLE = { increase: 'Increase the position', decrease: 'Decrease the position', move: 'Move the position', remove: 'Remove the position' };

// The editor: what the position should hold and the band it covers, prefilled with what it has. Everything a
// call is built from is read again when Review is pressed, and once more right before sending.
export function openLpEditor(project, chainId, stalePos, acct, onDone) {
  var sym = project.tokenSymbol || 'tokens';
  var pair = stalePos.pair;
  var fmt = { token: function (amount) { return formatTokens(amount) + ' ' + sym; }, pair: function (amount) { return formatBalance(amount, pair.decimals, pair.symbol); } };
  var wrap = el('div', 'modal-body');
  var intro = el('div', 'modal-balance'); intro.textContent = 'Refreshing position…'; wrap.appendChild(intro);
  var field = function (label) {
    var title = el('div', 'modal-label'); title.textContent = label; title.style.marginTop = '10px'; wrap.appendChild(title);
    var input = el('input', 'ops-amount'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.disabled = true;
    input.setAttribute('aria-label', label);
    var box = el('div', 'ops-field ops-field--grow'); box.appendChild(input);
    return { box: box, input: input };
  };
  var tokenField = field(sym + ' the position should hold'); wrap.appendChild(tokenField.box);
  var pairField = field(pair.symbol + ' the position should hold'); wrap.appendChild(pairField.box);
  var bandLabel = el('div', 'modal-label'); bandLabel.textContent = 'Price range (' + pair.symbol + ' per ' + sym + ')'; bandLabel.style.marginTop = '10px'; wrap.appendChild(bandLabel);
  var bandRow = el('div', 'ops-chainrow');
  var bandInput = function (placeholder) {
    var box = el('div', 'ops-field ops-field--grow');
    var input = el('input', 'ops-amount'); input.type = 'number'; input.step = 'any'; input.min = '0'; input.placeholder = placeholder; input.disabled = true;
    input.setAttribute('aria-label', placeholder + ' price'); box.appendChild(input); bandRow.appendChild(box); return input;
  };
  var minInput = bandInput('Min');
  var between = el('span', 'ops-between'); between.textContent = 'to'; bandRow.appendChild(between);
  var maxInput = bandInput('Max');
  wrap.appendChild(bandRow);
  var note = el('div', 'modal-balance');
  note.textContent = 'One transaction. Amounts are ceilings: the range and the current price set the mix. Set both to 0 to remove the position.';
  wrap.appendChild(note);
  var status = el('div', 'modal-status error'); status.style.display = 'none'; wrap.appendChild(status);
  var go = el('button', 'detail-check-btn'); go.textContent = 'Review'; go.disabled = true; go.style.marginTop = '10px'; wrap.appendChild(go);
  var handle = openModal('Edit position #' + stalePos.tokenId.toString(), wrap);
  var prefill = null; // the band as prefilled, so an untouched band keeps the position's exact ticks

  function fail(error, fallback) {
    var message = errMessage(error, fallback);
    status.textContent = message.length > 200 ? message.slice(0, 200) + '…' : message; status.style.display = '';
  }
  function planFor(pos) {
    return lpEditFromForm(pos, prefill, { token: tokenField.input.value, pair: pairField.input.value, min: minInput.value, max: maxInput.value }, acct);
  }

  refreshLpPositionForRemoval(chainId, stalePos, acct).then(function (pos) {
    var band = lpBandPricesOf(pos);
    prefill = { token: formatUnits(pos.tokAmt, 18), pair: formatUnits(pos.pairAmt, pair.decimals), min: String(Number(band.min.toPrecision(6))), max: String(Number(band.max.toPrecision(6))) };
    intro.textContent = 'Position #' + pos.tokenId.toString() + ' holds ' + fmt.token(pos.tokAmt) + ' + ' + fmt.pair(pos.pairAmt) + '.';
    tokenField.input.value = prefill.token; pairField.input.value = prefill.pair; minInput.value = prefill.min; maxInput.value = prefill.max;
    [tokenField.input, pairField.input, minInput, maxInput].forEach(function (input) { input.disabled = false; });
    go.disabled = false;
  }).catch(function (error) { intro.textContent = 'Could not refresh this position.'; fail(error, 'Could not refresh this position'); });

  go.addEventListener('click', function () {
    if (go.disabled || !prefill) return;
    status.style.display = 'none';
    var opts = { title: 'Confirm liquidity change', confirmText: 'Confirm' };
    var action = 'Edit your liquidity in the ' + sym + '/' + pair.symbol + ' pool';
    var review = openPendingReview({ action: action, chain: chainNameOf(chainId), rows: [['Position', '#' + stalePos.tokenId.toString()], ['Change', null], ['Details', null], ['To', acct], ['Deadline', null]] }, opts);
    if (review.closed) return;
    go.disabled = true;
    refreshLpPositionForRemoval(chainId, stalePos, acct).then(function (pos) {
      go.disabled = false;
      if (review.closed) return;
      var plan = planFor(pos);
      var posm = POSITION_MANAGER_BY_CHAIN[chainId];
      var snapped = lpBandPricesOf({ pair: pair, pairIsC0: pos.pairIsC0, tickLower: plan.tickLower, tickUpper: plan.tickUpper });
      var words = describeLpEdit(plan, fmt, !!pair.isNative, pair.symbol, plan.kind === 'move' ? formatPrice(snapped.min) + ' to ' + formatPrice(snapped.max) + ' ' + pair.symbol + '/' + sym : '');
      var funded = plan.erc20.length > 0 || plan.value > 0n;
      var window = pos.smartWallet ? '30 days: survives a multisig signing queue' : '~20 minutes';
      // What the wallet is asked for before the change itself: the review lists every approval and, inside the
      // Safe App, every call of the batch.
      return lpRequireBalances(chainId, pos, acct, plan, plan.kind === 'move', sym).then(function () {
        return lpWithAllowanceFlags(chainId, acct, posm, !!pos.smartWallet, plan.erc20);
      }).then(function (erc20) {
      if (review.closed) return;
      var prep = { posm: posm, unlockData: plan.unlockData, value: plan.value, erc20: erc20, acct: acct, smartWallet: !!pos.smartWallet,
        stepLabel: 'liquidity change', finalLabel: TITLE[plan.kind], sendingLine: 'Confirm in your wallet…' };
      var batch = lpSafeBatchPreview(chainId, chainNameOf(chainId), prep);
      var reviewedAt = batch ? batch.now : Math.floor(Date.now() / 1000);
      var deadline = batch ? batch.deadline : BigInt(reviewedAt + (pos.smartWallet ? 30 * 24 * 3600 : 1200));
      var approvals = lpApprovalRows(erc20, function (currency) { return String(currency).toLowerCase() === String(pair.addr || '').toLowerCase() ? pair.symbol : sym; }, 'change');
      var payload = {
        summary: { action: TITLE[plan.kind] + ' in the ' + sym + '/' + pair.symbol + ' pool', rows: [['Position', '#' + pos.tokenId.toString()], ['Change', words.lead], ['Details', words.detail], ['To', acct], ['Deadline', window]].concat(approvals) },
        chain: chainNameOf(chainId), chainId: chainId, contract: 'Uniswap V4 PositionManager', address: posm,
        'function': 'modifyLiquidities', value: plan.value.toString(),
        calldata: funded ? 'built at signing: it may carry a Permit2 signature bound to this wallet' : encodeFunctionData({ abi: lpPositionManagerAbi, functionName: 'modifyLiquidities', args: [plan.unlockData, deadline] }),
        position: { kind: plan.kind, tokenId: pos.tokenId.toString(), ticks: plan.tickLower + ' to ' + plan.tickUpper, liquidity: plan.liquidity.toString() },
        args: { unlockData: plan.unlockData, deadline: 'set at signing (' + window + ')' },
      };
      if (batch) payload.transactions = batch.transactions;
      lpConfirmAndSend(review, payload, opts, 'Checking the position…', 'Liquidity change failed', function (dialog) {
        // The position and the price again, right before sending: the reviewed maxima and sizes came from them.
        var recheck = function () {
          return refreshLpPositionForRemoval(chainId, pos, acct).then(function (live) {
            var stale = lpEditStillFits(plan, { sqrtP: live.sqrtP, liquidity: live.liquidity });
            if (stale) throw new Error(stale);
          });
        };
        // One runner for every edit: it refuses a change already waiting in a Safe's queue, settles approvals,
        // and checks the position once more after them. The deadline is the reviewed one.
        return recheck().then(function () {
          return runAddLiquidityTxs(chainId, Object.assign({ recheck: recheck }, prep),
            function (message, kind, meta) { dialog.showStatus(message, kind, meta); }, { now: reviewedAt, deadline: deadline });
        });
      }, function (result) {
        handle.close();
        noteLocalLpWrite(chainId, pos.poolId);
        // A Safe batch returns its proposal, which is not an execution.
        if (onDone) onDone(result && result.safeTxHash ? null : result);
      });
      });
    }).catch(function (error) {
      go.disabled = false;
      fail(error, 'Could not prepare this change');
      review.fail(status.textContent);
    });
  });
}
