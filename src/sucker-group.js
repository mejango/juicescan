// A project's cross-chain identity, read from the sucker registry onchain. The indexer's sucker group is never an
// ID source: every per-chain project ID that reaches a read or calldata comes from here. Mirrors nana-sdk-core
// actions/suckerPairs.ts (getSuckerPairs, resolveSuckers).
import { getABI, getAddress } from './abi-registry.js';
import { createPublicClientForChain } from './wallet.js';

var remoteSuckerAbi = [
  { type: 'function', name: 'peer', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'projectId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

function pairsOf(client, chainId, projectId) {
  var registry = getAddress('JBSuckerRegistry', chainId);
  if (!registry) return Promise.resolve([]);
  if (!client) return Promise.reject(new Error('No RPC for chain ' + chainId + '.'));
  return client.readContract({ address: registry, abi: getABI('JBSuckerRegistry', chainId), functionName: 'suckerPairsOf', args: [BigInt(projectId)] })
    .then(function (pairs) { return (pairs || []).map(function (p) { return { local: p.local, remoteChainId: Number(p.remoteChainId), remote: '0x' + String(p.remote).slice(-40) }; }); });
}

// Active sucker pairs for a project on `chainId`: [{ local, remoteChainId }]. RPC failures propagate so
// callers can distinguish "no routes" from "could not verify routes".
export function readSuckerPairsOf(projectId, chainId) {
  return pairsOf(createPublicClientForChain(chainId), chainId, projectId);
}

// Direct peers of (chainId, projectId). The peer's project ID is read from the remote sucker the registry names,
// and that sucker's peer() must point back at the local sucker, so a stale or misconfigured registry entry
// rejects instead of yielding another project's ID.
function peersOf(clientFor, chainId, projectId) {
  return pairsOf(clientFor(chainId), chainId, projectId).then(function (pairs) {
    return Promise.all(pairs.map(function (pair) {
      var remote = clientFor(pair.remoteChainId);
      if (!remote) return Promise.reject(new Error('No RPC for chain ' + pair.remoteChainId + '.'));
      function read(fn) { return remote.readContract({ address: pair.remote, abi: remoteSuckerAbi, functionName: fn, args: [] }); }
      return Promise.all([read('peer'), read('projectId')]).then(function (r) {
        if (!/^0x0{24}[0-9a-f]{40}$/i.test(String(r[0])) || ('0x' + String(r[0]).slice(-40)).toLowerCase() !== String(pair.local).toLowerCase()) {
          throw new Error('The sucker at ' + pair.remote + ' on chain ' + pair.remoteChainId + ' is not paired back to ' + pair.local + '.');
        }
        return { chainId: pair.remoteChainId, projectId: BigInt(r[1]) };
      });
    }));
  });
}

// The full group: the local entry first, its direct peers, then the peers those name (one hop). Deduped by the
// whole (chainId, projectId) pair. Any failed read rejects: a short group looks like a project on fewer chains.
export async function resolveSuckerGroup(clientFor, chainId, projectId) {
  var group = [{ chainId: Number(chainId), projectId: BigInt(projectId) }];
  var seen = {};
  function add(entry) {
    var key = entry.chainId + ':' + entry.projectId;
    if (seen[key]) return;
    seen[key] = true;
    group.push(entry);
  }
  seen[group[0].chainId + ':' + group[0].projectId] = true;
  var direct = await peersOf(clientFor, chainId, projectId);
  direct.forEach(add);
  var transitive = await Promise.all(direct.map(function (entry) { return peersOf(clientFor, entry.chainId, entry.projectId); }));
  transitive.forEach(function (list) { list.forEach(add); });
  return group;
}

// { chainId: projectId } from a resolved group. A chain holding two different IDs is dropped, and a group naming a
// different project on the home chain authorizes nothing beyond the home entry.
export function idMapFromGroup(group) {
  var home = group[0];
  var map = {}; map[home.chainId] = Number(home.projectId);
  if (group.some(function (e) { return e.chainId === home.chainId && e.projectId !== home.projectId; })) return map;
  var conflicted = {};
  group.slice(1).forEach(function (e) {
    var id = Number(e.projectId);
    if (conflicted[e.chainId]) return;
    if (!Number.isSafeInteger(id) || id < 1 || (map[e.chainId] != null && map[e.chainId] !== id)) {
      delete map[e.chainId]; conflicted[e.chainId] = true;
      return;
    }
    map[e.chainId] = id;
  });
  return map;
}
