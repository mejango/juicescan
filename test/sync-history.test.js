import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ getBlockNumber: vi.fn(), getLogs: vi.fn() }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), createPublicClientForChain: () => runtime }));
import { readLatestSyncSent } from '../src/discover.js';
beforeEach(() => { runtime.getLogs.mockReset(); runtime.getBlockNumber.mockReset(); localStorage.clear(); });
it('reads <=500 blocks at a time and stops on the latest matching sync window', async () => {
  runtime.getBlockNumber.mockResolvedValue(200000n);runtime.getLogs.mockResolvedValueOnce([]).mockResolvedValueOnce([{ args: { sourceTimestamp: 123n << 128n } }]);
  expect(await readLatestSyncSent(8453, '0xsucker')).toBe(123);
  expect(runtime.getLogs.mock.calls.map(([p]) => [p.fromBlock, p.toBlock])).toEqual([[199501n,200000n],[199001n,199500n]]);
});
it('covers the complete prior observation span without concurrent outer batches', async () => {
  runtime.getBlockNumber.mockResolvedValue(200000n);runtime.getLogs.mockResolvedValue([]);
  expect(await readLatestSyncSent(8453, '0xsucker')).toBe(0);
  expect(runtime.getLogs).toHaveBeenCalledTimes(360);
  expect(runtime.getLogs.mock.calls.at(-1)[0].fromBlock).toBe(20001n);
});
it('keeps unavailable history distinct from no sync', async () => {
  runtime.getBlockNumber.mockResolvedValue(200000n);runtime.getLogs.mockRejectedValue(new Error('RPC unavailable'));
  await expect(readLatestSyncSent(8453, '0xsucker')).rejects.toThrow('RPC unavailable');
  expect(runtime.getLogs).toHaveBeenCalledTimes(1);
});
