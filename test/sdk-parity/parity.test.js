// SDK-parity canary. Juicescan owns lean copies of nana-sdk-core logic, frozen at 3.4.1 by test/fixtures/sdk-3.4.1.
// This replays every fixture through the installed SDK. A failure means the SDK moved: a human decides whether
// juicescan follows. It runs weekly from .github/workflows/sdk-parity.yml with SDK_PARITY=1, never in the default run.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, encodeErrorResult, erc721Abi, keccak256, toHex } from 'viem';
import * as sdk from '@bananapus/nana-sdk-core';
import * as v6 from '@bananapus/nana-sdk-core/v6';
import { describeJBHookMetadata } from '@bananapus/nana-sdk-core/review/decode';

const load = (name, reviver) => JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/sdk-3.4.1', name), 'utf8'), reviver);
const bigints = (k, v) => {
  if (v && typeof v === 'object' && '$bigint' in v) return BigInt(v.$bigint);
  if (k === 'abi' && v === '$abi:erc721') return erc721Abi;
  if (k === 'abi' && v === '$abi:terminal') return sdk.jbMultiTerminalAbi;
  return v;
};

const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const ser = (value) => JSON.stringify(value, function (k, x) {
  if (typeof x === 'bigint') return { $bigint: x.toString() };
  if (k === 'abi' && Array.isArray(x) && typeof this.functionName === 'string') return x === erc721Abi ? '$abi:erc721' : { $fragment: x.find((e) => e.type === 'function' && e.name === this.functionName) };
  return x;
});
const fragmentKey = (abi, name) => {
  const fragment = Array.isArray(abi) ? abi.find((e) => e.type === 'function' && e.name === name) : undefined;
  return fragment ? keccak256(toHex(canon(fragment))).slice(0, 18) : 'no-abi';
};
function keyOf(method, p) {
  switch (method) {
    case 'read': return `read|${p.address.toLowerCase()}|${p.functionName}|${fragmentKey(p.abi, p.functionName)}|${ser(p.args ?? [])}|${p.blockNumber}`;
    case 'sim': return `sim|${p.address.toLowerCase()}|${p.functionName}|${fragmentKey(p.abi, p.functionName)}|${ser(p.args ?? [])}|${p.account.toLowerCase()}|${p.blockNumber}|${p.value ?? 0n}`;
    case 'code': return `code|${p.address.toLowerCase()}|${p.blockNumber}`;
    case 'call': return `call|${p.to.toLowerCase()}|${p.data}`;
    default: return `${method}|${ser(p ?? null)}`;
  }
}
const nonexistentAbi = [{ name: 'ERC721NonexistentToken', type: 'error', inputs: [{ type: 'uint256', name: 'tokenId' }] }];
function makeError(kind, message, readAbi) {
  switch (kind) {
    case 'nonexistent': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: readAbi, functionName: 'ownerOf', data: encodeErrorResult({ abi: nonexistentAbi, errorName: 'ERC721NonexistentToken', args: [1n] }) }) });
    case 'revert': return new BaseError(message, { cause: new ContractFunctionRevertedError({ abi: [], functionName: 'f', data: '0x' }) });
    case 'zerodata': return new BaseError(message, { cause: new ContractFunctionZeroDataError({ functionName: 'STORE' }) });
    case 'transport': return new BaseError(message);
    default: return new Error(message);
  }
}
const outcome = (error) => ({ $error: error.message.replace(/\n\nVersion:[^]*$/, ''), $name: error.name, ...(error.hash ? { hash: error.hash, chainId: error.chainId } : {}) });

// Serves only what the fixture recorded and fails on any other read; `calls` keeps every request in order.
function strictClient(reads, calls) {
  const get = async (method, p) => {
    const key = keyOf(method, p);
    calls.push(key);
    if (!(key in reads)) throw new Error('unrecorded ' + method + ': ' + key);
    const value = reads[key];
    if (value && typeof value === 'object' && '$throw' in value) throw makeError(value.$kind, value.$throw, p.abi);
    return value;
  };
  return {
    getChainId: () => get('chainId'), getBlockNumber: () => get('blockNumber'), getBytecode: (p) => get('code', p),
    readContract: (p) => get('read', p), simulateContract: (p) => get('sim', p), call: (p) => get('call', p),
    getTransaction: (p) => get('tx', p), getTransactionReceipt: (p) => get('receipt', p), getBlock: (p) => get('block', p),
  };
}

// scanDefifaHoldings is internal to the SDK, so its cases have nothing to replay.
const clientActions = {
  prepareUserPay: (client, input) => v6.prepareUserPay(client, input),
  resolvePaymentTerminal: (client, input) => v6.resolvePaymentTerminal(client, input),
  buildUserPayMetadata: (_, input) => v6.buildUserPayMetadata(input),
  build721PayMetadata: (_, input) => v6.build721PayMetadata(input),
  buildBuybackPayMetadata: (_, input) => v6.buildBuybackPayMetadata(input),
  buildPayTx: (_, input) => { const tx = v6.buildPayTx(input); return { ...tx, abi: fragmentKey(tx.abi, 'pay') }; },
  slippageFloor: (_, input) => v6.slippageFloor(input.quoted, input.slippageBps),
  getProjectNftInventory: (client, input) => v6.getProjectNftInventory(client, input),
  getDefifaHoldings: (client, input) => v6.getDefifaHoldings(client, input),
  prepareDefifaPay: (client, input) => v6.prepareDefifaPay(client, input),
  prepareDefifaCashOut: (client, input) => v6.prepareDefifaCashOut(client, input),
  prepareDefifaTransfer: (client, input) => v6.prepareDefifaTransfer(client, input),
  restoreDefifaNftReceiptContext: (client, input) => v6.restoreDefifaNftReceiptContext(client, input),
  verifyDefifaNftTransaction: async (client, input) => { await v6.verifyDefifaNftTransaction(client, input.context, input.receipt); return null; },
  verifyDefifaNftReceipt: async (_, input) => { v6.verifyDefifaNftReceipt(input.context, input.receipt); return null; },
};

async function replay(c) {
  const calls = [];
  let actual;
  try { actual = JSON.parse(ser(await clientActions[c.fn](strictClient(c.reads ?? {}, calls), c.input)), bigints); } catch (error) { actual = outcome(error); }
  return { actual, calls };
}

// A case with sdkOutput is a recorded, intentional divergence: the SDK answered sdkOutput at 3.4.1, juicescan answers
// output, and the SDK matches either until it ships the same fix.
async function replayAll(golden, label) {
  const request = vi.fn();
  window.ethereum = { request };
  globalThis.ethereum = window.ethereum;
  const skipped = new Set();
  let replayed = 0;
  let divergent = 0;
  for (const c of golden.cases) {
    if (!clientActions[c.fn]) { skipped.add(c.fn); continue; }
    const { actual, calls } = await replay(c);
    replayed += 1;
    if (c.sdkOutput) {
      divergent += 1;
      expect([c.sdkOutput, c.output], c.name).toContainEqual(actual);
    } else {
      expect(actual, c.name).toEqual(c.output);
    }
    const keys = Object.keys(c.reads ?? {});
    expect(calls.map((key) => keys.indexOf(key)), c.name + ' reads, in order, once each as recorded').toEqual(c.trace ?? []);
  }
  expect(request).not.toHaveBeenCalled();
  delete window.ethereum;
  delete globalThis.ethereum;
  expect([...skipped].every((fn) => fn === 'scanDefifaHoldings'), label + ' skipped only the internal scan').toBe(true);
  expect(replayed, label + ' replayed').toBeGreaterThan(100);
  return divergent;
}

describe('installed SDK matches the 3.4.1 golden vectors', () => {
  it('pay preparation, apart from the recorded swap-quote divergence', async () => {
    const golden = load('pay-prepare.json', bigints);
    expect(await replayAll(golden, 'pay-prepare')).toBe(20);
  });

  it('NFT inventory and Defifa holdings reads', async () => {
    expect(await replayAll(load('nft-inventory.json', bigints), 'nft-inventory')).toBe(0);
  });

  it('Defifa actions, constants, phases and tier prices', async () => {
    const golden = load('defifa.json', bigints);
    expect(await replayAll(golden, 'defifa')).toBe(0);
    expect(v6.MAX_DEFIFA_ACTION_NFTS).toBe(golden.constants.MAX_DEFIFA_ACTION_NFTS);
    for (const row of golden.phases) {
      expect(v6.defifaPhaseAllowsPay(row.phase ?? undefined), 'pay ' + row.phase).toBe(row.pay);
      expect(v6.defifaPhaseAllowsCashOut(row.phase ?? undefined), 'cashOut ' + row.phase).toBe(row.cashOut);
    }
    for (const row of golden.prices) {
      let actual;
      try { actual = v6.effectiveTierPrice(row.price, row.discount); } catch (error) { actual = { $error: error.message }; }
      expect(actual, `${row.price} ${String(row.discount)}`).toEqual(row.output);
    }
  });

  it('hook metadata', () => {
    const golden = load('hook-metadata.json');
    const local = {
      hookMetadataId: ({ target, purpose }) => sdk.hookMetadataId(target, purpose),
      createHookMetadata: ({ ids, metadatas }) => sdk.createHookMetadata(ids, metadatas),
      describeJBHookMetadata: ({ context, value }) => describeJBHookMetadata(context, value),
    };
    for (const c of golden.cases) {
      let actual;
      try { actual = local[c.fn](c.input); } catch (e) { actual = { $error: e.message }; }
      expect(actual, c.name).toEqual(c.output);
    }
  });

  it('pay failure decoding and the slippage constants', () => {
    const golden = load('pay-failure.json', bigints);
    for (const c of golden.cases) {
      const actual = c.fn === 'decodePayFailure'
        ? v6.decodePayFailure(c.undefinedInput ? undefined : c.input)
        : v6.payRetrySlippageBps(c.input.failure, c.input.currentBps);
      expect(actual, c.name).toEqual(c.output);
    }
    expect(v6.PAY_MAX_SLIPPAGE_BPS).toBe(golden.constants.PAY_MAX_SLIPPAGE_BPS);
    expect(v6.PAY_DEFAULT_SLIPPAGE_BPS).toBe(golden.constants.PAY_DEFAULT_SLIPPAGE_BPS);
  });
});
