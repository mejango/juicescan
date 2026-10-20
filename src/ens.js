// src/ens.js
// ENS resolution for address fields and the connected-account label. Resolves on mainnet, regardless of
// the chain a form targets.

import { normalize as ensNormalize } from 'viem/ens';
import { createPublicClientForChain } from './component-base.js';

// Reuse the shared mainnet read transport: Center by default, explicit user RPC when configured.
var _ensCache = {};
function ensClient() {
  return createPublicClientForChain(1);
}
export function isEnsName(v) { v = (v || '').trim(); return /\.[a-z]{2,}$/i.test(v) && !/^0x/i.test(v); }
export function resolveEns(name) {
  name = (name || '').trim().toLowerCase();
  if (_ensCache[name] !== undefined) return Promise.resolve(_ensCache[name]);
  var norm; try { norm = ensNormalize(name); } catch (_) { return Promise.resolve(null); }
  return ensClient().getEnsAddress({ name: norm }).then(function (addr) { _ensCache[name] = addr || null; return addr || null; })
    .catch(function () { return null; });
}
// Reverse ENS: a 0x address → its primary ENS name (or null). Cached.
var _ensRevCache = {};
export function reverseEns(address) {
  var a = (address || '').toLowerCase();
  if (_ensRevCache[a] !== undefined) return Promise.resolve(_ensRevCache[a]);
  return ensClient().getEnsName({ address: address }).then(function (name) { _ensRevCache[a] = name || null; return name || null; })
    .catch(function () { return null; });
}
// The address a name resolved to earlier this session, for synchronous encoders ('' or null when unknown).
export function cachedEnsAddress(name) {
  return _ensCache[(name || '').trim().toLowerCase()];
}
