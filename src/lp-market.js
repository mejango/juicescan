// A market between the cash out floor and the issuance ceiling: two single-sided positions, project tokens sold
// from the price up to the ceiling and pair tokens buying from the price down to the floor. Each side has its own
// liquidity, so the two amounts are independent. Minted and edited in one PositionManager.modifyLiquidities call.
// The builders match juicebox.money's src/lib/market-liquidity.ts; test/lp-market.test.js pins them to its output.
//
// pool: { key, sqrtP, price, pair: { decimals, isNative, symbol }, pairIsC0 }, price in pair per token.
// A position: { tokenId, liquidity, tickLower, tickUpper, pairAmount, tokenAmount } as read at the pool's sqrtP.
import { formatUnits, parseUnits } from 'viem';
import { el, errMessage, openPendingReview } from './component-base.js';
import {
  POSITION_MANAGER_BY_CHAIN, chainNameOf, formatBalance, formatPrice, formatTokens, lpBandPricesOf, lpConfirmAndSend, lpCorridor,
  lpGetAmountsForLiquidity, lpMintPlan, lpSqrtAtTick, noteLocalLpWrite, openModal, refreshLpPositionForRemoval, runAddLiquidityTxs,
} from './discover.js';
import { lpCloseActions, lpEditOperations, lpEncodeUnlock, lpMintParams, lpMoveStillCovered } from './lp-edit.js';

var UINT160_MAX = (1n << 160n) - 1n;

function requireCorridor(pool, corridor) {
  if (!(pool.price > 0)) throw new Error('The pool has no price yet.');
  if (!(corridor.floor > 0) || !(corridor.ceiling > corridor.floor)) throw new Error('This project has no usable floor and ceiling to make a market between.');
  return pool.price;
}
// Each side's half of the corridor, or null once the price has left it.
function tokenSideRange(price, corridor) { return price < corridor.ceiling ? { pa: price, pb: corridor.ceiling } : null; }
function pairSideRange(price, corridor) { return price > corridor.floor ? { pa: corridor.floor, pb: price } : null; }
export function lpMarketRoom(price, corridor) {
  return { token: !!tokenSideRange(price, corridor), pair: !!pairSideRange(price, corridor) };
}

// One single-sided mint: its size, what the wallet funds, and its MINT_POSITION parameters.
function sideMint(pool, pairAmount, tokenAmount, range, account) {
  var mint = lpMintPlan(pool, pairAmount, tokenAmount, range.pa, range.pb), key = pool.key;
  var native0 = pool.pairIsC0 && pool.pair.isNative, native1 = !pool.pairIsC0 && pool.pair.isNative;
  var erc20 = [];
  if (!native0 && mint.amount0Max > 1n) erc20.push({ currency: key.currency0, max: mint.amount0Max });
  if (!native1 && mint.amount1Max > 1n) erc20.push({ currency: key.currency1, max: mint.amount1Max });
  erc20.forEach(function (side) { if (side.max > UINT160_MAX) throw new Error('Amount is too large for Permit2.'); });
  return Object.assign(mint, { value: native0 ? mint.amount0Max : native1 ? mint.amount1Max : 0n, erc20: erc20, parameters: lpMintParams(key, mint, account) });
}

function mergeErc20(lists) {
  var merged = [];
  lists.forEach(function (list) {
    list.forEach(function (side) {
      var seen = merged.filter(function (entry) { return entry.currency.toLowerCase() === side.currency.toLowerCase(); })[0];
      if (seen) seen.max += side.max; else merged.push({ currency: side.currency, max: side.max });
    });
  });
  return merged;
}
function total(list, pick) { return list.reduce(function (sum, entry) { return sum + pick(entry); }, 0n); }

// Mint the market: MINT (token side) + MINT (pair side) + CLOSE x2 [+ SWEEP]. A side with no amount, or whose half
// of the corridor the price has left, is omitted.
export function lpMarketMint(pool, tokenAmount, pairAmount, corridor, account) {
  var price = requireCorridor(pool, corridor);
  var tokenRange = tokenSideRange(price, corridor), pairRange = pairSideRange(price, corridor);
  var tokenSide = tokenAmount > 0n && tokenRange ? sideMint(pool, 0n, tokenAmount, tokenRange, account) : null;
  var pairSide = pairAmount > 0n && pairRange ? sideMint(pool, pairAmount, 0n, pairRange, account) : null;
  if (!tokenSide && !pairSide) {
    throw new Error(tokenAmount <= 0n && pairAmount <= 0n ? 'Enter an amount for at least one side.'
      : 'Spot is outside the ' + (tokenAmount > 0n ? 'token' : 'pair') + ' side of the corridor, so that side has nowhere to go.');
  }
  var sides = [tokenSide, pairSide].filter(Boolean);
  var value = total(sides, function (side) { return side.value; });
  var close = lpCloseActions(pool, account, value);
  return {
    unlockData: lpEncodeUnlock('02'.repeat(sides.length) + close.actions, sides.map(function (side) { return side.parameters; }).concat(close.parameters)),
    tokenSide: tokenSide, pairSide: pairSide, value: value, erc20: mergeErc20(sides.map(function (side) { return side.erc20; })),
    need: { amount0: total(sides, function (side) { return side.need.amount0; }), amount1: total(sides, function (side) { return side.need.amount1; }) },
    amount0Max: total(sides, function (side) { return side.amount0Max; }), amount1Max: total(sides, function (side) { return side.amount1Max; }),
  };
}

// Pair up positions whose bands meet: the price at mint sat between them, and its own tick slot may be skipped,
// hence a gap of up to one spacing. The side with the higher prices is the token side. Anything else stands alone.
export function lpGroupMarketPositions(pool, positions) {
  var spacing = Number(pool.key.tickSpacing);
  var sorted = positions.slice().sort(function (a, b) { return a.tickLower - b.tickLower; });
  var used = [], groups = [];
  var isUsed = function (position) { return used.indexOf(position) !== -1; };
  sorted.forEach(function (lower) {
    if (isUsed(lower)) return;
    used.push(lower);
    var upper = sorted.filter(function (candidate) {
      return !isUsed(candidate) && candidate.tickLower >= lower.tickUpper && candidate.tickLower - lower.tickUpper <= spacing;
    })[0];
    if (!upper) { groups.push({ kind: 'single', position: lower }); return; }
    used.push(upper);
    var band = function (position) { return lpBandPricesOf({ pair: pool.pair, pairIsC0: pool.pairIsC0, tickLower: position.tickLower, tickUpper: position.tickUpper }); };
    var lowerIsToken = band(lower).min >= band(upper).max;
    groups.push({ kind: 'market', tokenSide: lowerIsToken ? lower : upper, pairSide: lowerIsToken ? upper : lower });
  });
  return groups;
}

// Whether either side's band no longer reaches the corridor: a stage moved the ceiling or the floor.
export function lpCorridorMoved(pool, sides, corridor) {
  var off = function (actual, expected) { return Math.abs(actual - expected) / expected > 0.005; };
  var band = function (position) { return lpBandPricesOf({ pair: pool.pair, pairIsC0: pool.pairIsC0, tickLower: position.tickLower, tickUpper: position.tickUpper }); };
  return !!((sides.tokenSide && off(band(sides.tokenSide).max, corridor.ceiling)) || (sides.pairSide && off(band(sides.pairSide).min, corridor.floor)));
}

function sideEdit(kind, tokenId, ops, own) {
  var token = own === 'token';
  return {
    kind: kind, tokenId: tokenId, liquidityBefore: ops.liquidityBefore, holding: token ? ops.tokenHolding : ops.pairHolding,
    flow: token ? ops.tokenFlow : ops.pairFlow, funding: token ? ops.tokenFunding : ops.pairFunding,
    minimum: token ? ops.tokenMinimum : ops.pairMinimum, tickLower: ops.tickLower, tickUpper: ops.tickUpper,
    liquidity: ops.liquidity, liquidityDelta: ops.liquidityDelta, amount0Max: ops.amount0Max, amount1Max: ops.amount1Max, burned: ops.burned,
  };
}

// A fresh single-sided mint as operations, so a missing side can join a market edit.
function mintOperations(mint, pool) {
  var held = lpGetAmountsForLiquidity(pool.sqrtP, lpSqrtAtTick(mint.tickLower), lpSqrtAtTick(mint.tickUpper), mint.liquidity);
  var pairHolding = pool.pairIsC0 ? held.amount0 : held.amount1, tokenHolding = pool.pairIsC0 ? held.amount1 : held.amount0;
  var pairMax = pool.pairIsC0 ? mint.amount0Max : mint.amount1Max, tokenMax = pool.pairIsC0 ? mint.amount1Max : mint.amount0Max;
  return {
    kind: 'move', actions: '02', parameters: [mint.parameters], tickLower: mint.tickLower, tickUpper: mint.tickUpper,
    liquidityBefore: 0n, liquidity: mint.liquidity, liquidityDelta: 0n, pairHolding: pairHolding, tokenHolding: tokenHolding,
    pairFlow: pairHolding, tokenFlow: tokenHolding, pairFunding: pairMax > 1n ? pairMax : 0n, tokenFunding: tokenMax > 1n ? tokenMax : 0n,
    value: mint.value, erc20: mint.erc20, pairMinimum: 0n, tokenMinimum: 0n, amount0Max: mint.amount0Max, amount1Max: mint.amount1Max,
  };
}

// Edit a market in one transaction. Each side is its own position, so each target maps to its own operation:
// increase or decrease in place, burn at zero, mint when the side did not exist. With `refit`, both existing sides
// are burned and minted again at the corridor given, funded by their own burns plus whatever the targets add.
// sides: { tokenSide, pairSide } (either may be null); targets: { tokenAmount, pairAmount }.
export function lpMarketEdit(pool, sides, targets, corridor, refit, account) {
  var price = requireCorridor(pool, corridor);
  var plan = function (own, position, target, range) {
    var amounts = own === 'token' ? { pairAmount: 0n, tokenAmount: target } : { pairAmount: target, tokenAmount: 0n };
    var ops;
    if (position) {
      if (target <= 0n) { ops = lpEditOperations(pool, position, amounts, null, account); return { edit: sideEdit('remove', position.tokenId, ops, own), ops: ops }; }
      if (refit) {
        if (!range) throw new Error('Spot has left the ' + own + ' side of the corridor, so that side cannot be re-fit; set it to 0 to remove it.');
        ops = lpEditOperations(pool, position, amounts, range, account);
        return { edit: sideEdit('move', position.tokenId, ops, own), ops: ops };
      }
      try {
        ops = lpEditOperations(pool, position, amounts, null, account);
        return { edit: sideEdit(ops.kind, position.tokenId, ops, own), ops: ops };
      } catch (cause) {
        if (!(cause instanceof Error) || !/as it is/.test(cause.message)) throw cause;
        return { ops: null, edit: {
          kind: 'keep', tokenId: position.tokenId, liquidityBefore: position.liquidity, holding: own === 'token' ? position.tokenAmount : position.pairAmount,
          flow: 0n, funding: 0n, minimum: 0n, tickLower: position.tickLower, tickUpper: position.tickUpper,
          liquidity: position.liquidity, liquidityDelta: 0n, amount0Max: 0n, amount1Max: 0n,
        } };
      }
    }
    if (target <= 0n) return null;
    if (!range) throw new Error('Spot is outside the ' + own + ' side of the corridor, so that side has nowhere to go.');
    ops = mintOperations(sideMint(pool, amounts.pairAmount, amounts.tokenAmount, range, account), pool);
    return { edit: sideEdit('mint', null, ops, own), ops: ops };
  };
  var token = plan('token', sides.tokenSide, targets.tokenAmount, tokenSideRange(price, corridor));
  var pair = plan('pair', sides.pairSide, targets.pairAmount, pairSideRange(price, corridor));
  var operations = [token && token.ops, pair && pair.ops].filter(Boolean);
  if (!operations.length) throw new Error('This leaves the market as it is.');
  var value = total(operations, function (ops) { return ops.value; });
  var close = lpCloseActions(pool, account, value);
  var parameters = [];
  operations.forEach(function (ops) { parameters = parameters.concat(ops.parameters); });
  var sum = function (field) { return total(operations, function (ops) { return ops[field]; }); };
  return {
    unlockData: lpEncodeUnlock(operations.map(function (ops) { return ops.actions; }).join('') + close.actions, parameters.concat(close.parameters)),
    token: token ? token.edit : null, pair: pair ? pair.edit : null, value: value,
    erc20: mergeErc20(operations.map(function (ops) { return ops.erc20; })),
    tokenFlow: sum('tokenFlow'), pairFlow: sum('pairFlow'), tokenFunding: sum('tokenFunding'), pairFunding: sum('pairFunding'),
    tokenMinimum: sum('tokenMinimum'), pairMinimum: sum('pairMinimum'),
    tokenHolding: token ? token.edit.holding : 0n, pairHolding: pair ? pair.edit.holding : 0n, refit: refit,
  };
}

// Why a reviewed market edit no longer fits, or null: every existing side is unchanged, and for each mint, move or
// increase the live price has not pushed what it pulls past the reviewed maxima.
// live: { sqrtP, liquidityOf(tokenId) }.
export function lpMarketEditStillFits(plan, live) {
  var sides = [plan.token, plan.pair].filter(Boolean);
  for (var i = 0; i < sides.length; i++) {
    if (sides[i].tokenId !== null && live.liquidityOf(sides[i].tokenId) !== sides[i].liquidityBefore) return 'A position in this market changed. Review it again before sending.';
  }
  for (var j = 0; j < sides.length; j++) {
    var side = sides[j];
    if (side.kind !== 'mint' && side.kind !== 'move' && side.kind !== 'increase') continue;
    var required = lpGetAmountsForLiquidity(live.sqrtP, lpSqrtAtTick(side.tickLower), lpSqrtAtTick(side.tickUpper), side.kind === 'increase' ? side.liquidityDelta : side.liquidity);
    if (required.amount0 > side.amount0Max || required.amount1 > side.amount1Max || !lpMoveStillCovered(side, live.sqrtP)) return 'The pool price moved beyond the reviewed range. Review fresh amounts.';
  }
  return null;
}

// The display price (pair per token) a sqrtPriceX96 stands for.
export function lpDisplayPrice(sqrtP, pair, pairIsC0) {
  var raw = Math.pow(Number(sqrtP) / Math.pow(2, 96), 2), scale = Math.pow(10, 18 - pair.decimals);
  return pairIsC0 ? scale / raw : raw * scale;
}

var SIDE_VERB = { increase: 'tops up', decrease: 'frees part of', remove: 'removes', move: 're-fits', mint: 'mints', keep: 'keeps' };

// The review rows of a market edit. fmt: { token(amount), pair(amount) }.
export function describeMarketEdit(plan, fmt, corridorText) {
  var both = function (tokenAmount, pairAmount) {
    return [tokenAmount > 0n ? fmt.token(tokenAmount) : null, pairAmount > 0n ? fmt.pair(pairAmount) : null].filter(Boolean).join(' + ');
  };
  var positive = function (amount) { return amount > 0n ? amount : 0n; };
  var side = function (edit, format) {
    return SIDE_VERB[edit.kind] + (edit.tokenId !== null ? ' #' + edit.tokenId.toString() : '') + ', holds about ' + format(edit.holding);
  };
  var rows = [['Floor to ceiling', corridorText + (plan.refit ? ' (re-fit)' : ' (kept)')]];
  if (plan.token) rows.push(['Selling side', side(plan.token, fmt.token)]);
  if (plan.pair) rows.push(['Buying side', side(plan.pair, fmt.pair)]);
  if (plan.tokenFlow > 0n || plan.pairFlow > 0n) rows.push(['From your wallet', 'about ' + both(positive(plan.tokenFlow), positive(plan.pairFlow))]);
  rows.push(['Back to your wallet', plan.tokenFlow < 0n || plan.pairFlow < 0n
    ? 'about ' + both(positive(-plan.tokenFlow), positive(-plan.pairFlow)) + ' + unclaimed fees' : 'Unclaimed fees']);
  if (plan.tokenFunding > 0n || plan.pairFunding > 0n) rows.push(['Authorizes up to', both(plan.tokenFunding, plan.pairFunding) + ' (1% price headroom)']);
  if (plan.tokenMinimum > 0n || plan.pairMinimum > 0n) rows.push(['Enforced onchain', 'At least ' + both(plan.tokenMinimum, plan.pairMinimum) + ' back (95% floors)']);
  return rows;
}

// The plan a filled market form asks for, on freshly read sides. An untouched amount asks for exactly what that
// side holds now. sides: { tokenSide, pairSide } as refreshed positions; shown: the texts the form opened with.
export function lpMarketEditFromForm(sides, shown, values, corridor, refit, account) {
  var amount = function (text, decimals, held, was) {
    text = String(text).trim();
    if (text === was) return held;
    if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') throw new Error('Enter a valid amount.');
    return parseUnits(text, decimals);
  };
  var any = sides.tokenSide || sides.pairSide;
  var asPosition = function (pos) {
    return pos && { tokenId: pos.tokenId, liquidity: pos.liquidity, tickLower: pos.tickLower, tickUpper: pos.tickUpper, pairAmount: pos.pairAmt, tokenAmount: pos.tokAmt };
  };
  // Both sides sit in one pool; the later read carries the fresher price.
  var sqrtP = (sides.pairSide || sides.tokenSide).sqrtP;
  var pool = { key: any.key, sqrtP: sqrtP, pair: any.pair, pairIsC0: any.pairIsC0, price: lpDisplayPrice(sqrtP, any.pair, any.pairIsC0) };
  // Each side is valued at the one price the plan is built on.
  var held = function (pos) {
    if (!pos) return null;
    var amounts = lpGetAmountsForLiquidity(sqrtP, lpSqrtAtTick(pos.tickLower), lpSqrtAtTick(pos.tickUpper), pos.liquidity);
    return Object.assign(asPosition(pos), { pairAmount: any.pairIsC0 ? amounts.amount0 : amounts.amount1, tokenAmount: any.pairIsC0 ? amounts.amount1 : amounts.amount0 });
  };
  var tokenSide = held(sides.tokenSide), pairSide = held(sides.pairSide);
  return lpMarketEdit(pool, { tokenSide: tokenSide, pairSide: pairSide }, {
    tokenAmount: amount(values.token, 18, tokenSide ? tokenSide.tokenAmount : 0n, shown.token),
    pairAmount: amount(values.pair, any.pair.decimals, pairSide ? pairSide.pairAmount : 0n, shown.pair),
  }, corridor, refit, account);
}

// The market editor: what each side should hold, and whether both sides move to the floor and ceiling as they
// stand now. Everything a call is built from is read again at Review and once more right before sending.
// group: { tokenSide, pairSide } as listed positions.
export function openLpMarketEditor(project, chainId, group, acct, onDone) {
  var sym = project.tokenSymbol || 'tokens', pair = group.tokenSide.pair;
  var ids = '#' + group.tokenSide.tokenId.toString() + ' + #' + group.pairSide.tokenId.toString();
  var fmt = { token: function (amount) { return formatTokens(amount) + ' ' + sym; }, pair: function (amount) { return formatBalance(amount, pair.decimals, pair.symbol); } };
  var wrap = el('div', 'modal-body');
  var intro = el('div', 'modal-balance'); intro.textContent = 'Refreshing the market…'; wrap.appendChild(intro);
  var field = function (label) {
    var title = el('div', 'modal-label'); title.textContent = label; title.style.marginTop = '10px'; wrap.appendChild(title);
    var input = el('input', 'ops-amount'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.disabled = true;
    input.setAttribute('aria-label', label);
    var box = el('div', 'ops-field ops-field--grow'); box.appendChild(input); wrap.appendChild(box);
    return input;
  };
  var tokenInput = field(sym + ' to sell above the price');
  var pairInput = field(pair.symbol + ' to buy with below the price');
  var refitRow = el('label', 'modal-balance'); refitRow.style.display = 'block'; refitRow.style.marginTop = '10px';
  var refitBox = el('input'); refitBox.type = 'checkbox'; refitBox.disabled = true; refitRow.appendChild(refitBox);
  var refitText = el('span'); refitRow.appendChild(refitText); wrap.appendChild(refitRow);
  var note = el('div', 'modal-balance');
  note.textContent = 'One transaction. Each amount is used in full. Added amounts come from your wallet; freed amounts and unclaimed fees return to it. Set a side to 0 to remove it.';
  wrap.appendChild(note);
  var status = el('div', 'modal-status error'); status.style.display = 'none'; wrap.appendChild(status);
  var go = el('button', 'detail-check-btn'); go.textContent = 'Review'; go.disabled = true; go.style.marginTop = '10px'; wrap.appendChild(go);
  var handle = openModal('Edit market ' + ids, wrap);
  var shown = null, corridor = null;

  function fail(error, fallback) {
    var message = errMessage(error, fallback);
    status.textContent = message.length > 200 ? message.slice(0, 200) + '…' : message; status.style.display = '';
  }
  function readSides() {
    return Promise.all([refreshLpPositionForRemoval(chainId, group.tokenSide, acct), refreshLpPositionForRemoval(chainId, group.pairSide, acct)])
      .then(function (fresh) { return { tokenSide: fresh[0], pairSide: fresh[1] }; });
  }
  var corridorText = function () { return formatPrice(corridor.floor) + ' to ' + formatPrice(corridor.ceiling) + ' ' + pair.symbol + '/' + sym; };

  Promise.all([readSides(), lpCorridor(project, chainId)]).then(function (read) {
    var sides = read[0];
    if (!(read[1].floor > 0) || !(read[1].ceiling > read[1].floor)) throw new Error('This project has no usable floor and ceiling to make a market between.');
    corridor = read[1];
    shown = { token: formatUnits(sides.tokenSide.tokAmt, 18), pair: formatUnits(sides.pairSide.pairAmt, pair.decimals) };
    intro.textContent = 'Market ' + ids + ' on ' + chainNameOf(chainId) + ' holds ' + fmt.token(sides.tokenSide.tokAmt) + ' selling above the price and ' + fmt.pair(sides.pairSide.pairAmt) + ' buying below it.';
    tokenInput.value = shown.token; pairInput.value = shown.pair;
    var moved = lpCorridorMoved({ pair: pair, pairIsC0: sides.tokenSide.pairIsC0 }, sides, corridor);
    refitBox.checked = moved;
    refitText.textContent = ' Match both sides to the current floor and ceiling (' + corridorText() + ').'
      + (moved ? ' They have moved since you made this market.' : ' Not needed right now, they already match.');
    [tokenInput, pairInput, refitBox].forEach(function (input) { input.disabled = false; });
    go.disabled = false;
  }).catch(function (error) { intro.textContent = 'Could not refresh this market.'; fail(error, 'Could not refresh this market'); });

  go.addEventListener('click', function () {
    if (go.disabled || !shown) return;
    status.style.display = 'none';
    var opts = { title: 'Confirm market edit', confirmText: 'Confirm' };
    var action = 'Edit your market in the ' + sym + '/' + pair.symbol + ' pool';
    var review = openPendingReview({ action: action, chain: chainNameOf(chainId), rows: [['Market', ids], ['Floor to ceiling', null], ['To', acct], ['Deadline', null]] }, opts);
    if (review.closed) return;
    go.disabled = true;
    var refit = refitBox.checked, values = { token: tokenInput.value, pair: pairInput.value };
    readSides().then(function (sides) {
      go.disabled = false;
      if (review.closed) return;
      var plan = lpMarketEditFromForm(sides, shown, values, corridor, refit, acct);
      var posm = POSITION_MANAGER_BY_CHAIN[chainId], smartWallet = !!sides.tokenSide.smartWallet;
      var window = smartWallet ? '30 days: survives a multisig signing queue' : '~20 minutes';
      var reviewedAt = Math.floor(Date.now() / 1000);
      var deadline = BigInt(reviewedAt + (smartWallet ? 30 * 24 * 3600 : 1200));
      lpConfirmAndSend(review, {
        summary: { action: action, rows: [['Market', ids]].concat(describeMarketEdit(plan, fmt, corridorText())).concat([['To', acct], ['Deadline', window]]) },
        chain: chainNameOf(chainId), chainId: chainId, contract: 'Uniswap V4 PositionManager', address: posm,
        'function': 'modifyLiquidities', value: plan.value.toString(),
        calldata: 'built at signing: it may carry a Permit2 signature bound to this wallet',
        args: { unlockData: plan.unlockData, deadline: 'set at signing (' + window + ')' },
      }, opts, 'Checking the market…', 'Market edit failed', function (dialog) {
        // Both positions and the price again, right before sending and once more after any approvals.
        var recheck = function () {
          return readSides().then(function (live) {
            var liquidityOf = function (tokenId) {
              return BigInt(tokenId) === BigInt(live.tokenSide.tokenId) ? live.tokenSide.liquidity : BigInt(tokenId) === BigInt(live.pairSide.tokenId) ? live.pairSide.liquidity : undefined;
            };
            var stale = lpMarketEditStillFits(plan, { sqrtP: live.pairSide.sqrtP, liquidityOf: liquidityOf });
            if (stale) throw new Error(stale);
          });
        };
        return recheck().then(function () {
          return runAddLiquidityTxs(chainId, {
            posm: posm, unlockData: plan.unlockData, value: plan.value, erc20: plan.erc20, acct: acct, smartWallet: smartWallet,
            stepLabel: 'market edit', sendingLine: 'Confirm in your wallet…', recheck: recheck,
          }, function (message, kind, meta) { dialog.showStatus(message, kind, meta); }, { now: reviewedAt, deadline: deadline });
        });
      }, function (result) {
        handle.close();
        noteLocalLpWrite(chainId, sides.tokenSide.poolId);
        if (onDone) onDone(result && result.safeTxHash ? null : result);
      });
    }).catch(function (error) {
      go.disabled = false;
      fail(error, 'Could not prepare this change');
      review.fail(status.textContent);
    });
  });
}
