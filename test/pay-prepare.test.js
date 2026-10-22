// The lean pay preparation must answer, and read, exactly as nana-sdk-core 3.4.1 did, case for case: metadata
// bytes, previews, minimums, the pay transaction and every read and quote in order.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BaseError, ContractFunctionRevertedError, keccak256, toHex } from 'viem';
import { build721PayMetadata, buildBuybackPayMetadata, buildPayTx, buildUserPayMetadata, PAY_QUOTE_FAILED_MESSAGE, PAY_SWAP_QUOTE_FAILED_MESSAGE, prepareUserPay, resolvePaymentTerminal } from '../src/pay-prepare.js';
import { slippageFloor } from '../src/slippage.js';

const revive = (_, v) => (v && typeof v === 'object' && '$bigint' in v ? BigInt(v.$bigint) : v);
const golden = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-3.4.1/pay-prepare.json'), 'utf8'), revive);

const ser = (value) => JSON.stringify(value, (_, x) => (typeof x === 'bigint' ? { $bigint: x.toString() } : x));
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
// The ABI fragment a read passes is part of its identity: a wrong or empty ABI must miss.
function fragmentKey(abi, name) {
  const fragment = Array.isArray(abi) ? abi.find((e) => e.type === 'function' && e.name === name) : undefined;
  return fragment ? keccak256(toHex(canon(fragment))).slice(0, 18) : 'no-abi';
}
function keyOf(method, p) {
  switch (method) {
    case 'read': return `read|${p.address.toLowerCase()}|${p.functionName}|${fragmentKey(p.abi, p.functionName)}|${ser(p.args ?? [])}|${p.blockNumber}`;
    case 'call': return `call|${p.to.toLowerCase()}|${p.data}`;
    default: return `${method}|${ser(p ?? null)}`;
  }
}
function makeError(kind, message) {
  switch (kind) {
    case 'revert': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: [], functionName: 'f', data: '0x' }) });
    case 'transport': return new BaseError(message);
    default: return new Error(message);
  }
}
const outcome = (error) => ({ $error: error.message.replace(/\n\nVersion:[^]*$/, ''), $name: error.name });

// Serves only what the fixture recorded and fails on any other read or call; `calls` keeps every request in order.
function strictClient(reads, calls) {
  const get = async (method, p) => {
    const key = keyOf(method, p);
    calls.push(key);
    if (!(key in reads)) throw new Error('unrecorded ' + method + ': ' + key);
    const value = reads[key];
    if (value && typeof value === 'object' && '$throw' in value) throw makeError(value.$kind, value.$throw);
    return value;
  };
  return { readContract: (p) => get('read', p), call: (p) => get('call', p) };
}

const actions = {
  prepareUserPay: (client, input) => prepareUserPay(client, input),
  resolvePaymentTerminal: (client, input) => resolvePaymentTerminal(client, input),
  buildUserPayMetadata: (_, input) => buildUserPayMetadata(input),
  build721PayMetadata: (_, input) => build721PayMetadata(input),
  buildBuybackPayMetadata: (_, input) => buildBuybackPayMetadata(input),
  buildPayTx: (_, input) => buildPayTx(input),
  slippageFloor: (_, input) => slippageFloor(input.quoted, input.slippageBps),
};
// buildPayTx carries the whole terminal ABI; its identity is the pay fragment.
const shape = (fn, value) => (fn === 'buildPayTx' ? { ...value, abi: fragmentKey(value.abi, 'pay') } : value);

async function run(c) {
  const calls = [];
  let actual;
  try { actual = JSON.parse(ser(shape(c.fn, await actions[c.fn](strictClient(c.reads, calls), c.input))), revive); } catch (error) { actual = outcome(error); }
  return { actual, calls };
}
const byName = (name) => {
  const found = golden.cases.find((c) => c.name === name);
  if (!found) throw new Error('no case ' + name);
  return found;
};
const prepared = golden.cases.filter((c) => c.fn === 'prepareUserPay');

describe('prepareUserPay matches SDK 3.4.1 golden vectors', () => {
  it('replays every recorded scenario with identical results and identical reads, and never touches a wallet', async () => {
    const request = vi.fn();
    window.ethereum = { request };
    globalThis.ethereum = window.ethereum;
    expect(golden.sdkVersion).toBe('3.4.1');
    expect(golden.cases.length).toBeGreaterThan(110);
    for (const c of golden.cases) {
      const { actual, calls } = await run(c);
      expect(actual, c.name).toEqual(c.output);
      const keys = Object.keys(c.reads);
      expect(calls.map((key) => keys.indexOf(key)), c.name + ' reads, in order, once each as recorded').toEqual(c.trace);
    }
    expect(request).not.toHaveBeenCalled();
    delete window.ethereum;
    delete globalThis.ethereum;
  });

  it('covers every route, tolerance and refusal', () => {
    const count = (predicate) => prepared.filter(predicate).length;
    const tolerances = new Set(prepared.map((c) => (c.input.slippageBps === undefined ? 'default' : String(c.input.slippageBps))));
    for (const bps of ['default', '0', '100', '4950', '9999', '10000', '-1']) expect(tolerances.has(bps), 'slippage ' + bps).toBe(true);
    // A quoted swap carries a nonzero minimum in its metadata; the fallback keeps the zero-minimum quote.
    const minimumOf = (metadata) => BigInt('0x' + metadata.slice(2 + 64 * 3, 2 + 64 * 4));
    expect(count((c) => !c.output.$error && minimumOf(c.output.metadata) > 0n)).toBeGreaterThan(15);
    expect(count((c) => Object.keys(c.reads).some((k) => k.startsWith('call|')))).toBeGreaterThan(30);
    expect(count((c) => Object.keys(c.reads).some((k) => k.includes('|previewTerminalPayOf|')))).toBeGreaterThan(5);
    expect(count((c) => Object.keys(c.reads).some((k) => k.includes('|extraDataHookOf|')))).toBeGreaterThan(2);
    expect(count((c) => Object.keys(c.reads).some((k) => k.includes('|discoverBestPool|') && JSON.stringify(c.reads[k]).includes('"isV4":false')))).toBeGreaterThan(1);
    expect(count((c) => c.input.tiers?.tierIdsToMint.length > 0)).toBeGreaterThan(4);
    expect(count((c) => c.output.$error === PAY_QUOTE_FAILED_MESSAGE)).toBe(2);
    expect(count((c) => c.output.minReturnedTokens === 0n)).toBeGreaterThan(2);
    for (const fn of Object.keys(actions)) expect(golden.cases.some((c) => c.fn === fn), fn).toBe(true);
  });

  it('fails closed: a failed preview or hook read throws, never a zero minimum', async () => {
    for (const name of ['preview failure throws', 'preview transport failure throws', 'registry hook read failure throws', 'omnichain hook read failure throws', 'unreadable buyback spec throws', 'slippage 10000 rejects', 'unsupported chain throws']) {
      const c = byName(name);
      expect(c.output.$error, name).toBeTruthy();
      const { actual } = await run(c);
      expect(actual.$error, name).toBe(c.output.$error);
    }
  });

  it('pins the chosen swap: the quote floored by the tolerance becomes the hook minimum', () => {
    const c = byName('buyback route chosen, slippage 100');
    // 1150 tokens quoted, 1% off: 1138.5 tokens, carried as the metadata minimum and the terminal minimum.
    expect(c.output.minReturnedTokens).toBe(1_138_500_000_000_000_000_000n);
    expect(c.output.metadata.slice(2 + 64 * 3, 2 + 64 * 4)).toBe(1_138_500_000_000_000_000_000n.toString(16).padStart(64, '0'));
    expect(byName('buyback quote below mint keeps the mint path').output.minReturnedTokens).toBe(989_999_999_999_999_999_998n);
  });

  it('diverges from 3.4.1 only where a swap route lost a read: never a fallback minimum, which can be zero', () => {
    const divergent = golden.cases.filter((c) => c.sdkOutput);
    expect(divergent.length).toBe(20);
    for (const c of divergent) {
      expect(c.output, c.name).toEqual({ $error: PAY_SWAP_QUOTE_FAILED_MESSAGE, $name: 'Error' });
      const unreadableSpec = /spec unreadable/.test(c.name);
      expect(unreadableSpec || Object.values(c.reads).some((v) => v && (v.$throw || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0))), c.name + ' lost a read').toBe(true);
    }
    // 3.4.1 sent a zero minimum here: an entitlement of 2 less its two rounding units.
    expect(byName('quote failure with a tiny mint entitlement').sdkOutput.minReturnedTokens).toBe(0n);
    // No swap route, or no quote possible on the chain: the fallback stands.
    for (const name of ['noop buyback spec mints', 'buyback quote of zero', 'buyback swap amount above uint128', 'chain with no direct buyback hook', 'router conversion on a chain with no router', 'no pool matches the spec']) {
      expect(byName(name).output.$error, name).toBeUndefined();
    }
  });

  it('refuses a swap whose quote is malformed or whose client throws synchronously, never a fallback minimum', async () => {
    const c = byName('quote failure with a tiny mint entitlement');
    const client = (patch) => { const base = strictClient(c.reads, []); return { ...base, ...patch(base) }; };
    const truncated = client(() => ({ call: async () => ({ data: '0x12' }) }));
    await expect(prepareUserPay(truncated, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
    const syncCall = client(() => ({ call: () => { throw new Error('socket closed'); } }));
    await expect(prepareUserPay(syncCall, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
    const syncRead = client((base) => ({ readContract: (p) => { if (p.functionName === 'poolKeyOf') throw new Error('socket closed'); return base.readContract(p); } }));
    await expect(prepareUserPay(syncRead, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
    for (const empty of [undefined, null]) {
      const emptyCall = client(() => ({ call: async () => empty }));
      await expect(prepareUserPay(emptyCall, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
      const emptyRead = client((base) => ({ readContract: async (p) => (p.functionName === 'poolKeyOf' ? empty : base.readContract(p)) }));
      await expect(prepareUserPay(emptyRead, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
    }
    const r = byName('router converts and the buyback swaps');
    const routerEmpty = { ...strictClient(r.reads, []) };
    const routerRead = routerEmpty.readContract;
    routerEmpty.readContract = async (p) => (p.functionName === 'projectIdOf' ? undefined : routerRead(p));
    await expect(prepareUserPay(routerEmpty, r.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
    const malformed = client(() => ({ call: async () => { throw new SyntaxError('Cannot convert 0xzz to a BigInt'); } }));
    await expect(prepareUserPay(malformed, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
  });

  it('never sends a swap with a zero mint-path minimum, even when no read failed', async () => {
    const c = byName('quote failure with a tiny mint entitlement');
    const base = strictClient(c.reads, []);
    const otherPool = { currency0: '0x0000000000000000000000000000000000000000', currency1: '0x9999999999999999999999999999999999999999', fee: 1, tickSpacing: 1, hooks: '0x0000000000000000000000000000000000000000' };
    const noPool = { ...base, readContract: async (p) => (p.functionName === 'poolKeyOf' ? otherPool : p.functionName === 'accountingContextsOf' ? [] : base.readContract(p)) };
    await expect(prepareUserPay(noPool, c.input)).rejects.toThrow(PAY_SWAP_QUOTE_FAILED_MESSAGE);
  });

  it('builds the same pay transaction the SDK does, with the terminal ABI from the registry', () => {
    const c = byName('buildPayTx native');
    const tx = buildPayTx(c.input);
    expect(tx.functionName).toBe('pay');
    expect(tx.value).toBe(c.input.amount);
    expect(buildPayTx(byName('buildPayTx erc20').input).value).toBe(0n);
  });
});
