// Outbox leaves a bridge scan found, by chain, sucker and token. A leaf never changes once its block is final, so
// leaves over an hour old are also kept across page loads; newer ones are kept for this page only. An entry is
// usable while the outbox holds at least as many leaves as when it was saved. The scan rebuilds the tree from
// every leaf, kept or new, and checks it against the emitted root; a mismatch drops the entry.
import { cacheGet, cacheSet } from './cache.js';

var NAMESPACE = 'bridge-leaves';
var SETTLED_SECONDS = 3600;
var memory = {};

export function bridgeLeavesFor(key, count) {
  var entry = memory[key] || cacheGet(NAMESPACE, key);
  return entry && Number.isSafeInteger(entry.count) && entry.count <= count ? entry : null;
}

// `entry` is { count, byIndex, blockOf, ts }, each keyed by leaf index; `ts` is the leaf's block time in seconds.
export function keepBridgeLeaves(key, entry) {
  memory[key] = entry;
  var cutoff = Date.now() / 1000 - SETTLED_SECONDS;
  var settled = { count: entry.count, byIndex: {}, blockOf: {}, ts: {} };
  Object.keys(entry.byIndex).forEach(function (index) {
    if (!(entry.ts[index] <= cutoff)) return;
    settled.byIndex[index] = entry.byIndex[index];
    settled.blockOf[index] = entry.blockOf[index];
    settled.ts[index] = entry.ts[index];
  });
  cacheSet(NAMESPACE, key, settled);
}

export function dropBridgeLeaves(key) {
  delete memory[key];
  cacheSet(NAMESPACE, key, null);
}
