// The create flow now ALWAYS deploys a 721 shop hook (empty if no items) so any project can sell NFTs later
// without re-deploying. Every launch goes through JBOmnichainDeployer, which wires a 721 hook, even with 0 items and one chain. (_deploy721Hook is unconditional at launch, so 0 tiers is valid.)
import { describe, it, expect } from 'vitest';
import { __test } from '../src/create-flow.js';

const { initState, buildLaunchArgs } = __test;
const ALICE = '0x1111111111111111111111111111111111111111';
const SALT = '0x' + '0'.repeat(64);

function customState(over) {
  const s = initState();
  s.projectType = 'custom'; s.network = 'mainnet'; s.accepts = ['eth'];
  s.details = Object.assign(s.details, { name: 'NoShop', owner: ALICE });
  s.stages[0].weight = '1000'; s.stages[0].durationSeconds = 2592000;
  return Object.assign(s, over || {}); // shopEnabled stays false, nfts stays [] — the "no shop chosen" case
}

describe('create flow always ships a 721 shop hook (empty when no items)', () => {
  it('single-chain, 0 items → JBOmnichainDeployer with 0 tiers and no suckers, so a chain can connect later', () => {
    const a = buildLaunchArgs(customState({ chainIds: [1] }), 1, ALICE, 'ipfs://u', '0x' + '12'.repeat(32), 0);
    expect(a.contract).toBe('JBOmnichainDeployer');
    expect(a.args[2].deployTiersHookConfig.tiersConfig.tiers.length).toBe(0);
    // The shop keeps the launch salt; the sucker salt is zero, which the deployer reads as "deploy none".
    expect(a.args[2].salt).toBe('0x' + '12'.repeat(32));
    expect(a.args[6]).toMatchObject({ deployerConfigurations: [], salt: '0x' + '00'.repeat(32) });
    expect(a.missingSuckers).toBe(false);
  });
  it('omnichain, 0 items → JBOmnichainDeployer deploy721 path with 0 tiers', () => {
    const a = buildLaunchArgs(customState({ chainIds: [1, 10] }), 1, ALICE, 'ipfs://u', SALT, 0);
    expect(a.contract).toBe('JBOmnichainDeployer');
    expect(a.args[2].deployTiersHookConfig.tiersConfig.tiers.length).toBe(0);
  });
});
