// src/safe-batch.js
// Safe operator batch: a per-chain tray of operator/owner steps that submit as ONE transaction — a
// MultiSendCallOnly proposal when the authority is a Safe, ordered direct sends when it is an EOA. This module
// is pure (no DOM, no wallet): step kinds are data, the composer and MultiSend codec are round-trip tested, and
// the tray storage is the only side effect (localStorage + one DOM event).
import { decodeFunctionData, encodeFunctionData, encodePacked, getAddress as checksumAddress } from 'viem';
import { getAddress } from './abi-registry.js';

// Safe 1.3.0 canonical MultiSendCallOnly (same address on every supported chain). Callers getCode() it before
// proposing through a transaction service; a Safe delegatecalls into it and it CALLs each packed transaction.
export var MULTI_SEND_CALL_ONLY = '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D';
export var multiSendAbi = [{ type: 'function', name: 'multiSend', stateMutability: 'payable', inputs: [{ name: 'transactions', type: 'bytes' }], outputs: [] }];
export var NATIVE_TOKEN = '0x000000000000000000000000000000000000EEEe';
var ZERO = '0x0000000000000000000000000000000000000000';

// Minimal fragments for the registry/hook writes the batch composes. Kept local so the codec has no dependency on
// the generated registry beyond per-chain addresses.
var setHookForAbi = [{ type: 'function', name: 'setHookFor', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'hook', type: 'address' }], outputs: [] }];
var setPoolForAbi = [{ type: 'function', name: 'setPoolFor', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'twapWindow', type: 'uint256' }, { name: 'terminalToken', type: 'address' }], outputs: [] }];
var setTerminalForAbi = [{ type: 'function', name: 'setTerminalFor', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'terminal', type: 'address' }], outputs: [] }];
var setTwapWindowOfAbi = [{ type: 'function', name: 'setTwapWindowOf', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'terminalToken', type: 'address' }, { name: 'newWindow', type: 'uint256' }], outputs: [] }];
var initializePoolForAbi = [{ type: 'function', name: 'initializePoolFor', stateMutability: 'nonpayable', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'twapWindow', type: 'uint256' }, { name: 'terminalToken', type: 'address' }, { name: 'sqrtPriceX96', type: 'uint160' }], outputs: [] }];

function sameAddr(a, b) { return !!(a && b && String(a).toLowerCase() === String(b).toLowerCase()); }
function short(a) { return a ? String(a).slice(0, 6) + '…' + String(a).slice(-4) : '—'; }
function tokenWord(token) { return !token || sameAddr(token, NATIVE_TOKEN) || sameAddr(token, ZERO) ? 'native' : short(token); }
function poolWords(v) { return tokenWord(v.terminalToken) + ' pool, fee ' + v.fee + ', tick spacing ' + v.tickSpacing + ', TWAP ' + v.twapWindow + 's'; }

// Step kinds are data: per-chain contract for the target address, the ABI fragment, and how the chain-agnostic
// `values` a step was built from become args. `perChain` marks steps whose values only make sense on the chain they
// were read on (pool keys, resolved hooks, prices): mirroring them re-resolves through the caller instead of copying.
export var STEP_KINDS = {
  setHookFor: { kind: 'setHookFor', label: 'Set buyback hook', contract: 'JBBuybackHookRegistry', abi: setHookForAbi, functionName: 'setHookFor',
    buildArgs: function (v, pid) { return [pid, v.hook]; }, describe: function (v) { return 'hook ' + short(v.hook); } },
  setPoolFor: { kind: 'setPoolFor', label: 'Register buyback pool', contract: 'JBBuybackHookRegistry', abi: setPoolForAbi, functionName: 'setPoolFor', perChain: true,
    buildArgs: function (v, pid) { return [pid, Number(v.fee), Number(v.tickSpacing), BigInt(v.twapWindow), v.terminalToken]; }, describe: poolWords },
  setTerminalFor: { kind: 'setTerminalFor', label: 'Set router terminal', contract: 'JBRouterTerminalRegistry', abi: setTerminalForAbi, functionName: 'setTerminalFor',
    buildArgs: function (v, pid) { return [pid, v.terminal]; }, describe: function (v) { return 'terminal ' + short(v.terminal); } },
  // setTwapWindowOf lives on the project's own hook, so its target is resolved per chain and passed in as `to`.
  setTwapWindowOf: { kind: 'setTwapWindowOf', label: 'Set TWAP window', contract: 'JBBuybackHook', abi: setTwapWindowOfAbi, functionName: 'setTwapWindowOf', perChain: true,
    buildArgs: function (v, pid) { return [pid, v.terminalToken, BigInt(v.twapWindow)]; }, describe: function (v) { return tokenWord(v.terminalToken) + ' pool, TWAP ' + v.twapWindow + 's'; } },
  initializePoolFor: { kind: 'initializePoolFor', label: 'Initialize buyback pool', contract: 'JBBuybackHookRegistry', abi: initializePoolForAbi, functionName: 'initializePoolFor', perChain: true,
    buildArgs: function (v, pid) { return [pid, Number(v.fee), Number(v.tickSpacing), BigInt(v.twapWindow), v.terminalToken, BigInt(v.sqrtPriceX96)]; }, describe: poolWords },
};

// Any owner/operator power descriptor ({ title, contract, abi, fn, buildArgs(values, chainId, projectId) }) becomes a
// step kind keyed by its function name, so every action that goes through the power modal can be queued. Kinds the
// table already names keep their entries.
export function powerStepKind(action) {
  return {
    kind: action.fn, label: action.title, contract: action.contract, abi: action.abi, functionName: action.fn,
    perChain: action.chainsDefault === 'primary' || !!action.resolveTargets,
    buildArgs: function (values, projectId, chainId) { return action.buildArgs(values, chainId, projectId); },
    describe: function (values) {
      return Object.keys(values || {}).map(function (k) { return k + ' ' + describeValue(values[k]); }).join(', ');
    },
  };
}
export function registerPowerKinds(actions) {
  (actions || []).forEach(function (action) { if (action && action.fn && !STEP_KINDS[action.fn]) STEP_KINDS[action.fn] = powerStepKind(action); });
}
function describeValue(v) {
  if (Array.isArray(v)) return v.map(describeValue).join(' + ');
  if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) return short(v);
  return String(v);
}

export function stepKey(kind, to) { return kind + ':' + String(to).toLowerCase(); }

// Build one step for one chain. `to` overrides the registry lookup (a resolved hook); `args` overrides the kind's
// buildArgs when the caller already reviewed exact args (the power modal's own call).
export function buildStep(kind, opts) {
  var def = STEP_KINDS[kind];
  if (!def) throw new Error('Unknown batch step: ' + kind);
  var chainId = Number(opts.chainId);
  var projectId = BigInt(opts.projectId);
  var to = opts.to || getAddress(def.contract, chainId);
  if (!to) throw new Error('No ' + def.contract + ' on chain ' + chainId);
  var values = opts.values || {};
  var args = opts.args || def.buildArgs(values, projectId, chainId);
  var data = encodeFunctionData({ abi: def.abi, functionName: def.functionName, args: args });
  return {
    id: stepKey(kind, to), kind: kind, chainId: chainId, projectId: projectId, to: to, abi: def.abi, functionName: def.functionName,
    args: args, data: data, value: 0n, label: def.label, contractName: def.contract, values: values,
    detail: def.describe ? def.describe(values) : '',
  };
}

// Adding a step whose key already exists on that chain REPLACES it in place; it never duplicates.
export function upsertStep(steps, step) {
  var out = steps.slice();
  var at = out.findIndex(function (s) { return s.id === step.id; });
  if (at < 0) out.push(step); else out[at] = step;
  return out;
}
export function moveStep(steps, from, to) {
  var out = steps.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  var item = out.splice(from, 1)[0];
  out.splice(to, 0, item);
  return out;
}
export function removeStep(steps, index) { return steps.filter(function (_, i) { return i !== index; }); }

export var DEPENDENCIES = [
  { kind: 'setPoolFor', after: 'setHookFor', message: 'Set the buyback hook before registering its pool. setPoolFor registers on the project’s current hook.' },
];
// Applied only when BOTH kinds are present. Never reorders: the dialog shows the message on the offending step.
export function checkBatchOrder(steps) {
  var problems = [];
  DEPENDENCIES.forEach(function (dep) {
    var kinds = steps.map(function (s) { return s.kind; });
    if (kinds.indexOf(dep.kind) < 0 || kinds.indexOf(dep.after) < 0) return;
    steps.forEach(function (s, i) {
      if (s.kind !== dep.kind) return;
      if (!steps.slice(0, i).some(function (p) { return p.kind === dep.after; })) problems.push({ index: i, message: dep.message });
    });
  });
  return { ok: !problems.length, problems: problems };
}
// True when the step at `index` only succeeds after an earlier step in the same batch (per-call simulation of it
// against current state would be a false negative).
export function dependsOnPrior(steps, index) {
  return DEPENDENCIES.some(function (dep) {
    return steps[index] && steps[index].kind === dep.kind && steps.slice(0, index).some(function (p) { return p.kind === dep.after; });
  });
}

export function composeBatch(steps) {
  var order = checkBatchOrder(steps);
  return { calls: steps.map(function (s) { return { to: s.to, data: s.data, value: 0n }; }), problems: order.problems, ok: order.ok };
}

// MultiSendCallOnly.multiSend(bytes): each transaction packed as uint8 operation ‖ address to ‖ uint256 value ‖
// uint256 data.length ‖ bytes data. Operation is always 0 (CALL) — the contract rejects anything else.
export function encodeMultiSend(calls) {
  var packed = '0x' + calls.map(function (c) {
    var data = c.data || '0x';
    return encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, c.to, BigInt(c.value || 0), BigInt((data.length - 2) / 2), data]).slice(2);
  }).join('');
  return encodeFunctionData({ abi: multiSendAbi, functionName: 'multiSend', args: [packed] });
}
export function decodeMultiSend(data) {
  var decoded;
  try { decoded = decodeFunctionData({ abi: multiSendAbi, data: data }); } catch (_) { return null; }
  if (!decoded || decoded.functionName !== 'multiSend') return null;
  var hex = String(decoded.args[0]).slice(2), i = 0, out = [];
  while (i < hex.length) {
    if (hex.length - i < 170) return null;
    var operation = parseInt(hex.substr(i, 2), 16); i += 2;
    var to = checksumAddress('0x' + hex.substr(i, 40)); i += 40;
    var value = BigInt('0x' + hex.substr(i, 64)); i += 64;
    var length = Number(BigInt('0x' + hex.substr(i, 64))); i += 64;
    if (hex.length - i < length * 2) return null;
    out.push({ operation: operation, to: to, value: value, data: '0x' + hex.substr(i, length * 2) });
    i += length * 2;
  }
  return out;
}
// The inner calls of a queued Safe record that is a MultiSendCallOnly batch, or null for any other record.
export function multiSendBatchCalls(tx) {
  if (!tx || Number(tx.operation) !== 1 || !sameAddr(tx.to, MULTI_SEND_CALL_ONLY)) return null;
  return decodeMultiSend(tx.data);
}

// Rebuild each of `fromChainId`'s steps for `toChainId`: same values, per-chain addresses re-resolved. perChain kinds
// go through `resolve(kind, toChainId, step)` → { values?, to? } to mirror, { reason } or null to skip.
export async function mirrorBatch(steps, fromChainId, toChainId, resolve, projectId) {
  var out = [], skipped = [];
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (Number(step.chainId) !== Number(fromChainId)) continue;
    var def = STEP_KINDS[step.kind];
    if (!def) { skipped.push({ kind: step.kind, label: step.label, reason: 'unknown step kind' }); continue; }
    var values = step.values, to = null;
    if (def.perChain) {
      var resolved = null;
      try { resolved = resolve ? await resolve(step.kind, toChainId, step) : null; }
      catch (e) { resolved = { reason: (e && e.message) || String(e) }; }
      if (!resolved || (!resolved.values && !resolved.to)) {
        skipped.push({ kind: step.kind, label: step.label, reason: (resolved && resolved.reason) || 'its values are chain-specific' });
        continue;
      }
      values = resolved.values || values; to = resolved.to || null;
    }
    try { out.push(buildStep(step.kind, { chainId: toChainId, projectId: projectId == null ? step.projectId : projectId, values: values, to: to })); }
    catch (e) { skipped.push({ kind: step.kind, label: step.label, reason: (e && e.message) || String(e) }); }
  }
  return { steps: out, skipped: skipped };
}

// ── Simulation ───────────────────────────────────────────────────────────────
// Whole-sequence simulation from the authority via eth_simulateV1. When the RPC lacks it, each call is simulated
// alone with eth_call, skipping steps that only succeed after an earlier step of the same batch.
export async function simulateBatchCalls(client, from, calls, dependsOnPriorFlags) {
  var entries = calls.map(function (c) { return { from: from, to: c.to, data: c.data, value: '0x' + BigInt(c.value || 0).toString(16) }; });
  var result = null;
  try { result = await client.request({ method: 'eth_simulateV1', params: [{ blockStateCalls: [{ calls: entries }], validation: true }, 'latest'] }); }
  catch (e) { if (!rpcMethodUnsupported(e)) throw new Error('The batch simulation failed: ' + rpcMessage(e) + '. Nothing was proposed.'); }
  if (result) {
    var block = Array.isArray(result) ? result[0] : null;
    var outcomes = (block && block.calls) || [];
    if (outcomes.length !== calls.length) throw new Error('The batch simulation returned an unexpected shape. Nothing was proposed.');
    outcomes.forEach(function (outcome, i) {
      if (String(outcome && outcome.status).toLowerCase() !== '0x1') {
        throw new Error('Step ' + (i + 1) + ' would revert' + (outcome && outcome.error && outcome.error.message ? ': ' + outcome.error.message : '') + '. Nothing was proposed.');
      }
    });
    return { method: 'eth_simulateV1', simulated: calls.length };
  }
  var simulated = 0;
  for (var i = 0; i < entries.length; i++) {
    if (dependsOnPriorFlags && dependsOnPriorFlags[i]) continue;
    try { await client.request({ method: 'eth_call', params: [entries[i], 'latest'] }); simulated++; }
    catch (e) { throw new Error('Step ' + (i + 1) + ' would revert: ' + rpcMessage(e) + '. Nothing was proposed.'); }
  }
  return { method: 'eth_call', simulated: simulated };
}
function rpcMessage(e) { return (e && (e.shortMessage || e.message)) || String(e); }
function rpcMethodUnsupported(e) {
  for (var depth = 0, current = e; current && depth < 6; depth++, current = current.cause) {
    if (Number(current.code) === -32601) return true;
    if (/method not found|not supported|unsupported method|does not exist/i.test(String(current.message || ''))) return true;
  }
  return false;
}

// ── Tray storage ─────────────────────────────────────────────────────────────
var STORAGE_PREFIX = 'jb-safe-batch-v1:';
export var TRAY_UPDATED_EVENT = 'jb:safe-batch-updated';
export function trayKey(chainId, projectId) { return STORAGE_PREFIX + Number(chainId) + ':' + String(projectId); }
function stringify(value) { return JSON.stringify(value, function (_, item) { return typeof item === 'bigint' ? { $jbBigInt: item.toString() } : item; }); }
function parse(value) { return JSON.parse(value, function (_, item) { return item && typeof item === 'object' && Object.keys(item).length === 1 && typeof item.$jbBigInt === 'string' ? BigInt(item.$jbBigInt) : item; }); }

// A stored step is trusted only when its calldata re-encodes from its own ABI + args; anything else discards the tray.
function validateStep(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string' || typeof raw.functionName !== 'string' || !Array.isArray(raw.abi) || !Array.isArray(raw.args)) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(raw.to || '')) || !/^0x(?:[0-9a-f]{2})+$/i.test(String(raw.data || ''))) return null;
  var chainId = Number(raw.chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
  var projectId;
  try { projectId = BigInt(raw.projectId); } catch (_) { return null; }
  if (projectId <= 0n) return null;
  try { if (encodeFunctionData({ abi: raw.abi, functionName: raw.functionName, args: raw.args }).toLowerCase() !== String(raw.data).toLowerCase()) return null; }
  catch (_) { return null; }
  return {
    id: stepKey(raw.kind, raw.to), kind: raw.kind, chainId: chainId, projectId: projectId, to: raw.to, abi: raw.abi, functionName: raw.functionName,
    args: raw.args, data: raw.data, value: 0n, label: String(raw.label || raw.kind), contractName: raw.contractName ? String(raw.contractName) : null,
    values: raw.values && typeof raw.values === 'object' ? raw.values : {}, detail: String(raw.detail || ''),
  };
}
export function loadTray(chainId, projectId) {
  try {
    var raw = localStorage.getItem(trayKey(chainId, projectId));
    if (!raw) return [];
    var parsed = parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 24) return [];
    var steps = parsed.map(validateStep);
    return steps.some(function (s) { return !s; }) ? [] : steps;
  } catch (_) { return []; }
}
export function saveTray(chainId, projectId, steps) {
  try {
    var key = trayKey(chainId, projectId);
    if (!steps || !steps.length) localStorage.removeItem(key);
    else localStorage.setItem(key, stringify(steps.map(function (s) { return Object.assign({}, s, { value: undefined }); })));
  } catch (_) {}
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(TRAY_UPDATED_EVENT, { detail: { chainId: Number(chainId), projectId: String(projectId) } }));
  return steps || [];
}
export function clearTray(chainId, projectId) { return saveTray(chainId, projectId, []); }
