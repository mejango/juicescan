// The two-sided market must build the calls juicebox.money builds (src/lib/market-liquidity.ts).
// test/fixtures/lp-market-vectors.json is that module's output for these inputs: a native pair sorted first and a
// 6-decimal ERC-20 pair sorted second, each through four mints, eight edits, a grouping and a fee claim.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lpCollectMarketFees, lpCorridorMoved, lpGroupMarketPositions, lpMarketEdit, lpMarketEditStillFits, lpMarketMint, lpMarketRoom } from '../src/lp-market.js';

var ACCOUNT = '0x3333333333333333333333333333333333333333';
var vectors = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/lp-market-vectors.json'), 'utf8'),
  function (_key, value) { return typeof value === 'string' && /^-?\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value; });
var SIDE_MINT = ['value', 'erc20', 'tickLower', 'tickUpper', 'liquidity', 'need', 'amount0Max', 'amount1Max'];
var MINT = ['unlockData', 'value', 'erc20', 'need', 'amount0Max', 'amount1Max'];
var SIDE_EDIT = ['kind', 'tokenId', 'liquidityBefore', 'holding', 'flow', 'funding', 'minimum', 'tickLower', 'tickUpper', 'liquidity', 'liquidityDelta', 'amount0Max', 'amount1Max'];
var EDIT = ['unlockData', 'value', 'erc20', 'tokenFlow', 'pairFlow', 'tokenFunding', 'pairFunding', 'tokenMinimum', 'pairMinimum', 'tokenHolding', 'pairHolding', 'refit'];
function same(actual, expected, fields, label) {
  if (expected === null) { expect(actual, label).toBeNull(); return; }
  fields.forEach(function (field) { expect(actual[field], label + ' ' + field).toEqual(expected[field]); });
}

Object.keys(vectors).forEach(function (name) {
  var set = vectors[name], native = name === 'native';
  var pool = { key: set.key, sqrtP: set.sqrtP, price: set.price, pairIsC0: native, pair: { decimals: native ? 18 : 6, isNative: native, symbol: native ? 'ETH' : 'USDC' } };
  describe('market, ' + name + ' pair', () => {
    Object.keys(set.mints).forEach(function (kind) {
      it('mint ' + kind + ' matches juicebox.money', () => {
        var expected = set.mints[kind], input = expected.input;
        var plan = lpMarketMint(pool, input.tokenAmount, input.pairAmount, input.corridor, ACCOUNT);
        same(plan, expected.plan, MINT, 'mint');
        same(plan.tokenSide, expected.plan.tokenSide, SIDE_MINT, 'token side');
        same(plan.pairSide, expected.plan.pairSide, SIDE_MINT, 'pair side');
      });
    });

    Object.keys(set.edits).forEach(function (kind) {
      it('edit ' + kind + ' matches juicebox.money', () => {
        var expected = set.edits[kind], input = expected.input;
        var plan = lpMarketEdit(pool, input.sides, input.targets, input.corridor, input.refit, ACCOUNT);
        same(plan, expected.plan, EDIT, 'edit');
        same(plan.token, expected.plan.token, SIDE_EDIT, 'token side');
        same(plan.pair, expected.plan.pair, SIDE_EDIT, 'pair side');
        var liquidityOf = function (delta) { return function (id) { return id === 11n ? set.tokenSide.liquidity + delta : id === 12n ? set.pairSide.liquidity : undefined; }; };
        expect(lpMarketEditStillFits(plan, { sqrtP: set.sqrtP, liquidityOf: liquidityOf(0n) })).toBe(expected.fits);
        expect(lpMarketEditStillFits(plan, { sqrtP: set.sqrtP * 103n / 100n, liquidityOf: liquidityOf(0n) })).toBe(expected.moved);
        expect(lpMarketEditStillFits(plan, { sqrtP: set.sqrtP * 97n / 100n, liquidityOf: liquidityOf(0n) })).toBe(expected.movedDown);
        expect(lpMarketEditStillFits(plan, { sqrtP: set.sqrtP, liquidityOf: liquidityOf(1n) })).toBe(expected.changed);
      });
    });

    it('groups the two sides of a market and leaves a distant position alone', () => {
      var groups = lpGroupMarketPositions(pool, [set.lone, set.tokenSide, set.pairSide]).map(function (group) {
        return group.kind === 'market' ? { kind: group.kind, tokenSide: group.tokenSide.tokenId, pairSide: group.pairSide.tokenId } : { kind: group.kind, position: group.position.tokenId };
      });
      expect(groups).toEqual(set.groups);
    });

    it('claims both sides in one unlock', () => {
      expect(lpCollectMarketFees(pool, [11n, 12n], ACCOUNT)).toBe(set.collect);
      expect(() => lpCollectMarketFees(pool, [], ACCOUNT)).toThrow(/No positions/);
    });

    it('refuses nothing to do, no corridor, and a side the price has left', () => {
      var sides = { tokenSide: set.tokenSide, pairSide: set.pairSide };
      expect(() => lpMarketEdit(pool, sides, { tokenAmount: set.tokenSide.tokenAmount, pairAmount: set.pairSide.pairAmount }, set.corridor, false, ACCOUNT)).toThrow(/leaves the market as it is/);
      expect(() => lpMarketMint(pool, 0n, 0n, set.corridor, ACCOUNT)).toThrow(/at least one side/);
      expect(() => lpMarketMint(pool, 1n, 1n, { floor: 0, ceiling: 1 }, ACCOUNT)).toThrow(/no usable floor and ceiling/);
      var below = { floor: set.price / 4, ceiling: set.price / 2 };
      expect(() => lpMarketMint(pool, 10n ** 18n, 0n, below, ACCOUNT)).toThrow(/outside the token side/);
      expect(lpMarketRoom(set.price, below)).toEqual({ token: false, pair: true });
      expect(lpMarketRoom(set.price, set.corridor)).toEqual({ token: true, pair: true });
    });

    it('notices a corridor that moved away from the bands', () => {
      var sides = { tokenSide: set.tokenSide, pairSide: set.pairSide };
      // Bands snap to tick spacing, so the minted corridor itself reads as in place within a few percent only.
      var made = { floor: set.price / 2, ceiling: set.price * 2 };
      expect(lpCorridorMoved(pool, sides, { floor: made.floor / 3, ceiling: made.ceiling })).toBe(true);
      expect(lpCorridorMoved(pool, sides, { floor: made.floor, ceiling: made.ceiling * 3 })).toBe(true);
    });
  });
});
