import { describe, expect, it } from 'vitest';
import { encodeFunctionResult, keccak256, toHex } from 'viem';
import {
  CREATE_BATCH_ABI, MULTICALL3, SAFE_FACTORY, bundleSafeLaunch, predictSafeAddress, resolveSafePlan, safePolicyIssue,
  safeSignerAddress, unbundleSafeLaunch, verifySafe, verifySafeSimulation,
} from '../src/safe-create.js';

var OWNERS = ['0x0000000000000000000000000000000000000002', '0x0000000000000000000000000000000000000003', '0x0000000000000000000000000000000000000004'];
// The SDK's own vector (packages/core/src/safe.test.ts): the same policy must give the same address.
var POLICY = { owners: OWNERS, threshold: 2, saltNonce: toHex(42n, { size: 32 }), proxyCreationCode: '0x6001600055' };
var PLAN = Object.assign({}, POLICY, { address: '0xF0CBF9d51dEe3F870E12f3b4dC36cB5f9a3e4132' });
var LAUNCH = { to: '0x0000000000000000000000000000000000000005', data: '0xabcdef', value: 7n };
var batchResult = function (results) { return encodeFunctionResult({ abi: CREATE_BATCH_ABI, functionName: 'aggregate3Value', result: results }); };

describe('a new Safe’s signers', () => {
  it('accepts 2 to 20 different addresses and an approval count within them', () => {
    expect(safePolicyIssue(OWNERS, 2)).toBe('');
    expect(safePolicyIssue(OWNERS.slice(0, 1), 1)).toMatch(/2 to 20/);
    expect(safePolicyIssue(OWNERS.concat(['']), 2)).toMatch(/2 to 20/);
    expect(safePolicyIssue([OWNERS[0], OWNERS[0].toUpperCase().replace('0X', '0x')], 1)).toMatch(/different/);
    expect(safePolicyIssue(OWNERS, 4)).toMatch(/approve/);
    expect(safePolicyIssue(OWNERS, 0)).toMatch(/approve/);
  });

  it('refuses the zero address and Safe’s list sentinel', () => {
    expect(safeSignerAddress('0x0000000000000000000000000000000000000000')).toBe(null);
    expect(safeSignerAddress('0x0000000000000000000000000000000000000001')).toBe(null);
    expect(safeSignerAddress(' ' + OWNERS[0] + ' ')).toBe(OWNERS[0]);
    expect(safeSignerAddress('name.eth')).toBe(null);
  });
});

describe('the Safe’s address', () => {
  it('is the one the SDK predicts for the same policy, and moves with the policy', () => {
    expect(predictSafeAddress(POLICY)).toBe(PLAN.address);
    expect(predictSafeAddress(Object.assign({}, POLICY, { threshold: 3 }))).not.toBe(PLAN.address);
    expect(predictSafeAddress(Object.assign({}, POLICY, { saltNonce: toHex(43n, { size: 32 }) }))).not.toBe(PLAN.address);
  });

  it('is resolved only where the canonical Safe contracts run, with one creation code on every chain', async () => {
    var chain = function (creationCode, missing) {
      return {
        getCode: async function (input) { return input.address === missing ? '0x' : '0x00'; },
        readContract: async function () { return creationCode; },
      };
    };
    // The stand-in code does not hash to the pinned contracts, so creation is refused.
    await expect(resolveSafePlan({ owners: OWNERS, threshold: 2, salt: toHex(1n, { size: 32 }), role: 'owner' }, [chain('0x6001600055')]))
      .rejects.toThrow(/unavailable/);
    await expect(resolveSafePlan({ owners: OWNERS, threshold: 9, salt: toHex(1n, { size: 32 }), role: 'owner' }, [chain('0x6001600055')]))
      .rejects.toThrow(/approve/);
  });
});

describe('the creation batch', () => {
  it('creates the Safe, then launches, and carries the launch’s value', () => {
    var batch = bundleSafeLaunch(LAUNCH, PLAN);
    expect(batch.to).toBe(MULTICALL3);
    expect(batch.value).toBe(7n);
    expect(batch.args[0].map(function (call) { return [call.target, call.allowFailure, call.value]; }))
      .toEqual([[SAFE_FACTORY, true, 0n], [LAUNCH.to, false, 7n]]);
    expect(unbundleSafeLaunch(batch, PLAN)).toEqual(LAUNCH);
  });

  it('is refused for a plan whose address is not its policy’s, and is not read back for another plan', () => {
    expect(function () { bundleSafeLaunch(LAUNCH, Object.assign({}, PLAN, { threshold: 3 })); }).toThrow(/differs/);
    var other = Object.assign({}, POLICY, { threshold: 3 });
    other.address = predictSafeAddress(other);
    expect(unbundleSafeLaunch(bundleSafeLaunch(LAUNCH, PLAN), other)).toBe(null);
    expect(unbundleSafeLaunch(LAUNCH, PLAN)).toBe(null);
  });
});

describe('the simulated batch', () => {
  var nothingThere = { getCode: async function () { return '0x'; } };

  it('passes when the factory returns the reviewed address and the launch ran', async () => {
    await expect(verifySafeSimulation(nothingThere, PLAN, batchResult([
      { success: true, returnData: toHex(BigInt(PLAN.address), { size: 32 }) }, { success: true, returnData: '0x' }]))).resolves.toBeUndefined();
  });

  it('refuses another address, a failed launch, and a failed creation with no matching Safe', async () => {
    await expect(verifySafeSimulation(nothingThere, PLAN, batchResult([
      { success: true, returnData: toHex(5n, { size: 32 }) }, { success: true, returnData: '0x' }]))).rejects.toThrow(/different Safe/);
    await expect(verifySafeSimulation(nothingThere, PLAN, batchResult([
      { success: true, returnData: toHex(BigInt(PLAN.address), { size: 32 }) }, { success: false, returnData: '0x' }]))).rejects.toThrow(/every required call/);
    await expect(verifySafeSimulation(nothingThere, PLAN, batchResult([
      { success: false, returnData: '0x' }, { success: true, returnData: '0x' }]))).rejects.toThrow(/does not match/);
    await expect(verifySafeSimulation(nothingThere, PLAN, '0x')).rejects.toThrow(/no results/);
  });
});

describe('a deployed Safe', () => {
  it('is missing, not wrong, when nothing is at the address and that is allowed', async () => {
    var empty = { getCode: async function () { return '0x'; } };
    await expect(verifySafe(empty, PLAN, { allowMissing: true })).resolves.toBe(false);
    await expect(verifySafe(empty, PLAN)).rejects.toThrow(/does not match/);
  });

  it('is refused when other code runs at the address', async () => {
    var other = { getCode: async function () { return '0x6000'; } };
    expect(keccak256('0x6000')).not.toBe('0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c');
    await expect(verifySafe(other, PLAN, { allowMissing: true })).rejects.toThrow(/does not match/);
  });
});
