// The recorded Defifa games are Defifa 1 (1.0.2) games. asDefifa2 moves a recorded fixture onto the Defifa 2.0
// generation: its deployer, hook implementation, tiers store and the lookup ids keyed to the implementation, in
// every read, input and expected output. A 2.0 game must answer exactly as its 1.0.2 twin did, with its own
// provenance; crossGeneration mixes the two to prove neither generation's provenance admits the other's parts.
import { getAddress } from '../src/abi-registry.js';
import { hookMetadataId } from '../src/hook-metadata.js';

// Defifa 1 used other addresses on the testnets; 2.0 uses one address everywhere.
const generation = (chain) => ({
  v1: { deployer: getAddress('DefifaDeployer_deprecated', chain), implementation: getAddress('DefifaHook_deprecated', chain), store: '0x69913acf79dbba170d9efafe605ee62b42164f9c' },
  v2: { deployer: getAddress('DefifaDeployer', chain), implementation: getAddress('DefifaHook', chain), store: getAddress('DefifaTiersHookStore', chain) },
});
const { v1, v2 } = generation(8453);
const testnet = generation(84532).v1;

const bare = (hex) => hex.slice(2).toLowerCase();
function swap(text, pairs) {
  return pairs.reduce((out, [from, to]) => out.replace(new RegExp(bare(from), 'gi'), bare(to)), text);
}

export function asDefifa2(text) {
  return swap(text, [
    ...[v1, testnet].flatMap((old) => [
      [old.deployer, v2.deployer],
      [old.implementation, v2.implementation],
      [hookMetadataId(old.implementation, 'pay'), hookMetadataId(v2.implementation, 'pay')],
      [hookMetadataId(old.implementation, 'cashOut'), hookMetadataId(v2.implementation, 'cashOut')],
    ]),
    [v1.store, v2.store],
  ]);
}

// One recorded fixture with only `parts` ('deployer', 'implementation', 'store') moved to Defifa 2.0.
export function crossGeneration(text, parts) {
  return swap(text, parts.map((part) => [v1[part], v2[part]]));
}
