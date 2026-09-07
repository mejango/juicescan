import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findSavedSafeExecution, SAFE_EXECUTION_SUCCESS_TOPIC, SAFE_EXECUTION_FAILURE_TOPIC,
  safeExecRelayrTx, safeTxHashForQueuedTx } from '../src/safe.js';

const SAFE = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const TARGET = '0x3333333333333333333333333333333333333333';
const OTHER = '0x4444444444444444444444444444444444444444';
const ZERO = '0x0000000000000000000000000000000000000000';
const HASH = '0x' + 'ab'.repeat(32), BLOCK = '0x' + 'cd'.repeat(32);
let saved, tx, log, receipt, transaction, client;

function encoded(overrides = {}) {
  return safeExecRelayrTx(8453, SAFE, { ...tx, ...overrides,
    confirmations: [{ owner: OWNER, signature: '0x' + '12'.repeat(65) }] }).data;
}
function nativeRecord() {
  saved.hashOnly = true; saved.nonce = null;
  saved.tx = { to: tx.to, data: tx.data, value: tx.value, operation: 0 };
}

beforeEach(() => {
  tx = { to: TARGET, data: '0x12345678', value: '0', operation: 0, nonce: '9',
    safeTxGas: '0', baseGas: '0', gasPrice: '0', gasToken: ZERO, refundReceiver: ZERO };
  saved = { chainId: 8453, safe: SAFE, safeTxHash: safeTxHashForQueuedTx(8453, SAFE, tx),
    nonce: '9', tx: { ...tx }, fromBlock: '100' };
  log = { address: SAFE, topics: [SAFE_EXECUTION_SUCCESS_TOPIC, saved.safeTxHash], data: '0x' + '0'.repeat(64),
    transactionHash: HASH, blockHash: BLOCK, blockNumber: 200n, removed: false };
  receipt = { status: 'success', transactionHash: HASH, blockHash: BLOCK, blockNumber: 200n, logs: [log] };
  transaction = { hash: HASH, to: SAFE, from: OTHER, value: 0n, blockHash: BLOCK, blockNumber: 200n, input: encoded() };
  client = {
    getBlockNumber: vi.fn(async () => 1000n),
    getLogs: vi.fn(async ({ fromBlock, toBlock }) => fromBlock <= 200n && toBlock >= 200n ? [log] : []),
    getTransaction: vi.fn(async () => transaction), getTransactionReceipt: vi.fn(async () => receipt),
    getBlock: vi.fn(async () => ({ hash: BLOCK, number: 200n })),
  };
});

describe('canonical saved Safe execution recovery', () => {
  it.each(['indexed', 'unindexed'])('recovers the exact externally executed proposal with %s success events', async layout => {
    if (layout === 'unindexed') { log.topics = [SAFE_EXECUTION_SUCCESS_TOPIC]; log.data = saved.safeTxHash + '0'.repeat(64); }
    await expect(findSavedSafeExecution(saved, client)).resolves.toBe(receipt);
    expect(client.getLogs).toHaveBeenCalledExactlyOnceWith({ address: SAFE, event: expect.objectContaining({ name: 'ExecutionSuccess' }),
      fromBlock: 100n, toBlock: 1000n, strict: false });
    expect(client.getTransaction).toHaveBeenCalledExactlyOnceWith({ hash: HASH });
    expect(client.getBlock).toHaveBeenCalledExactlyOnceWith({ blockNumber: 200n });
  });

  it('permits an unrelated executor and incidental outer ETH while proving the same inner call', async () => {
    transaction.from = OTHER; transaction.value = 123n;
    await expect(findSavedSafeExecution(saved, client)).resolves.toBe(receipt);
  });

  it('returns null only after the complete queried interval has no matching success', async () => {
    client.getLogs.mockResolvedValue([]);
    await expect(findSavedSafeExecution(saved, client)).resolves.toBeNull();
    expect(client.getTransaction).not.toHaveBeenCalled();
  });

  it.each(['wrongSafe', 'wrongHash', 'failure', 'removed', 'refund'])('does not accept an unrelated or invalid %s event as success', async kind => {
    if (kind === 'wrongSafe') log.address = OTHER;
    if (kind === 'wrongHash') log.topics[1] = HASH;
    if (kind === 'failure') log.topics[0] = SAFE_EXECUTION_FAILURE_TOPIC;
    if (kind === 'removed') log.removed = true;
    if (kind === 'refund') log.data = '0x' + '0'.repeat(63) + '1';
    await expect(findSavedSafeExecution(saved, client)).resolves.toBeNull();
    expect(client.getTransaction).not.toHaveBeenCalled();
  });

  it.each(['to', 'data', 'value', 'operation', 'safeTxGas', 'baseGas', 'gasPrice', 'gasToken', 'refundReceiver'])('rejects a mined change to %s despite a matching reported success log', async field => {
    const change = field === 'to' || field === 'gasToken' || field === 'refundReceiver' ? OTHER
      : field === 'data' ? '0xdeadbeef' : 1;
    transaction.input = encoded({ [field]: change });
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/does not match/);
  });

  it('rejects an inconsistent persisted nonce/hash before querying the chain', async () => {
    saved.nonce = '10';
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/nonce does not match/);
    expect(client.getBlockNumber).not.toHaveBeenCalled();
    saved.tx.nonce = '10';
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/hash does not match/);
  });

  it.each(['wrongTarget', 'reverted', 'wrongReceiptHash', 'wrongBlock', 'reorg', 'missingSuccess', 'trailingData'])('does not acknowledge incomplete canonical evidence: %s', async kind => {
    if (kind === 'wrongTarget') transaction.to = OTHER;
    if (kind === 'reverted') receipt.status = 'reverted';
    if (kind === 'wrongReceiptHash') receipt.transactionHash = BLOCK;
    if (kind === 'wrongBlock') receipt.blockNumber = 201n;
    if (kind === 'reorg') client.getBlock.mockResolvedValue({ hash: HASH, number: 200n });
    if (kind === 'missingSuccess') receipt.logs = [];
    if (kind === 'trailingData') transaction.input += '00';
    await expect(findSavedSafeExecution(saved, client)).rejects.toMatchObject({ code: 'SAFE_EXECUTION_RECOVERY_PENDING' });
  });

  it.each(['getBlockNumber', 'getLogs', 'getTransaction', 'getTransactionReceipt', 'getBlock'])('keeps RPC failure in %s unresolved', async method => {
    client[method].mockRejectedValue(new Error('RPC offline'));
    await expect(findSavedSafeExecution(saved, client)).rejects.toMatchObject({ code: 'SAFE_EXECUTION_RECOVERY_PENDING' });
    if (method === 'getLogs') expect(client.getLogs).toHaveBeenCalledTimes(1);
  });

  it('adaptively splits provider range limits and finds old executions without rejecting their age', async () => {
    client.getBlockNumber.mockResolvedValue(2000000n);
    client.getLogs.mockImplementation(async ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock > 500000n) throw Object.assign(new Error('block range limit'), { code: -32005 });
      return fromBlock <= 200n && toBlock >= 200n ? [log] : [];
    });
    await expect(findSavedSafeExecution(saved, client)).resolves.toBe(receipt);
    expect(client.getLogs.mock.calls.length).toBeGreaterThan(1);
    expect(client.getLogs.mock.calls.length).toBeLessThanOrEqual(32);
  });

  it('splits an oversized result and does not silently truncate matching logs', async () => {
    client.getLogs.mockImplementation(async ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock > 500n) return Array.from({ length: 513 }, () => ({ ...log, topics: [SAFE_EXECUTION_SUCCESS_TOPIC, HASH] }));
      return fromBlock <= 200n && toBlock >= 200n ? [log] : [];
    });
    await expect(findSavedSafeExecution(saved, client)).resolves.toBe(receipt);
    expect(client.getLogs).toHaveBeenCalledTimes(2);
  });

  it('fails closed once a complete scan would exceed its bounded request budget', async () => {
    client.getBlockNumber.mockResolvedValue(1000000n);
    client.getLogs.mockImplementation(async ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock > 1n) throw Object.assign(new Error('block range limit'), { code: -32005 });
      return [];
    });
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/bounded/);
    expect(client.getLogs).toHaveBeenCalledTimes(32);
  });

  it('rejects contradictory transaction candidates and logs outside the saved interval', async () => {
    client.getLogs.mockResolvedValue([log, { ...log, transactionHash: BLOCK }]);
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/conflicting transactions/);
    client.getLogs.mockResolvedValue([{ ...log, blockNumber: 99n }]);
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/outside/);
  });

  it('does not scan without the persisted proposal floor or known hash', async () => {
    delete saved.fromBlock;
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/proposal block/);
    saved.fromBlock = '100'; delete saved.safeTxHash;
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/exact identity/);
    expect(client.getLogs).not.toHaveBeenCalled();
  });
});

describe('native Safe App hash-only recovery', () => {
  it('proves the exact SDK-returned hash and inner call without inventing its nonce', async () => {
    nativeRecord();
    await expect(findSavedSafeExecution(saved, client)).resolves.toBe(receipt);
  });

  it.each([{ to: OTHER }, { data: '0xdeadbeef' }, { value: 1 }, { operation: 1 }])('rejects changed native execution inner fields %o', async change => {
    nativeRecord(); transaction.input = encoded(change);
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/does not match/);
  });

  it('compares any saved envelope fields while allowing omitted SDK envelope data', async () => {
    nativeRecord(); transaction.input = encoded({ safeTxGas: 1000 });
    await expect(findSavedSafeExecution(saved, client)).resolves.toBe(receipt);
    saved.tx.safeTxGas = '0';
    await expect(findSavedSafeExecution(saved, client)).rejects.toThrow(/saved safeTxGas/);
  });
});
