// Sticky split recipients follow juicebox.money's SDK module (v6/sticky): same recognition, group rules and labels.
import { describe, expect, it } from 'vitest';
import { checkStickyToken, decodeStickyGroupId, describeStickySplit, isStickySplit, stickyDistributorAddress, stickyGroupId, stickyRecipientLabel, validateStickyGroupId } from '../src/sticky.js';
import { describeSplitGroups } from '../src/tx-pretty-args.js';

var DISTRIBUTOR = '0x489d011dc34983eb2e219a5010806caa418cb46b';
var TOKEN = '0x1234567890abcdef1234567890abcdef12345678';

describe('Sticky split recipients', () => {
  it('recognizes a split by its hook alone, on a chain Sticky is deployed to', () => {
    expect(isStickySplit({ hook: DISTRIBUTOR.toUpperCase().replace('0X', '0x') }, 8453)).toBe(true);
    expect(isStickySplit({ hook: DISTRIBUTOR }, 1)).toBe(true);
    expect(isStickySplit({ hook: DISTRIBUTOR }, 137)).toBe(false);
    expect(isStickySplit({ hook: DISTRIBUTOR })).toBe(true);
    expect(isStickySplit({ hook: TOKEN }, 8453)).toBe(false);
    expect(stickyDistributorAddress(11155111)).toBe(DISTRIBUTOR);
  });

  it('labels each kind of group as juicebox.money does', () => {
    expect(describeStickySplit(0n)).toBe('Sticky group 0 (all holders by voting power)');
    expect(describeStickySplit(4052n)).toBe('Sticky holders stuck 4 to 52 weeks');
    expect(describeStickySplit(4000n)).toBe('Sticky holders stuck 4 weeks or more');
    expect(describeStickySplit(1000n)).toBe('Sticky holders stuck 1 week or more');
    expect(describeStickySplit(8008n)).toBe('Sticky holders stuck 8 weeks');
    expect(describeStickySplit(1001n)).toBe('Sticky holders stuck 1 week');
    // The distributor routes an invalid group to group 0.
    expect(describeStickySplit(52004n)).toBe('Sticky group 0 (all holders by voting power), since group 52004 is invalid');
    expect(describeStickySplit(7n)).toBe('Sticky group 0 (all holders by voting power), since group 7 is invalid');
    expect(stickyRecipientLabel({ projectId: 4052n, beneficiary: TOKEN }, 'STICKY')).toBe('Sticky holders stuck 4 to 52 weeks → STICKY');
    expect(stickyRecipientLabel({ projectId: 4052n, beneficiary: TOKEN }, '')).toBe('Sticky holders stuck 4 to 52 weeks → 0x1234…5678');
  });

  it('validates, decodes and encodes groups by the distributor\'s rule', () => {
    expect(validateStickyGroupId(0n)).toBeNull();
    expect(validateStickyGroupId(520520n)).toBeNull();
    expect(validateStickyGroupId(52n)).toBe('Tenure groups need a minimum of at least 1 week.');
    expect(validateStickyGroupId(521000n)).toBe('Minimum weeks can\'t be more than 520.');
    expect(validateStickyGroupId(4521n)).toBe('Maximum weeks can\'t be more than 520.');
    expect(validateStickyGroupId(52004n)).toBe('Maximum weeks can\'t be less than minimum weeks.');
    expect(decodeStickyGroupId(4052n)).toEqual({ kind: 'tenure', minWeeks: 4, maxWeeks: 52 });
    expect(decodeStickyGroupId(52004n)).toEqual({ kind: 'default' });
    expect(stickyGroupId(4, 52)).toBe(4052n);
    expect(stickyGroupId(4, 0)).toBe(4000n);
    // A large maximum never carries into the minimum.
    expect(() => stickyGroupId(4, 1000)).toThrow(/Maximum weeks/);
    expect(() => stickyGroupId(0, 5)).toThrow(/at least 1 week/);
    expect(() => stickyGroupId(1.5, 0)).toThrow(/whole weeks/);
  });

  it('names a Sticky split in a decoded argument, never as a project', () => {
    var steps = describeSplitGroups([{ groupId: 1n, splits: [{ percent: 500000000, projectId: 4052n, beneficiary: TOKEN, preferAddToBalance: false, lockedUntil: 0, hook: DISTRIBUTOR }] }]);
    expect(steps[0].rows[0][1]).toBe('Sticky holders stuck 4 to 52 weeks → Sticky token ' + TOKEN + ' | via StickyDistributor ' + DISTRIBUTOR);
  });

  it('checks a token the way the distributor does', async () => {
    var revert = Object.assign(new Error('revert'), { name: 'ContractFunctionRevertedError' });
    var client = function (answers) { return { readContract: function (call) { var a = answers[call.functionName]; return a instanceof Error ? Promise.reject(a) : Promise.resolve(a); } }; };
    expect(await checkStickyToken(client({ PROJECT_ID: 7n, tokenOf: TOKEN.toUpperCase().replace('0X', '0x'), symbol: 'STICKY' }), 8453, TOKEN, 'Base')).toEqual({ ok: true, symbol: 'STICKY' });
    expect(await checkStickyToken(client({ PROJECT_ID: revert }), 8453, TOKEN, 'Base')).toEqual({ ok: false, reason: '0x1234…5678 is not a Sticky token on Base.' });
    expect(await checkStickyToken(client({ PROJECT_ID: 7n, tokenOf: DISTRIBUTOR, symbol: 'X' }), 8453, TOKEN, 'Base')).toEqual({ ok: false, reason: '0x1234…5678 is not a Sticky token on Base.' });
    expect(await checkStickyToken(client({ PROJECT_ID: new Error('timeout') }), 8453, TOKEN, 'Base')).toEqual({ ok: false, reason: 'Could not check the Sticky token on Base.' });
    expect(await checkStickyToken(client({}), 137, TOKEN, 'Polygon')).toEqual({ ok: false, reason: 'Sticky is not deployed on Polygon.' });
  });
});
