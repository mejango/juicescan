import { beforeEach, describe, expect, it } from 'vitest';
import { clearLaunchCalls, launchCallsFor, loadLaunchCalls, provesLaunch, saveLaunchCalls, unfinishedLaunchOutcome } from '../src/launch-retry.js';

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
  var H2 = '0x' + '22'.repeat(32);
  var call = { chainId: 8453, to: D, data: '0xabcd', value: 5n, gas: 900000n, scheduleValidUntil: 1700, rulesetCount: 2,
    proofs: [{ requestHash: H, nonce: 4n, deadline: 200 }, { requestHash: H2, nonce: 4n, deadline: 900 }] };

  it('keeps the exact calls with every signed request’s proof, and the launched chains per account', () => {
    expect(saveLaunchCalls(A.toUpperCase().replace('0X', '0x'), { replacing: true, calls: [call], done: [{ chainId: 1, hash: H, rulesetCount: 2 }] })).toBe(true);
    expect(loadLaunchCalls(A)).toEqual({ account: A, replacing: true,
      calls: [{ chainId: 8453, to: D, data: '0xabcd', value: '5', gas: '900000', scheduleValidUntil: 1700, rulesetCount: 2,
        proofs: [{ requestHash: H, nonce: '4', deadline: '200' }, { requestHash: H2, nonce: '4', deadline: '900' }] }],
      done: [{ chainId: 1, hash: H, rulesetCount: 2 }] });
    expect(loadLaunchCalls(D)).toBe(null);
    clearLaunchCalls(A);
    expect(loadLaunchCalls(A)).toBe(null);
  });

  it('reads nothing from a damaged record, one with no proof, or proofs at different nonces', () => {
    localStorage.setItem('jb-create-relayr-calls-v1:' + A, JSON.stringify({ account: A, calls: [{ chainId: 1, to: 'x', data: '0x', value: '0' }], done: [] }));
    expect(loadLaunchCalls(A)).toBe(null);
    saveLaunchCalls(A, { calls: [Object.assign({}, call, { proofs: [] })], done: [] });
    expect(loadLaunchCalls(A)).toBe(null);
    saveLaunchCalls(A, { calls: [Object.assign({}, call, { proofs: [call.proofs[0], { requestHash: H2, nonce: 5n, deadline: 900 }] })], done: [] });
    expect(loadLaunchCalls(A)).toBe(null);
  });

  it('belongs to a bundle only when every request of that bundle is one it signed', () => {
    saveLaunchCalls(A, { calls: [call], done: [] });
    var record = loadLaunchCalls(A);
    expect(launchCallsFor(record, [{ chain: 8453, requestHash: H2 }])[0].proof.deadline).toBe('900');
    expect(launchCallsFor(record, [{ chain: 8453, requestHash: '0x' + '33'.repeat(32) }])).toBe(null);
    expect(launchCallsFor(record, [{ chain: 1, requestHash: H }])).toBe(null);
    expect(launchCallsFor(record, [])).toBe(null);
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
