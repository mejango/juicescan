import { describe, expect, it } from 'vitest';
import { metadataChangeRows, splitChangeRows } from '../src/edit-review-rows.js';

var chainNameOf = function (id) { return id === 1 ? 'Ethereum' : 'Base'; };
var ZERO = '0x0000000000000000000000000000000000000000';
var A = '0x00000000000000000000000000000000000000aa';
var B = '0x00000000000000000000000000000000000000bb';

describe('the details review', () => {
  it('states each changed field before and after, per chain', () => {
    var rows = metadataChangeRows([
      { chainId: 1, projectId: 7, previous: { name: 'Old', twitter: 'a' }, metadata: { name: 'New', twitter: 'a' } },
      { chainId: 8453, projectId: 9, previous: { name: 'Other', twitter: 'a' }, metadata: { name: 'New', twitter: 'a' } },
    ], chainNameOf);
    expect(rows).toEqual([
      ['Ethereum', 'Project #7'], ['Ethereum, Name', 'Old → New'],
      ['Base', 'Project #9'], ['Base, Name', 'Other → New'],
    ]);
  });

  it('names a logo, a cleared field, shop categories and a custom property', () => {
    var rows = metadataChangeRows([{ chainId: 1, projectId: 7,
      previous: { name: 'N', infoUri: 'https://a.example', logoUri: 'ipfs://old', extra: 1, gone: true },
      metadata: { name: 'N', infoUri: '', logoUri: 'ipfs://new', extra: 2, storeCategories: { 1: 'Hats' } } }], chainNameOf);
    expect(rows).toEqual([
      ['Ethereum', 'Project #7'],
      ['Ethereum, Website', 'https://a.example → —'],
      ['Ethereum, Logo', 'Replaced'],
      ['Ethereum, Custom property extra', 'Set to the reviewed value'],
      ['Ethereum, Custom property gone', 'Removed'],
      ['Ethereum, Shop categories', 'Added'],
    ]);
  });

  it('says so when a chain is pinned again unchanged, and never when anything differs', () => {
    var same = metadataChangeRows([{ chainId: 1, projectId: 7, previous: { name: 'N' }, metadata: { name: 'N' } }], chainNameOf);
    expect(same[1]).toEqual(['Ethereum, Fields', 'Unchanged, this chain’s profile is pinned again as is']);
    var nulled = metadataChangeRows([{ chainId: 1, projectId: 7, previous: { name: 'N', kept: 'abc' }, metadata: { name: 'N', kept: '', added: null } }], chainNameOf);
    expect(nulled.slice(1)).toEqual([
      ['Ethereum, Custom property kept', 'Set to the reviewed value'],
      ['Ethereum, Custom property added', 'Set to the reviewed value'],
    ]);
    var nested = metadataChangeRows([{ chainId: 1, projectId: 7, previous: { tags: ['a'] }, metadata: { tags: ['a', 'b'] } }], chainNameOf);
    expect(nested.some(function (row) { return /Unchanged/.test(row[1]); })).toBe(false);
  });
});

describe('the splits review', () => {
  var split = function (beneficiary, percent, more) {
    return Object.assign({ percent: percent, projectId: 0n, beneficiary: beneficiary, hook: ZERO, lockedUntil: 0 }, more || {});
  };

  it('lists who was paid, who will be, and the owner remainder', () => {
    expect(splitChangeRows({ chainName: 'Base', projectId: 9, rulesetId: 1700000000n, now: 100,
      previous: [split(A, 250000000n, { lockedUntil: 200 })],
      next: [split(A, 250000000n, { lockedUntil: 200 }), split(ZERO, 125000000n, { projectId: 3n }), split(ZERO, 5000000n, { hook: B })] })).toEqual([
      ['Base', 'Project #9, current ruleset 1700000000'],
      ['Base, Previous recipients', A + ' 25% (locked)'],
      ['Base, New recipients', A + ' 25% (locked); Project #3 12.5%; Hook ' + B + ' 0.5%'],
      ['Base, Owner remainder', '75% → 62%'],
    ]);
  });

  it('says None for an empty set', () => {
    var rows = splitChangeRows({ chainName: 'Base', projectId: 9, rulesetId: 1n, previous: [split(A, 1000000000n)], next: [] });
    expect(rows[2][1]).toBe('None');
    var caller = splitChangeRows({ chainName: 'Base', projectId: 9, rulesetId: 1n, previous: [], next: [split(ZERO, 1000000000n)] });
    expect(caller[2][1]).toBe('Whoever sends the distribution 100%');
    expect(rows[3][1]).toBe('0% → 100%');
  });
});
