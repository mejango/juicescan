import { describe, expect, it } from 'vitest';
import { idMapFromGroup, resolveSuckerGroup } from '../src/sucker-group.js';

const addr = (n) => '0x' + n.toString(16).padStart(40, '0');
const b32 = (a) => '0x' + '0'.repeat(24) + a.slice(2);

// A fake multichain world. `pair(a, b)` deploys a sucker on each side, paired with each other, and registers the
// route in both chains' registries. `peerOverride` lets a test point a remote sucker somewhere else.
function world() {
  let next = 1;
  const registry = {}; // chainId -> projectId -> pairs
  const suckers = {}; // chainId -> address -> { peer, projectId }
  const reads = [];
  function register(chainId, projectId, pair) {
    ((registry[chainId] ||= {})[projectId] ||= []).push(pair);
  }
  return {
    reads,
    pair([chainA, projectA], [chainB, projectB]) {
      const a = addr(next++), b = addr(next++);
      (suckers[chainA] ||= {})[a] = { peer: b32(b), projectId: BigInt(projectA) };
      (suckers[chainB] ||= {})[b] = { peer: b32(a), projectId: BigInt(projectB) };
      register(chainA, projectA, { local: a, remote: b32(b), remoteChainId: BigInt(chainB) });
      register(chainB, projectB, { local: b, remote: b32(a), remoteChainId: BigInt(chainA) });
      return { a, b };
    },
    suckers,
    clientFor(chainId) {
      return {
        async readContract({ address, functionName, args }) {
          reads.push(chainId + ':' + functionName);
          if (functionName === 'suckerPairsOf') return (registry[chainId] || {})[Number(args[0])] || [];
          const s = (suckers[chainId] || {})[address];
          if (!s) throw new Error('no contract at ' + address);
          return s[functionName];
        },
      };
    },
  };
}

describe('resolveSuckerGroup', () => {
  it('registry lists peers: returns home first then peers with remote projectId()', async () => {
    const w = world();
    w.pair([1, 5], [10, 7]);
    w.pair([1, 5], [8453, 5]);
    const group = await resolveSuckerGroup(w.clientFor, 1, 5n);
    expect(group).toEqual([
      { chainId: 1, projectId: 5n },
      { chainId: 10, projectId: 7n },
      { chainId: 8453, projectId: 5n },
    ]);
  });

  it('peer() not pointing back rejects', async () => {
    const w = world();
    const { b } = w.pair([1, 5], [10, 7]);
    w.suckers[10][b].peer = b32(addr(999));
    await expect(resolveSuckerGroup(w.clientFor, 1, 5n)).rejects.toThrow(new RegExp('sucker at ' + b + ' on chain 10 is not paired back'));
  });

  it('a peer() with dirty upper bytes is not an EVM pairing', async () => {
    const w = world();
    const { a, b } = w.pair([1, 5], [10, 7]);
    w.suckers[10][b].peer = '0x' + '11'.repeat(12) + a.slice(2);
    await expect(resolveSuckerGroup(w.clientFor, 1, 5n)).rejects.toThrow(/not paired back/);
  });

  it('a registry remote with dirty upper bytes is never read as an EVM sucker', async () => {
    const w = world();
    const { b } = w.pair([1, 5], [10, 7]);
    const client = w.clientFor(1);
    const pairs = await client.readContract({ address: '', functionName: 'suckerPairsOf', args: [5n] });
    pairs[0].remote = '0x' + '22'.repeat(12) + b.slice(2);
    await expect(resolveSuckerGroup(w.clientFor, 1, 5n)).rejects.toThrow(/non-EVM sucker on chain 10/);
  });

  it('transitive hop adds a chain the home does not pair directly', async () => {
    const w = world();
    w.pair([1, 5], [10, 7]);
    w.pair([10, 7], [42161, 3]);
    const group = await resolveSuckerGroup(w.clientFor, 1, 5n);
    expect(group).toEqual([
      { chainId: 1, projectId: 5n },
      { chainId: 10, projectId: 7n },
      { chainId: 42161, projectId: 3n },
    ]);
  });

  it('any failed read rejects instead of returning a short group', async () => {
    const w = world();
    w.pair([1, 5], [10, 7]);
    const clientFor = (chainId) => chainId === 10
      ? { readContract: async () => { throw new Error('rpc down'); } }
      : w.clientFor(chainId);
    await expect(resolveSuckerGroup(clientFor, 1, 5n)).rejects.toThrow('rpc down');
    await expect(resolveSuckerGroup((c) => (c === 10 ? null : w.clientFor(c)), 1, 5n)).rejects.toThrow(/No RPC for chain 10/);
  });

  it('an unpaired project is a group of one', async () => {
    const w = world();
    expect(await resolveSuckerGroup(w.clientFor, 1, 5n)).toEqual([{ chainId: 1, projectId: 5n }]);
  });
});

describe('idMapFromGroup', () => {
  it('maps each chain to its own project ID', () => {
    expect(idMapFromGroup([{ chainId: 1, projectId: 5n }, { chainId: 10, projectId: 7n }])).toEqual({ 1: 5, 10: 7 });
  });

  it('drops a chain that holds two different IDs and any ID that does not fit a safe integer', () => {
    expect(idMapFromGroup([
      { chainId: 1, projectId: 5n }, { chainId: 10, projectId: 7n }, { chainId: 10, projectId: 8n },
      { chainId: 10, projectId: 7n }, { chainId: 8453, projectId: 2n ** 53n },
    ])).toEqual({ 1: 5 });
  });

  it('refuses a home ID that does not fit a safe integer', () => {
    expect(() => idMapFromGroup([{ chainId: 1, projectId: 2n ** 53n + 1n }])).toThrow(/Unsupported project ID/);
  });

  it('a group naming another project on the home chain authorizes only the home entry', () => {
    expect(idMapFromGroup([
      { chainId: 1, projectId: 5n }, { chainId: 10, projectId: 7n }, { chainId: 1, projectId: 6n },
    ])).toEqual({ 1: 5 });
  });
});
