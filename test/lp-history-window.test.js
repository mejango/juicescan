import { expect, it, vi } from 'vitest';
import { toEventSelector } from 'viem';
const runtime = vi.hoisted(() => ({ getBlockNumber: vi.fn(), request: vi.fn() }));
vi.mock('../src/component-base.js', async original => {
  const { boundedLogClient } = await import('../src/rpc-logs.js');
  const client = boundedLogClient(runtime);
  return { ...await original(), createPublicClientForChain: () => client };
});
import { lpPoolPositionTokenIds } from '../src/discover.js';
it('finds a recent pool initialization within eight actual bounded requests', async () => {
  const poolId = `0x${'ab'.repeat(32)}`, pm = `0x${'12'.repeat(20)}`, posm = `0x${'34'.repeat(20)}`;
  runtime.getBlockNumber.mockResolvedValue(4000n);
  runtime.request.mockImplementation(async request => {
    const range = request.params[0], from = BigInt(range.fromBlock), to = BigInt(range.toBlock);
    if (from <= 3800n && to >= 3801n) return [
      { topics: [toEventSelector('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)'), poolId], blockNumber: '0xed8' },
      { topics: [toEventSelector('ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)'), poolId, `0x${posm.slice(2).padStart(64, '0')}`], data: `0x${'0'.repeat(192)}${42n.toString(16).padStart(64,'0')}`, blockNumber: '0xed9' },
    ];
    return [];
  });
  expect(await lpPoolPositionTokenIds(8453, pm, posm, poolId)).toEqual([42n]);
  expect(runtime.request.mock.calls.length).toBeLessThanOrEqual(8);
  expect(runtime.request.mock.calls.every(([r]) => BigInt(r.params[0].toBlock) - BigInt(r.params[0].fromBlock) < 500n)).toBe(true);
  expect(runtime.request.mock.calls.every(([r]) => r.params[0].topics[1] === poolId)).toBe(true);
});
