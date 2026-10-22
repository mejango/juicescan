// The lean NFT inventory and Defifa holdings reads must answer, and read, exactly as nana-sdk-core 3.4.1 did, case for case.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, encodeErrorResult, keccak256, toHex } from 'viem';
import { getAddress } from '../src/abi-registry.js';
import { getDefifaHoldings, getProjectNftInventory, scanDefifaHoldings } from '../src/nft-inventory-read.js';

const revive = (_, v) => (v && typeof v === 'object' && '$bigint' in v ? BigInt(v.$bigint) : v);
const golden = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-3.4.1/nft-inventory.json'), 'utf8'), revive);

const ser = (value) => JSON.stringify(value, (_, x) => (typeof x === 'bigint' ? { $bigint: x.toString() } : x));
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
// The ABI fragment a read passes is part of its identity: a wrong or empty ABI must miss.
function abiKey(p) {
  const fragment = Array.isArray(p.abi) ? p.abi.find((e) => e.type === 'function' && e.name === p.functionName) : undefined;
  return fragment ? keccak256(toHex(canon(fragment))).slice(0, 18) : 'no-abi';
}
function keyOf(method, p) {
  switch (method) {
    case 'read': return `read|${p.address.toLowerCase()}|${p.functionName}|${abiKey(p)}|${ser(p.args ?? [])}|${p.blockNumber}`;
    case 'code': return `code|${p.address.toLowerCase()}|${p.blockNumber}`;
    default: return `${method}|${ser(p ?? null)}`;
  }
}

// The typed failures the capture recorded, rebuilt in the same shapes viem raises.
const nonexistentAbi = [{ name: 'ERC721NonexistentToken', type: 'error', inputs: [{ type: 'uint256', name: 'tokenId' }] }];
function makeError(kind, message) {
  switch (kind) {
    case 'nonexistent': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: nonexistentAbi, functionName: 'ownerOf', data: encodeErrorResult({ abi: nonexistentAbi, errorName: 'ERC721NonexistentToken', args: [1n] }) }) });
    case 'revert': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: [], functionName: 'f', data: '0x' }) });
    case 'zerodata': return new BaseError(message, { cause: new ContractFunctionZeroDataError({ functionName: 'STORE' }) });
    case 'transport': return new BaseError(message);
    default: return new Error(message);
  }
}
const outcome = (error) => ({ $error: error.message.replace(/\n\nVersion:[^]*$/, ''), $name: error.name });

// Serves only what the fixture recorded and fails on any other read; `calls` keeps every request in order.
function strictClient(reads, calls) {
  const get = async (method, p) => {
    const key = keyOf(method, p);
    calls.push(key);
    if (!(key in reads)) throw new Error('unrecorded read: ' + key);
    const value = reads[key];
    if (value && typeof value === 'object' && '$throw' in value) throw makeError(value.$kind, value.$throw);
    return value;
  };
  return { getChainId: () => get('chainId'), getBlockNumber: () => get('blockNumber'), getBytecode: (p) => get('code', p), readContract: (p) => get('read', p) };
}

const actions = {
  getProjectNftInventory: (client, input) => getProjectNftInventory(client, input),
  getDefifaHoldings: (client, input) => getDefifaHoldings(client, input),
  scanDefifaHoldings: (client, input) => scanDefifaHoldings(client, input),
};

async function run(c) {
  const calls = [];
  let actual;
  try { actual = JSON.parse(ser(await actions[c.fn](strictClient(c.reads, calls), c.input)), revive); } catch (error) { actual = outcome(error); }
  return { actual, calls };
}
const byName = (name) => golden.cases.find((c) => c.name === name);

describe('inventory matches SDK 3.4.1 golden vectors', () => {
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

  it('covers every shape, its refusals and its failures', () => {
    const count = (predicate) => golden.cases.filter(predicate).length;
    for (const fn of Object.keys(actions)) {
      expect(count((c) => c.fn === fn && !c.output?.$error), fn + ' succeeds').toBeGreaterThan(0);
      expect(count((c) => c.fn === fn && c.output?.$error), fn + ' refuses').toBeGreaterThan(0);
    }
    expect(count((c) => c.output?.protocol === 'jb721')).toBeGreaterThan(8);
    expect(count((c) => c.output?.protocol === 'defifa')).toBeGreaterThan(8);
    expect(count((c) => c.output?.protocol === 'jb721' && c.output.tiers.length === 0)).toBeGreaterThan(0);
    expect(count((c) => c.output === null)).toBeGreaterThan(2);
    expect(count((c) => c.name === 'generic custom hook, tierLimit 1 pages to the next tier' && c.output?.nextStartingId !== null)).toBe(1);
    expect(count((c) => c.name === 'generic page 2 at the first block' && c.input.blockNumber === 900n)).toBe(1);
    const kinds = new Set(golden.cases.flatMap((c) => Object.values(c.reads).filter((v) => v && v.$throw).map((v) => v.$kind)));
    expect([...kinds].sort()).toEqual(['nonexistent', 'plain', 'revert', 'transport', 'zerodata']);
  });

  it('fails closed: a failed read is never an empty shop or a zero holding', async () => {
    for (const name of ['a custom hook whose STORE fails in transport throws', 'a custom hook whose STORE fails plainly throws', 'METADATA_ID_TARGET transport failure throws', 'pricing context failure throws', 'tiersOf failure throws', 'defifa tiersOf failure throws', 'revnet store failure throws', 'holdings owner read failure throws', 'holdings owner revert that is not nonexistence throws', 'holdings owner plain failure throws', 'scan unexpected failure throws']) {
      const c = byName(name);
      expect(c.output.$error, name).toBeTruthy();
      const { actual } = await run(c);
      expect(actual.$error, name).toBe(c.output.$error);
    }
    // Only a proven revert or empty return on a custom hook means "no shop".
    expect(byName('a custom hook that reverts STORE is no shop').output).toBeNull();
    expect(byName('a custom hook with empty STORE is no shop').output).toBeNull();
  });

  it('unrecorded read fails the test', async () => {
    const c = byName('defifa game, tierLimit 1');
    const [dropped] = Object.keys(c.reads).filter((key) => key.includes('|currentGamePhaseOf|'));
    expect(dropped).toBeTruthy();
    const reads = { ...c.reads };
    delete reads[dropped];
    await expect(actions.getProjectNftInventory(strictClient(reads, []), c.input)).rejects.toThrow(/unrecorded read/);
  });

  it('reads afresh on every call, never from a cached answer', async () => {
    const c = byName('defifa game, tierLimit 1');
    const reads = { ...c.reads };
    const client = strictClient(reads, []);
    const first = await actions.getProjectNftInventory(client, c.input);
    const phaseKey = Object.keys(reads).find((k) => k.includes('|currentGamePhaseOf|'));
    reads[phaseKey] = 3;
    const second = await actions.getProjectNftInventory(client, c.input);
    expect(first.phase).not.toBe(second.phase);
    expect(second.phase).toBe(3);
  });

  it('snapshots every read at one block, the first one, across pages', async () => {
    const c = byName('generic custom hook, default limit');
    const blocks = new Set(Object.keys(c.reads).filter((k) => k.startsWith('read|')).map((k) => k.split('|').pop()));
    expect([...blocks]).toEqual(['1000']);
    const page = byName('generic page 2 at the first block');
    expect(new Set(Object.keys(page.reads).filter((k) => k.startsWith('read|')).map((k) => k.split('|').pop()))).toEqual(new Set(['900']));
  });

  it('reads the deployment addresses from the registry for the chain', () => {
    for (const chain of ['8453', '1', '84532']) {
      expect(getAddress('DefifaDeployer', chain)).toBeTruthy();
      expect(getAddress('DefifaHook', chain)).toBeTruthy();
    }
    expect(getAddress('DefifaDeployer', '137')).toBeNull();
  });

  it('bounds holdings tier pages at 4096 tiers', async () => {
    const c = byName('holdings of a holder');
    const { chainId, projectId, account } = c.input;
    const hook = Object.keys(c.reads).find((k) => k.includes('|balanceOf|')).split('|')[1];
    const identity = Object.fromEntries(Object.entries(c.reads).filter(([k]) => !k.includes('"129"') && !k.includes(hook + '|ownerOf|') && !k.includes('|balanceOf|')));
    const tier = (id) => ({ id, price: 1n, discountPercent: 0, remainingSupply: 1, initialSupply: 1, category: 0, votingUnits: 0n, reserveFrequency: 0, encodedIpfsUri: '0x11' });
    const store = Object.keys(c.reads).find((k) => k.includes('|tiersOf|')).split('|')[1];
    const run4096 = async (total) => {
      const client = strictClient(identity, []);
      const base = client.readContract;
      let pages = 0;
      client.readContract = async (p) => {
        if (p.functionName === 'balanceOf') return 0n;
        if (p.address.toLowerCase() === store && p.functionName === 'tiersOf') {
          const start = Number(p.args[3]);
          pages += 1;
          if (p.args[4] !== 129n) return base(p);
          const out = [];
          for (let id = Math.max(start, 1); id <= total && out.length < 129; id++) out.push(tier(id));
          return out;
        }
        return base(p);
      };
      const result = await getDefifaHoldings(client, { chainId, projectId, account, limit: 1 }).then((r) => r, (e) => e);
      return { result, pages };
    };
    expect(hook).toBeTruthy();
    const ok = await run4096(4096);
    expect(ok.result.message).toBeUndefined();
    expect(ok.result.hook).toBe(hook);
    expect(ok.result.tokens).toEqual([]);
    expect(ok.pages).toBeGreaterThan(30);
    const over = await run4096(4097);
    expect(over.result.message).toMatch(/exceeded 4096 tiers/);
  });
});
