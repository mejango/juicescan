// The position edit must build the calls juicebox.money builds (src/lib/edit-liquidity.ts buildEditLiquidityPlan).
// test/fixtures/lp-edit-vectors.json is that function's output for these inputs: a native pair sorted first, and
// a 6-decimal ERC-20 pair sorted second, each through an increase, a decrease, a re-band, a funded re-band and
// a removal.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lpBalanceProblem, lpEditPlan, lpEditStillFits } from '../src/lp-edit.js';

var ACCOUNT = '0x3333333333333333333333333333333333333333';
var vectors = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/lp-edit-vectors.json'), 'utf8'),
  function (_key, value) { return typeof value === 'string' && /^-?\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value; });
var FIELDS = ['kind', 'unlockData', 'tokenId', 'liquidityBefore', 'tickLower', 'tickUpper', 'liquidity', 'liquidityDelta',
  'pairHolding', 'tokenHolding', 'pairFlow', 'tokenFlow', 'pairFunding', 'tokenFunding', 'value', 'erc20',
  'pairMinimum', 'tokenMinimum', 'amount0Max', 'amount1Max'];

Object.keys(vectors).forEach(function (name) {
  var set = vectors[name], native = name === 'native';
  var pool = { key: set.key, sqrtP: set.sqrtP, pairIsC0: native, pair: { decimals: native ? 18 : 6, isNative: native, symbol: native ? 'ETH' : 'USDC' } };
  var position = { tokenId: 77n, liquidity: set.liquidity, tickLower: set.tickLower, tickUpper: set.tickUpper, pairAmount: set.pairAmount, tokenAmount: set.tokenAmount };
  describe('position edit, ' + name + ' pair', () => {
    Object.keys(set.cases).forEach(function (kind) {
      it(kind + ' matches juicebox.money', () => {
        var expected = set.cases[kind];
        var plan = lpEditPlan(pool, position, expected.input.target, expected.input.range, ACCOUNT);
        FIELDS.forEach(function (field) { expect(plan[field], field).toEqual(expected.plan[field]); });
        expect(lpEditStillFits(plan, { sqrtP: set.sqrtP, liquidity: set.liquidity })).toBe(expected.fits);
        expect(lpEditStillFits(plan, { sqrtP: set.sqrtP * 103n / 100n, liquidity: set.liquidity })).toBe(expected.moved);
        expect(lpEditStillFits(plan, { sqrtP: set.sqrtP, liquidity: set.liquidity + 1n })).toMatch(/position changed/);
      });
    });

    it('refuses an untouched target, a negative one, and one side at zero inside the band', () => {
      expect(() => lpEditPlan(pool, position, { pairAmount: set.pairAmount, tokenAmount: set.tokenAmount }, null, ACCOUNT)).toThrow(/as it is/);
      expect(() => lpEditPlan(pool, position, { pairAmount: -1n, tokenAmount: 1n }, null, ACCOUNT)).toThrow(/valid amount/);
      expect(() => lpEditPlan(pool, position, { pairAmount: 0n, tokenAmount: set.tokenAmount }, null, ACCOUNT)).toThrow(/holds both/);
    });
  });
});

import { describeLpEdit, lpEditFromForm } from '../src/lp-edit.js';
import { lpGetAmountsForLiquidity, lpSqrtAtTick } from '../src/discover.js';

describe('a reviewed move whose burn no longer covers its mint', () => {
  it('is refused although the mint still fits its own maxima', () => {
    var set = vectors.native;
    var pool = { key: set.key, sqrtP: set.sqrtP, pairIsC0: true, pair: { decimals: 18, isNative: true, symbol: 'ETH' } };
    // A narrow band around the price, moved to a much wider one with the same holdings.
    var held = lpGetAmountsForLiquidity(set.sqrtP, lpSqrtAtTick(68400), lpSqrtAtTick(69600), set.liquidity);
    var position = { tokenId: 77n, liquidity: set.liquidity, tickLower: 68400, tickUpper: 69600, pairAmount: held.amount0, tokenAmount: held.amount1 };
    var move = lpEditPlan(pool, position, { pairAmount: held.amount0, tokenAmount: held.amount1 }, { pa: Math.pow(1.0001, -76000), pb: Math.pow(1.0001, -62000) }, ACCOUNT);
    expect(move.pairFunding + move.tokenFunding).toBe(0n);
    expect(lpEditStillFits(move, { sqrtP: set.sqrtP, liquidity: set.liquidity })).toBeNull();
    // A 0.2% price move: the wider new band still fits its maxima, but the old band returns less of one
    // currency than the mint takes, which the wallet would pay unreviewed.
    var moved = set.sqrtP * 1001n / 1000n;
    var minted = lpGetAmountsForLiquidity(moved, lpSqrtAtTick(move.tickLower), lpSqrtAtTick(move.tickUpper), move.liquidity);
    expect(minted.amount0 <= move.amount0Max && minted.amount1 <= move.amount1Max).toBe(true);
    expect(lpEditStillFits(move, { sqrtP: moved, liquidity: set.liquidity })).toMatch(/price moved/);
  });
});


describe('the words of a reviewed edit', () => {
  var fmt = { token: function (amount) { return amount + ' TKN'; }, pair: function (amount) { return amount + ' ETH'; } };
  var plan = function (more) {
    return Object.assign({ tokenId: 7n, tokenHolding: 20n, pairHolding: 2n, tokenFlow: 10n, pairFlow: 1n, tokenFunding: 11n, pairFunding: 2n, tokenMinimum: 9n, pairMinimum: 1n }, more);
  };
  it('an increase names what is added, what the position then holds, and what the wallet authorizes', () => {
    var words = describeLpEdit(plan({ kind: 'increase' }), fmt, true, 'ETH');
    expect(words.lead).toBe('Adds about 10 TKN + 1 ETH from your wallet; position #7 then holds about 20 TKN + 2 ETH.');
    expect(words.detail).toBe('Your wallet authorizes up to 11 TKN and 2 ETH — 1% price headroom; unused ETH is refunded. Unclaimed fees offset what your wallet pays.');
  });
  it('a decrease names what is freed and the floors', () => {
    var words = describeLpEdit(plan({ kind: 'decrease', tokenFlow: -10n, pairFlow: -1n, tokenFunding: 0n, pairFunding: 0n }), fmt, true, 'ETH');
    expect(words.lead).toBe('Frees about 10 TKN + 1 ETH to your wallet; position #7 keeps about 20 TKN + 2 ETH.');
    expect(words.detail).toBe('At least 9 TKN + 1 ETH is enforced onchain (95% floors). Unclaimed fees return to your wallet in the same transaction.');
  });
  it('a re-band names the new band and each direction of flow', () => {
    var words = describeLpEdit(plan({ kind: 'move', tokenFlow: -3n, pairFlow: 4n, tokenFunding: 0n, pairFunding: 5n }), fmt, false, 'USDC', '1 to 2 USDC/TKN');
    expect(words.lead).toBe('Burns position #7 and mints a new one in the 1 to 2 USDC/TKN band holding about 20 TKN + 2 ETH. Your wallet gets back about 3 TKN and pulls about 4 ETH.');
    expect(words.detail).toBe('Your wallet authorizes up to 5 ETH — 1% price headroom. The burn funds the mint inside one transaction; at least 9 TKN + 1 ETH is enforced onchain (95% floors). Unclaimed fees return to your wallet in the same transaction.');
  });
  it('a removal returns everything', () => {
    expect(describeLpEdit(plan({ kind: 'remove', tokenFlow: -20n, pairFlow: -2n }), fmt, true, 'ETH').lead)
      .toBe('Burns position #7 and returns everything it holds — about 20 TKN + 2 ETH — to your wallet.');
  });
});

describe('the plan a filled form asks for', () => {
  var set = vectors.native;
  var pos = { tokenId: 77n, key: set.key, sqrtP: set.sqrtP, pairIsC0: true, pair: { decimals: 18, isNative: true, symbol: 'ETH' },
    liquidity: set.liquidity, tickLower: set.tickLower, tickUpper: set.tickUpper, pairAmt: set.pairAmount, tokAmt: set.tokenAmount };
  var prefill = { token: '39.96', pair: '0.0576', min: '0.0005', max: '0.0015' };
  var form = function (more) { return Object.assign({}, prefill, more); };

  it('an untouched form is not an edit, whatever the position holds by now', () => {
    expect(() => lpEditFromForm(pos, prefill, form(), ACCOUNT)).toThrow(/as it is/);
  });
  it('an untouched side keeps exactly what the position holds, and an untouched range keeps its ticks', () => {
    var plan = lpEditFromForm(pos, prefill, form({ token: '80', pair: '1' }), ACCOUNT);
    expect(plan.kind).toBe('increase');
    expect([plan.tickLower, plan.tickUpper]).toEqual([set.tickLower, set.tickUpper]);
    expect(lpEditFromForm(pos, prefill, form({ token: '0', pair: '0' }), ACCOUNT).kind).toBe('remove');
  });
  it('a changed range re-bands; a bad amount or range is refused', () => {
    expect(lpEditFromForm(pos, prefill, form({ min: '0.0004', max: '0.002' }), ACCOUNT).kind).toBe('move');
    expect(() => lpEditFromForm(pos, prefill, form({ token: '1e3' }), ACCOUNT)).toThrow(/valid amount/);
    expect(() => lpEditFromForm(pos, prefill, form({ token: '' }), ACCOUNT)).toThrow(/valid amount/);
    expect(() => lpEditFromForm(pos, prefill, form({ min: '0.002', max: '0.001' }), ACCOUNT)).toThrow(/valid positive price range/);
  });
});

describe('the wallet balance gate', () => {
  var plan = { tokenFlow: 10n, tokenFunding: 12n, pairFlow: 5n, pairFunding: 6n };
  it('gates an increase on what the pool pulls and a move on its whole cap', () => {
    expect(lpBalanceProblem(plan, false, { token: 10n, pair: 5n }, 'TKN', 'ETH')).toBeNull();
    expect(lpBalanceProblem(plan, true, { token: 11n, pair: 6n }, 'TKN', 'ETH')).toBe("That's more TKN than your balance.");
    expect(lpBalanceProblem(plan, true, { token: 12n, pair: 5n }, 'TKN', 'ETH')).toBe("That's more ETH than your balance.");
    expect(lpBalanceProblem(plan, true, { token: 12n, pair: 6n }, 'TKN', 'ETH')).toBeNull();
  });
  it('refuses when a balance could not be read, and lets a change that returns funds through', () => {
    expect(lpBalanceProblem(plan, false, { token: null, pair: 5n }, 'TKN', 'ETH')).toMatch(/Could not read/);
    expect(lpBalanceProblem({ tokenFlow: -3n, tokenFunding: 0n, pairFlow: -1n, pairFunding: 0n }, false, { token: 0n, pair: 0n }, 'TKN', 'ETH')).toBeNull();
  });
});
