// A wallet that holds the needed permission from the live owner may act, as the contracts allow.
import { describe, it, expect } from 'vitest';
import { accountHoldsPermissionOn } from '../src/discover.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const HOLDER = '0x2222222222222222222222222222222222222222';
const project = { chainId: 1, id: 7, idByChain: { 1: 7, 8453: 9 } };
const chains = [{ id: 1 }, { id: 8453 }];

function reader(grants, failChain) {
  const calls = [];
  const read = (chainId, contract, _abi, fn, args) => {
    calls.push([chainId, contract, fn, args]);
    if (chainId === failChain) return Promise.reject(new Error('rpc'));
    if (fn === 'ownerOf') return Promise.resolve(OWNER);
    return Promise.resolve(!!grants[chainId]);
  };
  read.calls = calls;
  return read;
}

describe('accountHoldsPermissionOn', () => {
  it('admits the owner without reading permissions', async () => {
    const read = reader({});
    expect(await accountHoldsPermissionOn(project, chains, OWNER.toUpperCase().replace('0X', '0x'), 2, read)).toBe(true);
    expect(read.calls.every(c => c[2] === 'ownerOf')).toBe(true);
  });
  it('admits a holder only when every chain grants it, counting ROOT and wildcard', async () => {
    const all = reader({ 1: true, 8453: true });
    expect(await accountHoldsPermissionOn(project, chains, HOLDER, 2, all)).toBe(true);
    const check = all.calls.find(c => c[2] === 'hasPermission');
    expect(check[3].slice(0, 2)).toEqual([HOLDER, OWNER]);
    expect(check[3].slice(3)).toEqual([2n, true, true]);
    expect(await accountHoldsPermissionOn(project, chains, HOLDER, 2, reader({ 1: true }))).toBe(false);
  });
  it('treats an unread chain as not allowed', async () => {
    expect(await accountHoldsPermissionOn(project, chains, HOLDER, 2, reader({ 1: true, 8453: true }, 8453))).toBe(false);
    expect(await accountHoldsPermissionOn(project, [], HOLDER, 2, reader({}))).toBe(false);
    expect(await accountHoldsPermissionOn({ chainId: 1, id: 7 }, chains, HOLDER, 2, reader({ 1: true, 8453: true }))).toBe(false);
  });
});
