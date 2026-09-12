// The Safe operator batch's pure core: step builders round-trip through the registry ABIs and match the reference
// calldata, MultiSend packs/decodes byte-for-byte, ordering rules are data, and the tray storage is BigInt-safe and
// fails closed on anything it cannot re-encode.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeFunctionData, toFunctionSelector } from 'viem';
import {
  STEP_KINDS, buildStep, upsertStep, moveStep, removeStep, checkBatchOrder, dependsOnPrior, composeBatch, encodeMultiSend, decodeMultiSend,
  multiSendBatchCalls, mirrorBatch, MULTI_SEND_CALL_ONLY, NATIVE_TOKEN, multiSendAbi, loadTray, saveTray, clearTray, trayKey, registerPowerKinds, TRAY_UPDATED_EVENT,
} from '../src/safe-batch.js';

const HOOK = '0xB222Da5A71e8FB89a5A38b7c920EaB5DfbC74B91', TERMINAL = '0x4a56AEf5b6A5b9742AbB02cA67C5a85ba183D901';
const REGISTRY = '0x72F55a54CD53410a5Ff175508a5A384227081788', ROUTER_REGISTRY = '0xe0427F250fdb0379c8E98e884Ee4570521208CbC';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SET_HOOK = '0x779b02900000000000000000000000000000000000000000000000000000000000000002000000000000000000000000b222da5a71e8fb89a5a38b7c920eab5dfbc74b91';
const SET_POOL = '0x345c42130000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000000c80000000000000000000000000000000000000000000000000000000000000708000000000000000000000000000000000000000000000000000000000000eeee';
const SET_TERMINAL = '0xf3e37d0100000000000000000000000000000000000000000000000000000000000000020000000000000000000000004a56aef5b6a5b9742abb02ca67c5a85ba183d901';

const hook = () => buildStep('setHookFor', { chainId: 11155111, projectId: 2, values: { hook: HOOK } });
const pool = (twapWindow = 1800) => buildStep('setPoolFor', { chainId: 11155111, projectId: 2, values: { fee: 10000, tickSpacing: 200, twapWindow, terminalToken: NATIVE_TOKEN } });
const terminal = () => buildStep('setTerminalFor', { chainId: 11155111, projectId: 2, values: { terminal: TERMINAL } });

beforeEach(() => { localStorage.clear(); });

describe('step builders', () => {
  it('encode the three preset calls byte-for-byte against the reference calldata and round-trip through their ABIs', () => {
    const steps = [hook(), pool(), terminal()];
    expect(steps.map(s => s.data)).toEqual([SET_HOOK, SET_POOL, SET_TERMINAL]);
    expect(steps.map(s => s.to.toLowerCase())).toEqual([REGISTRY, REGISTRY, ROUTER_REGISTRY].map(a => a.toLowerCase()));
    expect(steps.map(s => s.data.slice(0, 10))).toEqual(['0x779b0290', '0x345c4213', '0xf3e37d01']);
    expect(toFunctionSelector('setPoolFor(uint256,uint24,int24,uint256,address)')).toBe('0x345c4213');
    steps.forEach(s => {
      const decoded = decodeFunctionData({ abi: s.abi, data: s.data });
      expect(decoded.functionName).toBe(s.functionName);
      expect(decoded.args[0]).toBe(2n);
      expect(s.value).toBe(0n); expect(s.chainId).toBe(11155111); expect(s.projectId).toBe(2n);
    });
    const poolArgs = decodeFunctionData({ abi: steps[1].abi, data: steps[1].data }).args;
    expect(poolArgs).toEqual([2n, 10000, 200, 1800n, NATIVE_TOKEN]);
    expect(steps[1].detail).toBe('native pool, fee 10000, tick spacing 200, TWAP 1800s');
    expect(steps[0].id).toBe('setHookFor:' + REGISTRY.toLowerCase());
  });

  it('target the resolved hook for setTwapWindowOf and refuse a chain without the contract', () => {
    const twap = buildStep('setTwapWindowOf', { chainId: 8453, projectId: 6, to: HOOK, values: { terminalToken: USDC_BASE, twapWindow: 900 } });
    expect(twap.to).toBe(HOOK);
    expect(decodeFunctionData({ abi: twap.abi, data: twap.data }).args).toEqual([6n, USDC_BASE, 900n]);
    expect(() => buildStep('nope', { chainId: 1, projectId: 1, values: {} })).toThrow(/Unknown batch step/);
  });

  it('wrap a power descriptor by function name; named kinds keep their own entries', () => {
    const mintAbi = [{ type: 'function', name: 'mintTokensOf', stateMutability: 'nonpayable', outputs: [{ type: 'uint256' }],
      inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'tokenCount', type: 'uint256' }, { name: 'beneficiary', type: 'address' }, { name: 'memo', type: 'string' }, { name: 'useReservedPercent', type: 'bool' }] }];
    const other = [{ type: 'function', name: 'setHookFor', stateMutability: 'nonpayable', inputs: [{ name: 'x', type: 'uint256' }], outputs: [] }];
    registerPowerKinds([
      { title: 'Mint tokens', contract: 'JBController', abi: mintAbi, fn: 'mintTokensOf', chainsDefault: 'primary', buildArgs: (v, cid, pid) => [pid, BigInt(v.tokenCount), v.beneficiary, '', !!v.useReservedPercent] },
      { title: 'Clobber', contract: 'JBController', abi: other, fn: 'setHookFor', buildArgs: () => [1n] },
    ]);
    expect(STEP_KINDS.mintTokensOf.perChain).toBe(true);
    expect(STEP_KINDS.setHookFor.contract).toBe('JBBuybackHookRegistry');
    const mint = buildStep('mintTokensOf', { chainId: 8453, projectId: 6, values: { tokenCount: '5', beneficiary: HOOK, useReservedPercent: true } });
    expect(decodeFunctionData({ abi: mintAbi, data: mint.data }).args).toEqual([6n, 5n, HOOK, '', true]);
    expect(mint.detail).toBe('tokenCount 5, beneficiary 0xB222…4B91, useReservedPercent true');
  });
});

describe('ordering and dependencies', () => {
  it('flags setPoolFor before setHookFor only when both are present, and moveStep fixes it', () => {
    const wrong = [pool(), hook(), terminal()];
    const check = checkBatchOrder(wrong);
    expect(check.ok).toBe(false);
    expect(check.problems).toEqual([{ index: 0, message: 'Set the buyback hook before registering its pool. setPoolFor registers on the project’s current hook.' }]);
    expect(checkBatchOrder([pool(), terminal()]).ok).toBe(true);
    expect(checkBatchOrder([hook(), terminal()]).ok).toBe(true);
    const fixed = moveStep(wrong, 0, 1);
    expect(fixed.map(s => s.kind)).toEqual(['setHookFor', 'setPoolFor', 'setTerminalFor']);
    expect(checkBatchOrder(fixed).ok).toBe(true);
    expect(moveStep(fixed, 5, 0)).toEqual(fixed);
    expect(dependsOnPrior(fixed, 1)).toBe(true);
    expect(dependsOnPrior(fixed, 0)).toBe(false);
    expect(dependsOnPrior([pool(), terminal()], 0)).toBe(false);
  });

  it('composeBatch keeps the given order and carries the problems', () => {
    const composed = composeBatch([hook(), pool(), terminal()]);
    expect(composed.ok).toBe(true);
    expect(composed.calls).toEqual([{ to: REGISTRY.toLowerCase(), data: SET_HOOK, value: 0n }, { to: REGISTRY.toLowerCase(), data: SET_POOL, value: 0n }, { to: ROUTER_REGISTRY.toLowerCase(), data: SET_TERMINAL, value: 0n }]);
    expect(composeBatch([pool(), hook()]).problems).toHaveLength(1);
  });

  it('upsertStep replaces a step with the same kind + target in place; removeStep drops by index', () => {
    let steps = upsertStep([], hook());
    steps = upsertStep(steps, pool(1800));
    steps = upsertStep(steps, pool(600));
    expect(steps).toHaveLength(2);
    expect(steps[1].values.twapWindow).toBe(600);
    expect(decodeFunctionData({ abi: steps[1].abi, data: steps[1].data }).args[3]).toBe(600n);
    steps = upsertStep(steps, terminal());
    expect(steps.map(s => s.kind)).toEqual(['setHookFor', 'setPoolFor', 'setTerminalFor']);
    expect(removeStep(steps, 1).map(s => s.kind)).toEqual(['setHookFor', 'setTerminalFor']);
  });
});

describe('MultiSend codec', () => {
  it('packs op 0 | 20-byte to | 32-byte value | 32-byte length | data per call and decodes back', () => {
    const calls = composeBatch([hook(), pool(), terminal()]).calls;
    const encoded = encodeMultiSend(calls);
    expect(encoded.slice(0, 10)).toBe('0x8d80ff0a');
    const packed = decodeFunctionData({ abi: multiSendAbi, data: encoded }).args[0].slice(2);
    const first = packed.slice(0, 2 + 40 + 64 + 64 + SET_HOOK.length - 2);
    expect(first.slice(0, 2)).toBe('00');
    expect(first.slice(2, 42)).toBe(REGISTRY.slice(2).toLowerCase());
    expect(first.slice(42, 106)).toBe('0'.repeat(64));
    expect(first.slice(106, 170)).toBe('0'.repeat(62) + '44');
    expect(first.slice(170)).toBe(SET_HOOK.slice(2));
    expect(packed.length).toBe(calls.reduce((n, c) => n + 170 + c.data.length - 2, 0));
    const decoded = decodeMultiSend(encoded);
    expect(decoded).toEqual([
      { operation: 0, to: REGISTRY, value: 0n, data: SET_HOOK },
      { operation: 0, to: REGISTRY, value: 0n, data: SET_POOL },
      { operation: 0, to: ROUTER_REGISTRY, value: 0n, data: SET_TERMINAL },
    ]);
    expect(decodeMultiSend('0x12345678')).toBeNull();
    const packedOnly = bytes => encodeFunctionData({ abi: multiSendAbi, functionName: 'multiSend', args: [bytes] });
    expect(decodeMultiSend(packedOnly('0x' + '00'.repeat(50)))).toBeNull();
    expect(decodeMultiSend(packedOnly('0x00' + REGISTRY.slice(2) + '0'.repeat(64) + '0'.repeat(62) + '44' + SET_HOOK.slice(2, 22)))).toBeNull();
  });

  it('recognizes a queued batch only as an operation-1 MultiSendCallOnly record', () => {
    const data = encodeMultiSend(composeBatch([hook(), terminal()]).calls);
    expect(multiSendBatchCalls({ to: MULTI_SEND_CALL_ONLY.toLowerCase(), operation: 1, data })).toHaveLength(2);
    expect(multiSendBatchCalls({ to: MULTI_SEND_CALL_ONLY, operation: 0, data })).toBeNull();
    expect(multiSendBatchCalls({ to: REGISTRY, operation: 1, data })).toBeNull();
    expect(multiSendBatchCalls({ to: MULTI_SEND_CALL_ONLY, operation: 1, data: SET_HOOK })).toBeNull();
  });
});

describe('mirrorBatch', () => {
  it('keeps values, re-resolves per-chain addresses and project ids, re-reads perChain kinds, and lists skips', async () => {
    const twap = buildStep('setTwapWindowOf', { chainId: 11155111, projectId: 2, to: HOOK, values: { terminalToken: NATIVE_TOKEN, twapWindow: 900 } });
    const resolve = vi.fn(async (kind, toChainId, step) => {
      if (kind === 'setHookFor' || kind === 'setTerminalFor') return { values: step.values };
      if (kind === 'setPoolFor') return { values: { fee: 3000, tickSpacing: 60, twapWindow: 1800, terminalToken: USDC_BASE } };
      if (kind === 'setTwapWindowOf') return { reason: 'no buyback hook on Base' };
      return null;
    });
    const foreign = Object.assign(hook(), { chainId: 1 });
    const result = await mirrorBatch([hook(), pool(), terminal(), twap, foreign], 11155111, 8453, resolve, 6);
    expect(resolve.mock.calls.map(c => [c[0], c[1]])).toEqual([['setHookFor', 8453], ['setPoolFor', 8453], ['setTerminalFor', 8453], ['setTwapWindowOf', 8453]]);
    expect(result.steps.map(s => s.kind)).toEqual(['setHookFor', 'setPoolFor', 'setTerminalFor']);
    result.steps.forEach(s => { expect(s.chainId).toBe(8453); expect(s.projectId).toBe(6n); });
    expect(result.steps[0].values).toEqual({ hook: HOOK });
    expect(decodeFunctionData({ abi: result.steps[0].abi, data: result.steps[0].data }).args).toEqual([6n, HOOK]);
    expect(decodeFunctionData({ abi: result.steps[1].abi, data: result.steps[1].data }).args).toEqual([6n, 3000, 60, 1800n, USDC_BASE]);
    expect(result.skipped).toEqual([{ kind: 'setTwapWindowOf', label: 'Set TWAP window', reason: 'no buyback hook on Base' }]);
  });

  it('skips a perChain kind with a generic reason when the resolver returns nothing or throws', async () => {
    const nothing = await mirrorBatch([pool()], 11155111, 8453, async () => null, 6);
    expect(nothing.steps).toEqual([]);
    expect(nothing.skipped[0].reason).toBe('its values are chain-specific');
    const thrown = await mirrorBatch([pool()], 11155111, 8453, async () => { throw new Error('offline'); }, 6);
    expect(thrown.skipped[0].reason).toBe('offline');
  });
});

describe('tray storage', () => {
  it('round-trips BigInt-safe steps, dispatches the update event, and clears on empty', () => {
    const seen = vi.fn();
    document.addEventListener(TRAY_UPDATED_EVENT, seen);
    saveTray(11155111, 2, [hook(), pool()]);
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0][0].detail).toEqual({ chainId: 11155111, projectId: '2' });
    const loaded = loadTray(11155111, 2);
    expect(loaded).toHaveLength(2);
    expect(loaded[1].projectId).toBe(2n); expect(loaded[1].value).toBe(0n);
    expect(loaded[1].args).toEqual([2n, 10000, 200, 1800n, NATIVE_TOKEN]);
    expect(loaded[1].data).toBe(SET_POOL); expect(loaded[1].id).toBe(pool().id); expect(loaded[1].detail).toBe(pool().detail);
    expect(loadTray(11155111, '2')).toHaveLength(2);
    clearTray(11155111, 2);
    expect(localStorage.getItem(trayKey(11155111, 2))).toBeNull();
    expect(loadTray(11155111, 2)).toEqual([]);
    document.removeEventListener(TRAY_UPDATED_EVENT, seen);
  });

  it('discards a tray whose calldata does not re-encode from its own ABI and args, or that is malformed', () => {
    saveTray(11155111, 2, [hook(), pool()]);
    const key = trayKey(11155111, 2);
    const raw = JSON.parse(localStorage.getItem(key));
    raw[1].data = SET_POOL.replace(/708/, '709');
    localStorage.setItem(key, JSON.stringify(raw));
    expect(loadTray(11155111, 2)).toEqual([]);
    localStorage.setItem(key, '{not json');
    expect(loadTray(11155111, 2)).toEqual([]);
    localStorage.setItem(key, JSON.stringify([{ kind: 'setHookFor', to: 'nope' }]));
    expect(loadTray(11155111, 2)).toEqual([]);
    localStorage.setItem(key, JSON.stringify({ steps: [] }));
    expect(loadTray(11155111, 2)).toEqual([]);
  });
});
