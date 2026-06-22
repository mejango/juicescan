// The table account-search matches by address substring (ENS is layered on async). matchAccountsByAddress is
// the pure core: case-insensitive substring, excludes already-chipped addresses, capped at `limit`.
import { describe, it, expect } from 'vitest';
import { matchAccountsByAddress } from '../src/discover.js';

const items = [
  { address: '0x0ee8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5e26' },
  { address: '0x3705bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb087c' },
  { address: '0xCAFE000000000000000000000000000000005e26' },
];
const addrs = (r) => r.map((i) => i.address);

describe('matchAccountsByAddress', () => {
  it('matches a prefix', () => {
    expect(addrs(matchAccountsByAddress(items, '0x3705', [], 8))).toEqual([items[1].address]);
  });
  it('matches a substring anywhere, case-insensitive', () => {
    expect(addrs(matchAccountsByAddress(items, '5e26', [], 8))).toEqual([items[0].address, items[2].address]);
    expect(addrs(matchAccountsByAddress(items, 'cafe', [], 8))).toEqual([items[2].address]); // uppercase address, lowercase query
  });
  it('empty query → no matches', () => {
    expect(matchAccountsByAddress(items, '', [], 8)).toEqual([]);
    expect(matchAccountsByAddress(items, '   ', [], 8)).toEqual([]);
  });
  it('excludes already-selected (chipped) addresses', () => {
    expect(addrs(matchAccountsByAddress(items, '5e26', [items[0].address.toLowerCase()], 8))).toEqual([items[2].address]);
  });
  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ address: '0xa' + String(i).padStart(39, '0') }));
    expect(matchAccountsByAddress(many, '0xa', [], 5).length).toBe(5);
  });
  it('tolerates null/empty inputs', () => {
    expect(matchAccountsByAddress([], '0x1', [], 8)).toEqual([]);
    expect(matchAccountsByAddress(items, null, [], 8)).toEqual([]);
  });
});
