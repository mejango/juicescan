// The lean pay preparation must answer, and read, exactly as nana-sdk-core does at 557a9fc, case for case: metadata
// bytes, previews, minimums, refusals, the pay transaction and every read and quote in order.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BaseError, ContractFunctionRevertedError, keccak256, toHex } from 'viem';
import { build721PayMetadata, buildBuybackPayMetadata, buildPayTx, buildUserPayMetadata, PAY_SPEC_UNREADABLE_MESSAGE, PAY_SWAP_QUOTE_FAILED_MESSAGE, PaySwapQuoteFailedError, prepareUserPay, resolvePaymentTerminal } from '../src/pay-prepare.js';
import { slippageFloor } from '../src/slippage.js';

const revive = (_, v) => (v && typeof v === 'object' && '$bigint' in v ? BigInt(v.$bigint) : v);
const golden = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-557a9fc/pay-prepare.json'), 'utf8'), revive);

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
// The V4 quoter's UnexpectedRevertBytes(NotEnoughLiquidity(poolId)), and the buyback hook's SpecifiedSlippageExceeded.
const CANNOT_FILL = '0x6190b2b0' + '20'.padStart(64, '0') + '24'.padStart(64, '0') + '7a5ed734' + 'ab'.repeat(32) + '0'.repeat(56);
const REJECTS_MINIMUM = '0xe2d708a9' + '1'.padStart(64, '0') + '2'.padStart(64, '0');
function makeError(kind, message) {
  switch (kind) {
    case 'revert': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: [], functionName: 'f', data: '0x' }) });
    case 'cannotFill': return new BaseError(message, { cause: Object.assign(new Error('execution reverted'), { code: 3, data: CANNOT_FILL }) });
    case 'rejectsMinimum': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: [], functionName: 'previewPayFor', data: REJECTS_MINIMUM }) });
    case 'decoderData': return new BaseError(message, { cause: Object.assign(new Error('decode failed'), { data: CANNOT_FILL }) });
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

describe('prepareUserPay matches the SDK 557a9fc golden vectors', () => {
  it('replays every recorded scenario with identical results and identical reads, and never touches a wallet', async () => {
    const request = vi.fn();
    window.ethereum = { request };
    globalThis.ethereum = window.ethereum;
    expect(golden.sdkCommit).toBe('557a9fc');
    expect(golden.cases.some((c) => c.sdkOutput), 'no recorded divergence from the SDK').toBe(false);
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
    expect(count((c) => c.output.$error === PAY_SPEC_UNREADABLE_MESSAGE)).toBe(2);
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

  it('refuses a swap that lost a read, never a fallback minimum, which can be zero', async () => {
    const refused = prepared.filter((c) => c.output.$name === 'PaySwapQuoteFailedError');
    expect(refused.length).toBeGreaterThan(20);
    for (const c of refused) {
      expect(c.output.$error, c.name).toBe(PAY_SWAP_QUOTE_FAILED_MESSAGE);
      const unreadableSpec = /spec unreadable/.test(c.name);
      const zeroMinimum = /tiny mint entitlement/.test(c.name);
      expect(unreadableSpec || zeroMinimum || Object.values(c.reads).some((v) => v && (v.$throw || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0))), c.name + ' lost a read').toBe(true);
    }
    const error = await prepareUserPay(strictClient(byName('buyback quote failure').reads, []), byName('buyback quote failure').input).catch((e) => e);
    expect(error).toBeInstanceOf(PaySwapQuoteFailedError);
    expect(error.code).toBe('PAY_SWAP_QUOTE_FAILED');
    expect(error.cause).toBeInstanceOf(BaseError);
    // No swap route, or no quote possible: the fallback stands, flagged when a quote could not be read.
    for (const name of ['noop buyback spec mints', 'buyback quote of zero', 'buyback swap amount above uint128', 'chain with no direct buyback hook', 'router conversion on a chain with no router', 'no pool matches the spec']) {
      expect(byName(name).output.$error, name).toBeUndefined();
    }
    for (const name of ['buyback swap amount above uint128', 'noop buyback spec with a failed quote', 'no buyback hook, conversion quote fails', 'no buyback hook, destination preview fails']) {
      expect(byName(name).output.quoteFailed, name).toBe(true);
    }
  });

  it('keeps the mint minimum, unflagged, when the pool cannot fill or the hook rejects the quoted minimum', () => {
    for (const name of ['buyback pool cannot fill keeps the mint minimum', 'quoted preview rejects the minimum', 'router conversion pool cannot fill']) {
      const c = byName(name);
      expect(c.output.minReturnedTokens, name).toBe(989_999_999_999_999_999_998n);
      expect(c.output.quoteFailed, name).toBeUndefined();
    }
    expect(byName('buyback pool cannot fill with a tiny mint entitlement').output.$name).toBe('PaySwapQuoteFailedError');
    expect(byName('buyback quote fails with data that is not a revert').output.$name).toBe('PaySwapQuoteFailedError');
  });

  it("requires what minting the router's quoted conversion issues when the project has no buyback hook", () => {
    // 950 tokens minted on the quoted conversion, 1% off; the router's floor would mint 900.
    for (const name of ['no buyback hook, router registry mints the quoted conversion', 'no buyback hook, registry routes through the gateway', 'no buyback hook, paid to the gateway', 'no buyback hook, conversion on a V3 pool']) {
      expect(byName(name).output.minReturnedTokens, name).toBe(940_500_000_000_000_000_000n);
    }
    for (const name of ['no buyback hook, gateway to another router', 'no buyback hook, another terminal', 'no buyback hook, two accepted tokens', 'no buyback hook, two terminals', 'no buyback hook, native into wrapped native', 'no buyback hook, project token cashed out first', 'no buyback hook, conversion pool cannot fill', 'no buyback hook, chain with no router']) {
      expect(byName(name).output, name).toMatchObject({ minReturnedTokens: 891_000_000_000_000_000_000n });
      expect(byName(name).output.quoteFailed, name).toBeUndefined();
    }
  });

  it('retries a read that fails once, on a swap and on a router payment with no buyback hook', async () => {
    for (const name of ['buyback route chosen, slippage 100', 'no buyback hook, router registry mints the quoted conversion']) {
      const c = byName(name);
      const calls = [];
      const base = strictClient(c.reads, calls);
      let dropped = false;
      const flaky = { ...base, call: (p) => { if (!dropped) { dropped = true; return Promise.reject(new BaseError('socket hang up')); } return base.call(p); } };
      expect(JSON.parse(ser(await prepareUserPay(flaky, c.input)), revive), name).toEqual(c.output);
      expect(dropped, name).toBe(true);
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
