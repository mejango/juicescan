// The lean Defifa actions must answer, and read, exactly as nana-sdk-core 3.4.1 did, case for case.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { erc721Abi, keccak256, toHex } from 'viem';
import { getABI, getAddress, meta } from '../src/abi-registry.js';

const registry = vi.hoisted(() => ({ addresses: {}, abis: {} }));
vi.mock('../src/abi-registry.js', async (original) => {
  const real = await original();
  return { ...real, getAddress: (name, chain) => registry.addresses[name] ?? real.getAddress(name, chain), getABI: (name, chain) => registry.abis[name] ?? real.getABI(name, chain) };
});
afterEach(() => { registry.addresses = {}; registry.abis = {}; });
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
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
// The ABI fragment a read or simulation passes is part of its identity: a wrong or empty ABI must miss.
function abiKey(p) {
  const fragment = Array.isArray(p.abi) ? p.abi.find((e) => e.type === 'function' && e.name === p.functionName) : undefined;
  return fragment ? keccak256(toHex(canon(fragment))).slice(0, 18) : 'no-abi';
}

function keyOf(method, p) {
  const args = (x) => ser(x ?? []);
  switch (method) {
    case 'read': return `read|${p.address.toLowerCase()}|${p.functionName}|${abiKey(p)}|${args(p.args)}|${p.blockNumber}`;
    case 'sim': return `sim|${p.address.toLowerCase()}|${p.functionName}|${abiKey(p)}|${args(p.args)}|${p.account.toLowerCase()}|${p.blockNumber}|${p.value ?? 0n}`;
    case 'code': return `code|${p.address.toLowerCase()}|${p.blockNumber}`;
    default: return `${method}|${ser(p ?? null)}`;
  }
}

// Serves only what the fixture recorded and fails on any other read; `calls` keeps every request in order.
function strictClient(reads, calls) {
  const get = async (method, p) => {
    const key = keyOf(method, p);
    calls.push(key);
    if (!(key in reads)) throw new Error('unrecorded read: ' + key);
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
  const calls = [];
  let actual;
  try { actual = JSON.parse(ser(await actions[c.fn](strictClient(reads, calls), c.input)), revive); }
  catch (error) {
    actual = { $error: error.message, $name: error.name, ...(error.hash ? { hash: error.hash, chainId: error.chainId } : {}) };
    if (error.name === 'DefifaNftTransactionRevertedError') expect(error).toBeInstanceOf(DefifaNftTransactionRevertedError);
  }
  return { actual, calls };
}

describe('defifa matches SDK 3.4.1 golden vectors', () => {
  it('replays every recorded scenario with identical results and identical reads, and never touches a wallet', async () => {
    const request = vi.fn();
    window.ethereum = { request };
    globalThis.ethereum = window.ethereum;
    expect(golden.sdkVersion).toBe('3.4.1');
    expect(golden.cases.length).toBeGreaterThan(140);
    for (const c of golden.cases) {
      const reads = c.reads ?? {};
      const { actual, calls } = await run(c, reads);
      expect(actual, c.name).toEqual(c.output);
      const keys = Object.keys(reads);
      expect(calls.map((key) => keys.indexOf(key)), c.name + ' reads, in order, once each as recorded').toEqual(c.trace ?? []);
    }
    expect(request).not.toHaveBeenCalled();
    delete window.ethereum;
    delete globalThis.ethereum;
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
    await expect(actions.prepareDefifaPay(strictClient(reads, []), c.input)).rejects.toThrow(/unrecorded read/);
  });

  it('prepares afresh on every call, never from a cached answer', async () => {
    const c = golden.cases.find((x) => x.name === 'pay for another beneficiary with prior delegates equal');
    const reads = { ...c.reads };
    const client = strictClient(reads, []);
    const first = await actions.prepareDefifaPay(client, c.input);
    const delegateKey = Object.keys(reads).find((k) => k.includes('|getTierDelegateOf|'));
    const next = '0x9999999999999999999999999999999999999999';
    reads[delegateKey] = next;
    const second = await actions.prepareDefifaPay(client, c.input);
    expect(second.effectiveDelegates.map((d) => d.delegate)).toContain(next);
    expect(second.effectiveAttestationDelegate).not.toBe(first.effectiveAttestationDelegate);
    for (const key of Object.keys(reads).filter((k) => k.includes('|tierOf|'))) reads[key] = { ...reads[key], price: reads[key].price + 1n };
    const third = await actions.prepareDefifaPay(client, c.input);
    expect(third.amount).toBeGreaterThan(second.amount);
    expect(third.transaction.args[2]).toBe(third.amount);
    expect(third.transaction.value).toBe(third.amount);
    expect(third.transaction.args[2]).not.toBe(first.transaction.args[2]);
  });

  it('snapshots the caller arguments before its first await', async () => {
    for (const [name, fn] of [['pay 1 tier with memo and zero delegate', 'prepareDefifaPay'], ['cash out three NFTs in the mint phase', 'prepareDefifaCashOut']]) {
      const c = golden.cases.find((x) => x.name === name);
      const input = { ...c.input, ...(c.input.tierIdsToMint ? { tierIdsToMint: [...c.input.tierIdsToMint] } : { tokenIds: [...c.input.tokenIds] }) };
      const client = strictClient(c.reads, []);
      const read = client.readContract;
      client.readContract = (p) => { input.memo = 'tampered'; input.beneficiary = '0x4444444444444444444444444444444444444444'; (input.tierIdsToMint ?? input.tokenIds).push(999n); return read(p); };
      const result = JSON.parse(ser(await actions[fn](client, input)), revive);
      expect(result, name).toEqual(c.output);
    }
  });

  it('never turns an uncertain proof into a proven failure', async () => {
    const c = golden.cases.find((x) => x.name === 'verify direct pay success');
    const wallet = Object.assign(new Error('User rejected the request.'), { code: 4001 });
    const unavailable = Object.assign(new Error('node is syncing'), { cause: new Error('timeout') });
    for (const [label, method, error] of [['wallet code', 'getTransaction', wallet], ['transaction read', 'getTransactionReceipt', unavailable], ['block read', 'getBlock', unavailable]]) {
      const client = strictClient(c.reads, []);
      client[method] = async () => { throw error; };
      let thrown;
      try { await verifyDefifaNftTransaction(client, c.input.context, c.input.receipt); } catch (e) { thrown = e; }
      expect(thrown, label).toBeTruthy();
      expect(thrown, label).not.toBeInstanceOf(DefifaNftTransactionRevertedError);
    }
  });

  it('takes the Defifa addresses and the ABIs from the registry', async () => {
    const receipt = golden.cases.find((x) => x.name === 'pay receipt proves one mint');
    expect(receipt.output).toBeNull();
    registry.addresses = { DefifaHook: '0x1234567890123456789012345678901234567890' };
    expect(() => verifyDefifaNftReceipt(receipt.input.context, receipt.input.receipt)).toThrow(/pinned chain implementation/);
    registry.addresses = {};
    for (const [name, fn] of [['pay 1 tier', 'prepareDefifaPay'], ['cash out three NFTs in the mint phase', 'prepareDefifaCashOut']]) {
      const c = golden.cases.find((x) => x.name === name);
      registry.abis = { JBMultiTerminal: [], JB721TiersHookStore: [], JBDirectory: [] };
      await expect(actions[fn](strictClient(c.reads, []), c.input), name).rejects.toThrow(/unrecorded read/);
      registry.abis = {};
    }
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
