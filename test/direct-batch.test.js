import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDirectBatch, hasDirectBatch } from '../src/direct-batch.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const CALLS = [84532, 11155420].map(cid => ({ cid, to: '0x2222222222222222222222222222222222222222', data: '0x12345678' }));
const receipt = hash => ({ status: 'success', transactionHash: hash });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('sequential direct transaction recovery', () => {
  it('resumes the exact submitted hash and skips confirmed legs after the later wallet step rejects', async () => {
    const options = { account: ACCOUNT, scope: 'direct-partial', verifySubmitted: vi.fn(async (_call, hash) => receipt(hash)),
      execute: vi.fn(async (_call, index, submitted) => {
        if (index === 1) throw new Error('Wallet rejected');
        submitted('0xfirst'); return receipt('0xfirst');
      }) };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Wallet rejected');
    options.execute = vi.fn(async (_call, index, submitted) => { submitted('0xsecond'); return receipt('0xsecond'); });
    await expect(runDirectBatch(CALLS, options)).resolves.toEqual([receipt('0xfirst'), receipt('0xsecond')]);
    expect(options.verifySubmitted).toHaveBeenCalledWith(CALLS[0], '0xfirst');
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(options.execute.mock.calls[0][1]).toBe(1);
  });

  it('retains unknown submitted transactions in memory when storage is denied and blocks changed inputs', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Denied'); });
    const options = { account: ACCOUNT, scope: 'direct-storage-denied', verifySubmitted: vi.fn(async () => { throw new Error('Still pending'); }),
      execute: vi.fn(async (_call, _index, submitted) => { submitted('0xunknown'); throw new Error('Receipt unavailable'); }) };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Receipt unavailable');
    expect(hasDirectBatch(options.scope, ACCOUNT)).toBe(true);
    options.execute.mockClear();
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Still pending');
    expect(options.execute).not.toHaveBeenCalled();
    await expect(runDirectBatch([{ ...CALLS[0], data: '0x87654321' }, CALLS[1]], options)).rejects.toThrow(/original inputs/);
    expect(options.execute).not.toHaveBeenCalled();
  });

  it('retains earlier legs when an exact saved transaction is proven reverted', async () => {
    const options = { account: ACCOUNT, scope: 'direct-reverted', verifySubmitted: vi.fn(async (_call, hash) => hash === '0xreverted' ? { status: 'reverted' } : receipt(hash)),
      execute: vi.fn(async (_call, index, submitted) => { submitted(index ? '0xreverted' : '0xconfirmed'); if (index) throw new Error('Receipt unavailable'); return receipt('0xconfirmed'); }) };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Receipt unavailable');
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow(/reverted/);
    options.execute = vi.fn(async (_call, index, submitted) => { submitted('0xretry'); return receipt('0xretry'); });
    await expect(runDirectBatch(CALLS, options)).resolves.toEqual([receipt('0xconfirmed'), receipt('0xretry')]);
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(options.execute.mock.calls[0][1]).toBe(1);
  });
});

describe('direct transport recovery routing', () => {
  it('detects account-scoped journals independently of changed call data', async () => {
    const scope = 'routing-existing-direct';
    const options = { account: ACCOUNT, scope, execute: async (_call, _index, submitted) => { submitted('0xpending'); throw new Error('Pending'); } };
    expect(hasDirectBatch(scope, ACCOUNT)).toBe(false);
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Pending');
    expect(hasDirectBatch(scope, ACCOUNT, [{ ...CALLS[0], data: '0xabcd' }])).toBe(true);
    expect(hasDirectBatch(scope, '0x3333333333333333333333333333333333333333')).toBe(false);
  });

  it('finds legacy identity-keyed journals with chainId or cid descriptors', async () => {
    const options = { account: ACCOUNT, execute: async (_call, _index, submitted) => { submitted('0xpending'); throw new Error('Pending'); } };
    await expect(runDirectBatch(CALLS, options)).rejects.toThrow('Pending');
    expect(hasDirectBatch(null, ACCOUNT, CALLS.map(({ cid, ...call }) => ({ ...call, chainId: cid })))).toBe(true);
  });

  it.each(['null', 'false', '0', '', '{broken'])('retains malformed journal %j and prevents wallet execution', async raw => {
    const scope = 'malformed-direct'; localStorage.setItem(`jb-direct-batch-v1:${ACCOUNT}:${scope}`, raw);
    const execute = vi.fn(); expect(hasDirectBatch(scope, ACCOUNT)).toBe(true);
    await expect(runDirectBatch(CALLS, { scope, account: ACCOUNT, execute })).rejects.toThrow(/cannot be read/);
    expect(execute).not.toHaveBeenCalled(); expect(localStorage.getItem(`jb-direct-batch-v1:${ACCOUNT}:${scope}`)).toBe(raw);
  });

  it('cannot turn an unreadable journal into a new Relayr or direct request', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Read denied'); });
    const execute = vi.fn(); expect(hasDirectBatch('unreadable-direct', ACCOUNT)).toBe(true);
    await expect(runDirectBatch(CALLS, { scope: 'unreadable-direct', account: ACCOUNT, execute })).rejects.toThrow(/Enable browser storage/);
    expect(execute).not.toHaveBeenCalled();
  });
});


it('retains all verified hashes when its parent completion checkpoint fails', async () => {
  const options = { account: ACCOUNT, scope: 'parent-checkpoint-failed', verifySubmitted: vi.fn(async (_call, hash) => receipt(hash)),
    execute: vi.fn(async (_call, index, submitted) => { const hash = '0xconfirmed' + index; submitted(hash); return receipt(hash); }),
    onComplete: vi.fn(async () => { throw new Error('checkpoint storage unavailable'); }) };
  await expect(runDirectBatch(CALLS, options)).rejects.toThrow('checkpoint storage unavailable');
  options.execute.mockClear(); options.onComplete.mockResolvedValue();
  await expect(runDirectBatch(CALLS, options)).resolves.toHaveLength(2);
  expect(options.execute).not.toHaveBeenCalled(); expect(options.verifySubmitted).toHaveBeenCalledTimes(2);
});
