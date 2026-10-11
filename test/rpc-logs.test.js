import { expect, it, vi } from 'vitest';
import { boundedLogClient } from '../src/rpc-logs.js';

it('keeps exact filters, coverage and ordering in 500-block windows', async () => {
  const getLogs = vi.fn(async p => [p.fromBlock]);
  const client = boundedLogClient({ getLogs });
  const args = { address: '0x123', event: { name: 'Transfer' }, args: { token: '0x456' }, fromBlock: 12n, toBlock: 1012n };
  expect(await client.getLogs(args)).toEqual([12n, 512n, 1012n]);
  expect(getLogs.mock.calls.map(([p]) => [p.fromBlock, p.toBlock])).toEqual([[12n, 511n], [512n, 1011n], [1012n, 1012n]]);
  for (const [p] of getLogs.mock.calls) expect(p).toMatchObject({ address: args.address, event: args.event, args: args.args });
});
it('bounds raw topic-filtered LP queries including a custom archive provider', async () => {
  const request = vi.fn(async p => [p.params[0].fromBlock]);
  const client = boundedLogClient({ request });
  const topics = [['0xaaa', '0xbbb'], '0xpool'];
  const query = { method: 'eth_getLogs', params: [{ address: '0xmanager', topics, fromBlock: '0x0', toBlock: '0x3e8' }] };
  expect(await client.request(query)).toEqual(['0x0', '0x1f4', '0x3e8']);
  expect(request.mock.calls.every(([p]) => p.params[0].topics === topics && BigInt(p.params[0].toBlock) - BigInt(p.params[0].fromBlock) < 500n)).toBe(true);
});
it('rejects a failed page without reporting earlier pages as complete', async () => {
  const getLogs = vi.fn().mockResolvedValueOnce(['first']).mockRejectedValueOnce(new Error('rate limit'));
  await expect(boundedLogClient({ getLogs }).getLogs({ fromBlock: 0n, toBlock: 1000n })).rejects.toThrow('rate limit');
  expect(getLogs).toHaveBeenCalledTimes(2);
});
it('resolves latest once and preserves other RPC methods and exact-block queries', async () => {
  const getBlockNumber = vi.fn(async () => 1000n), getLogs = vi.fn(async () => []), request = vi.fn(async () => 'result');
  const client = boundedLogClient({ getBlockNumber, getLogs, request });
  await client.getLogs({ fromBlock: 'latest', toBlock: 'latest' });
  expect(getBlockNumber).toHaveBeenCalledTimes(1);
  expect(getLogs).toHaveBeenCalledWith({ fromBlock: 1000n, toBlock: 1000n });
  const exact = { method: 'eth_getLogs', params: [{ blockHash: '0xabc' }] };
  expect(await client.request(exact)).toBe('result');
  expect(request).toHaveBeenCalledWith(exact);
  expect(await client.request({ method: 'eth_chainId' })).toBe('result');
  await expect(client.getLogs({ fromBlock: 2n, toBlock: 1n })).rejects.toThrow('bounds');
});
it('preserves pending, omitted bounds and optional raw params without guessing head semantics', async () => {
  const getLogs = vi.fn(async () => []), request = vi.fn(async () => []);
  const client = boundedLogClient({ getLogs, request });
  await client.getLogs();
  await client.getLogs({ fromBlock: 'pending', toBlock: 'pending' });
  await client.request({ method: 'eth_getLogs' });
  expect(getLogs).toHaveBeenCalledWith(undefined);
  expect(getLogs).toHaveBeenCalledWith({ fromBlock: 'pending', toBlock: 'pending' });
  expect(request).toHaveBeenCalledWith({ method: 'eth_getLogs' });
});
