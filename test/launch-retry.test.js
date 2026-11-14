import { beforeEach, describe, expect, it } from 'vitest';
import { clearLaunchCalls, loadLaunchCalls, provesLaunch, saveLaunchCalls, unfinishedLaunchOutcome } from '../src/launch-retry.js';

var A = '0x00000000000000000000000000000000000000aa';
var F = '0x00000000000000000000000000000000000000ff';
var D = '0x00000000000000000000000000000000000000dd';
var H = '0x' + '11'.repeat(32);

describe('what can be done about an unfinished relayed launch chain', () => {
  var at = function (more) { return unfinishedLaunchOutcome(Object.assign({ signedNonce: '4', chainNonce: 4n, timestamp: 100n, deadline: '200', reverted: false }, more)); };

  it('never signs again once the signed nonce was used: the launch may have run', () => {
    expect(at({ chainNonce: 5n })).toBe('ran');
    expect(at({ chainNonce: 5n, timestamp: 300n, reverted: true })).toBe('ran');
  });

  it('signs again when the old request expired unused, or its transaction reverted', () => {
    expect(at({ timestamp: 201n })).toBe('retry');
    expect(at({ reverted: true })).toBe('retry');
    expect(at({ unpaid: true })).toBe('retry');
    expect(at({ unpaid: true, chainNonce: 5n })).toBe('ran');
  });

  it('waits while the old request can still run and nothing proves it failed', () => {
    expect(at({})).toBe('wait');
    expect(at({ timestamp: 200n })).toBe('wait');
    expect(at({ chainNonce: 3n, reverted: true })).toBe('wait');
  });
});

describe('the saved launch calls', () => {
  beforeEach(() => { localStorage.clear(); });
  var call = { chainId: 8453, to: D, data: '0xabcd', value: 5n, gas: 900000n, scheduleValidUntil: 1700, rulesetCount: 2, requestHash: H, nonce: 4n, deadline: 200 };

  it('keeps the bundle, the exact calls with their own nonce proof, and the launched chains per account', () => {
    expect(saveLaunchCalls(A.toUpperCase().replace('0X', '0x'), { bundleUuid: 'b-1', replacing: true, calls: [call], done: [{ chainId: 1, hash: H, rulesetCount: 2 }] })).toBe(true);
    expect(loadLaunchCalls(A)).toEqual({ account: A, bundleUuid: 'b-1', replacing: true,
      calls: [{ chainId: 8453, to: D, data: '0xabcd', value: '5', gas: '900000', scheduleValidUntil: 1700, rulesetCount: 2, requestHash: H, nonce: '4', deadline: '200' }],
      done: [{ chainId: 1, hash: H, rulesetCount: 2 }] });
    expect(loadLaunchCalls(D)).toBe(null);
    clearLaunchCalls(A);
    expect(loadLaunchCalls(A)).toBe(null);
  });

  it('reads nothing from a damaged record, or one with no bundle or nonce proof', () => {
    localStorage.setItem('jb-create-relayr-calls-v1:' + A, JSON.stringify({ account: A, bundleUuid: 'b', calls: [{ chainId: 1, to: 'x', data: '0x', value: '0' }], done: [] }));
    expect(loadLaunchCalls(A)).toBe(null);
    saveLaunchCalls(A, { bundleUuid: '', calls: [call], done: [] });
    expect(loadLaunchCalls(A)).toBe(null);
  });
});

describe('proof that a chain launched', () => {
  var call = { to: D, data: '0xabcd', value: '5' };
  var good = { forwarder: F, account: A, call: call, transaction: { to: F }, receipt: { status: 'success' },
    request: { from: A, to: D, data: '0xABCD', value: 5n } };

  it('accepts the forwarder executing exactly this call for this account', () => {
    expect(provesLaunch(good)).toBe(true);
  });

  it('rejects a revert, another target, another caller, other data or value', () => {
    expect(provesLaunch(Object.assign({}, good, { receipt: { status: 'reverted' } }))).toBe(false);
    expect(provesLaunch(Object.assign({}, good, { transaction: { to: D } }))).toBe(false);
    expect(provesLaunch(Object.assign({}, good, { request: Object.assign({}, good.request, { from: D }) }))).toBe(false);
    expect(provesLaunch(Object.assign({}, good, { request: Object.assign({}, good.request, { data: '0xabce' }) }))).toBe(false);
    expect(provesLaunch(Object.assign({}, good, { request: Object.assign({}, good.request, { value: 6n }) }))).toBe(false);
    expect(provesLaunch(Object.assign({}, good, { request: null }))).toBe(false);
  });
});
