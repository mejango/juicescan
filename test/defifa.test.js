// The lean Defifa actions must answer, and read, exactly as nana-sdk-core 3.4.1 did, case for case.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { erc721Abi } from 'viem';
import { getABI, getAddress, meta } from '../src/abi-registry.js';
import { DefifaNftTransactionRevertedError, MAX_DEFIFA_ACTION_NFTS, defifaPhaseAllowsCashOut, defifaPhaseAllowsPay, effectiveTierPrice, prepareDefifaCashOut, prepareDefifaPay, prepareDefifaTransfer, restoreDefifaNftReceiptContext, verifyDefifaNftReceipt, verifyDefifaNftTransaction } from '../src/defifa.js';

const revive = (k, v) => {
  if (v && typeof v === 'object' && '$bigint' in v) return BigInt(v.$bigint);
  if (k === 'abi' && v === '$abi:erc721') return erc721Abi;
  if (k === 'abi' && v === '$abi:terminal') return getABI('JBMultiTerminal', 8453);
  return v;
};
const golden = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-3.4.1/defifa.json'), 'utf8'), revive);

function ser(value) {
  return JSON.stringify(value, function (k, x) {
    if (typeof x === 'bigint') return { $bigint: x.toString() };
    if (k === 'abi' && Array.isArray(x) && typeof this.functionName === 'string') return x === erc721Abi ? '$abi:erc721' : { $fragment: x.find((e) => e.type === 'function' && e.name === this.functionName) };
    return x;
  });
}
function keyOf(method, p) {
  const args = (x) => ser(x ?? []);
  switch (method) {
    case 'read': return `read|${p.address.toLowerCase()}|${p.functionName}|${args(p.args)}|${p.blockNumber}`;
    case 'sim': return `sim|${p.address.toLowerCase()}|${p.functionName}|${args(p.args)}|${p.account.toLowerCase()}|${p.blockNumber}|${p.value ?? 0n}`;
    case 'code': return `code|${p.address.toLowerCase()}|${p.blockNumber}`;
    default: return `${method}|${ser(p ?? null)}`;
  }
}

// Serves only what the fixture recorded and fails on any other read.
function strictClient(reads, used) {
  const get = async (method, p) => {
    const key = keyOf(method, p);
    if (!(key in reads)) throw new Error('unrecorded read: ' + key);
    used.add(key);
    const value = reads[key];
    if (value && typeof value === 'object' && '$throw' in value) throw new Error(value.$throw);
    return value;
  };
  return {
    getChainId: () => get('chainId'), getBlockNumber: () => get('blockNumber'), getBytecode: (p) => get('code', p),
    readContract: (p) => get('read', p), simulateContract: (p) => get('sim', p), getTransaction: (p) => get('tx', p),
    getTransactionReceipt: (p) => get('receipt', p), getBlock: (p) => get('block', p),
  };
}

const actions = {
  prepareDefifaPay: (client, input) => prepareDefifaPay(client, input),
  prepareDefifaCashOut: (client, input) => prepareDefifaCashOut(client, input),
  prepareDefifaTransfer: (client, input) => prepareDefifaTransfer(client, input),
  restoreDefifaNftReceiptContext: (client, input) => restoreDefifaNftReceiptContext(client, input),
  verifyDefifaNftTransaction: async (client, input) => { await verifyDefifaNftTransaction(client, input.context, input.receipt); return null; },
  verifyDefifaNftReceipt: async (_, input) => { verifyDefifaNftReceipt(input.context, input.receipt); return null; },
};

async function run(c, reads) {
  const used = new Set();
    let actual;
  try { actual = JSON.parse(ser(await actions[c.fn](strictClient(reads, used), c.input)), revive); }
  catch (error) {
    actual = { $error: error.message, $name: error.name, ...(error.hash ? { hash: error.hash, chainId: error.chainId } : {}) };
    if (error.name === 'DefifaNftTransactionRevertedError') expect(error).toBeInstanceOf(DefifaNftTransactionRevertedError);
  }
  return { actual, used };
}

describe('defifa matches SDK 3.4.1 golden vectors', () => {
  it('replays every recorded scenario with identical results and identical reads', async () => {
    expect(golden.sdkVersion).toBe('3.4.1');
    expect(golden.cases.length).toBeGreaterThan(140);
    for (const c of golden.cases) {
      const reads = c.reads ?? {};
      const { actual, used } = await run(c, reads);
      expect(actual, c.name).toEqual(c.output);
      expect([...used].sort(), c.name + ' reads').toEqual(Object.keys(reads).sort());
    }
  });

  it('covers every action, its refusals and its recovery', () => {
    const count = (fn, error) => golden.cases.filter((c) => c.fn === fn && Boolean(c.output && c.output.$error) === error).length;
    for (const fn of Object.keys(actions)) {
      expect(count(fn, false), fn + ' succeeds').toBeGreaterThan(0);
      expect(count(fn, true), fn + ' refuses').toBeGreaterThan(0);
    }
    expect(golden.cases.some((c) => c.name === 'pay 128 distinct tiers' && !c.output.$error)).toBe(true);
    expect(golden.cases.some((c) => c.name === 'pay 129 rejects' && c.output.$error)).toBe(true);
    expect(golden.cases.some((c) => c.output && c.output.$name === 'DefifaNftTransactionRevertedError')).toBe(true);
  });

  it('unrecorded read fails the test', async () => {
    const c = golden.cases.find((x) => x.name === 'pay 1 tier');
    const [dropped] = Object.keys(c.reads).filter((key) => key.includes('|tierOf|'));
    expect(dropped).toBeTruthy();
    const reads = { ...c.reads };
    delete reads[dropped];
    await expect(actions.prepareDefifaPay(strictClient(reads, new Set()), c.input)).rejects.toThrow(/unrecorded read/);
  });

  it('reads the registry, not a pinned table, and agrees with the SDK deployments', () => {
    const chains = Object.keys(golden.deployments);
    expect(chains.length).toBe(8);
    for (const chain of chains) {
      expect(getAddress('DefifaDeployer', chain), chain).toBe(golden.deployments[chain].deployer);
      expect(getAddress('DefifaHook', chain), chain).toBe(golden.deployments[chain].implementation);
    }
    expect(Object.keys(meta.DefifaDeployer.addresses).sort()).toEqual([...chains].sort());
    expect(Object.keys(meta.DefifaHook.addresses).sort()).toEqual([...chains].sort());
  });

  it('keeps the ABI fragments the actions call', () => {
    for (const [name, fragments] of Object.entries(golden.fragments)) {
      for (const fragment of fragments) {
        const found = getABI(name, 8453).find((e) => e.type === fragment.type && e.name === fragment.name);
        expect(found, name + ' ' + fragment.name).toEqual(fragment);
      }
    }
  });

  it('keeps the SDK constants and phase rules', () => {
    expect(MAX_DEFIFA_ACTION_NFTS).toBe(golden.constants.MAX_DEFIFA_ACTION_NFTS);
    for (const row of golden.phases) {
      expect(defifaPhaseAllowsPay(row.phase ?? undefined), 'pay ' + row.phase).toBe(row.pay);
      expect(defifaPhaseAllowsCashOut(row.phase ?? undefined), 'cashOut ' + row.phase).toBe(row.cashOut);
    }
  });

  it('prices tiers like the SDK', () => {
    expect(golden.prices.length).toBeGreaterThan(50);
    for (const row of golden.prices) {
      let actual;
      try { actual = effectiveTierPrice(row.price, row.discount); } catch (error) { actual = { $error: error.message }; }
      expect(actual, `${row.price} ${String(row.discount)}`).toEqual(row.output);
    }
  });
});
