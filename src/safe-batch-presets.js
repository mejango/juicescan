// src/safe-batch-presets.js
// Batch presets are data plus live reads: a preset names target contracts and the step kinds that move a project
// onto them, and resolvePreset() turns that into the exact steps one chain still needs. It never submits.
import { getAddress } from './abi-registry.js';
import { chainNameFor, usdcByChain } from './chain.js';
import { NATIVE_TOKEN } from './safe-batch.js';

var ZERO = '0x0000000000000000000000000000000000000000';
// JBBuybackHook._requireValidTwapWindow bounds; the deployer registers pools at MAX, and the hook stores 30 minutes
// when asked for exactly the max, so a carried pool defaults to 30 minutes instead of a nominal 48 hours.
export var MAX_TWAP_WINDOW = 172800;
export var DEFAULT_TWAP_WINDOW = 1800;
export var DEPLOYER_DEFAULT_TWAP_NOTE = 'The old window was the deployer default (48h); 30 minutes will be stored.';

var hookOfAbi = [{ type: 'function', name: 'hookOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ type: 'address' }] }];
var terminalOfAbi = [{ type: 'function', name: 'terminalOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }], outputs: [{ type: 'address' }] }];
var twapWindowOfAbi = [{ type: 'function', name: 'twapWindowOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'terminalToken', type: 'address' }], outputs: [{ type: 'uint256' }] }];
var poolKeyOfAbi = [{ type: 'function', name: 'poolKeyOf', stateMutability: 'view', inputs: [{ name: 'projectId', type: 'uint256' }, { name: 'terminalToken', type: 'address' }],
  outputs: [{ name: 'key', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] }] }];

export var BUYBACK_GATEWAY_PRESET = {
  id: 'buyback-1-4-0-gateway',
  title: 'Move to buyback 1.4.0 + gateway',
  description: 'Points the project at the current buyback hook and router gateway, carrying its live pool onto the new hook.',
  targets: { hook: 'JBBuybackHook', terminal: 'JBRouterTerminalGateway' },
  steps: ['setHookFor', 'setPoolFor', 'setTerminalFor'],
};
export var PRESETS = [BUYBACK_GATEWAY_PRESET];

function sameAddr(a, b) { return !!(a && b && String(a).toLowerCase() === String(b).toLowerCase()); }
function hasCode(code) { return typeof code === 'string' && code.length > 2; }
function unavailable(reason) { return { available: false, reason: reason, steps: [], notes: [], nothingToDo: false }; }

// Resolve one preset on one chain with live reads. `client` is a viem public client (getCode + readContract).
// Returns { available, reason, steps: [{ kind, values, note? }], notes, nothingToDo }.
export async function resolvePreset(preset, opts) {
  var chainId = Number(opts.chainId), client = opts.client, name = chainNameFor(chainId);
  var pid = BigInt(opts.projectId);
  var targets = { hook: getAddress(preset.targets.hook, chainId), terminal: getAddress(preset.targets.terminal, chainId) };
  if (!targets.hook || !targets.terminal) return unavailable('Not deployed on ' + name + ' yet.');
  var registry = getAddress('JBBuybackHookRegistry', chainId), routerRegistry = getAddress('JBRouterTerminalRegistry', chainId);
  if (!registry || !routerRegistry) return unavailable('Not deployed on ' + name + ' yet.');
  var codes = await Promise.all([client.getCode({ address: targets.hook }), client.getCode({ address: targets.terminal })]);
  if (!hasCode(codes[0]) || !hasCode(codes[1])) return unavailable('Not deployed on ' + name + ' yet.');
  function readOn(address, abi, functionName, args) { return client.readContract({ address: address, abi: abi, functionName: functionName, args: args }); }

  var steps = [], notes = [];
  var currentHook = await readOn(registry, hookOfAbi, 'hookOf', [pid]);
  var hookApplied = sameAddr(currentHook, targets.hook);
  if (!hookApplied) steps.push({ kind: 'setHookFor', values: { hook: targets.hook } });

  // Pools live on the hook, keyed by normalized terminal token: reads use address(0) for native, writes use the
  // 0xEEEe sentinel the hook normalizes. Carry a pool only when the old hook has one and the new hook does not.
  if (!hookApplied && currentHook && !sameAddr(currentHook, ZERO)) {
    var probes = [{ read: ZERO, write: NATIVE_TOKEN, word: 'native' }];
    var usdc = usdcByChain()[chainId];
    if (usdc) probes.push({ read: usdc, write: usdc, word: 'USDC' });
    for (var i = 0; i < probes.length; i++) {
      var probe = probes[i];
      var oldWindow = Number(await readOn(currentHook, twapWindowOfAbi, 'twapWindowOf', [pid, probe.read]));
      if (!(oldWindow > 0)) continue;
      var carried = Number(await readOn(targets.hook, twapWindowOfAbi, 'twapWindowOf', [pid, probe.read]));
      if (carried > 0) { notes.push('The ' + probe.word + ' pool is already registered on the new hook.'); continue; }
      var key = await readOn(currentHook, poolKeyOfAbi, 'poolKeyOf', [pid, probe.read]);
      var deployerDefault = oldWindow === MAX_TWAP_WINDOW;
      steps.push({
        kind: 'setPoolFor',
        values: { fee: Number(key.fee), tickSpacing: Number(key.tickSpacing), twapWindow: deployerDefault ? DEFAULT_TWAP_WINDOW : oldWindow, terminalToken: probe.write },
        note: deployerDefault ? DEPLOYER_DEFAULT_TWAP_NOTE : null,
      });
    }
  }

  var terminal = await readOn(routerRegistry, terminalOfAbi, 'terminalOf', [pid]);
  if (!sameAddr(terminal, targets.terminal)) steps.push({ kind: 'setTerminalFor', values: { terminal: targets.terminal } });

  return {
    available: true, steps: steps, notes: notes, nothingToDo: !steps.length,
    reason: steps.length ? null : 'Nothing to do on ' + name + ': already on the current hook and gateway.',
  };
}
