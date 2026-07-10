// "Start a new shop" at queue time routes to a DEPLOYER (single-chain JB721TiersHookProjectDeployer, omnichain
// JBOmnichainDeployer explicit overload) — NOT plain JBController.queueRulesetsOf. Mis-routing would queue a
// ruleset with no shop. These are pure encoder/routing tests (the design's highest-risk surface). The on-chain
// deploy-fresh branch requires tiers.length > 0, so that's asserted too.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, decodeFunctionData } from 'viem';
import { build721Config, buildQueueRulesetConfigs, __test } from '../src/create-flow.js';
import { buildNewShopQueueCall } from '../src/discover.js';

const { initState, storeUnit } = __test;
const ALICE = '0x1111111111111111111111111111111111111111';
const CTRL = '0x000000000000000000000000000000000000C001';
const SDEPLOYER = '0x000000000000000000000000000000000000D001';
const ODEPLOYER = '0x000000000000000000000000000000000000D002';
const SALT = '0x' + '0'.repeat(64);

function newShopState() {
  const s = initState();
  s.projectType = 'custom'; s.network = 'mainnet'; s.chainIds = [1]; s.accepts = ['eth'];
  s.details = Object.assign(s.details, { name: 'NewCol', owner: ALICE });
  s.stages[0].weight = '1000'; s.stages[0].durationSeconds = 2592000;
  s.shopEnabled = true; s.shopChoice = 'new';
  s.collection = { name: 'NewCol', symbol: 'NEW', nameTouched: true, symbolTouched: true };
  s.nfts = [{ priceEth: '0.1', limited: true, supply: '100', category: 0 }];
  return s;
}

describe('build721Config produces a valid deploy-fresh config (tiers.length > 0)', () => {
  it('one tier round-trips name/price/supply into tiersConfig.tiers', () => {
    const cfg = build721Config(newShopState(), 'ipfs://x', 1);
    expect(cfg.name).toBe('NewCol');
    expect(cfg.symbol).toBe('NEW');
    expect(cfg.tiersConfig.tiers.length).toBe(1);
    expect(cfg.tiersConfig.tiers[0].initialSupply).toBe(100);
  });
  it('USD store pricing is labelled USD and encoded as currency 2, not token-labelled USDC', () => {
    const s = newShopState();
    s.accepts = ['eth', 'usdc'];
    s.storePricingCurrency = 2;
    s.nfts[0].priceEth = '1';
    expect(storeUnit(s)).toBe('USD');
    const cfg = build721Config(s, 'ipfs://x', 1);
    expect(cfg.tiersConfig.currency).toBe(2);
    expect(cfg.tiersConfig.decimals).toBe(6);
    expect(cfg.tiersConfig.tiers[0].price).toBe(1000000n);
  });

  it('sorts tiers by category before deployer encoding', () => {
    const s = newShopState();
    s.nfts = [
      { priceEth: '0.1', limited: true, supply: '10', category: 7 },
      { priceEth: '0.2', limited: true, supply: '20', category: 0 },
      { priceEth: '0.3', limited: true, supply: '30', category: 3 },
    ];
    const cfg = build721Config(s, 'ipfs://x', 1);
    expect(cfg.tiersConfig.tiers.map((t) => t.category)).toEqual([0, 3, 7]);
    expect(cfg.tiersConfig.tiers.map((t) => t.initialSupply)).toEqual([20, 30, 10]);
  });
});

describe('buildNewShopQueueCall — routes "new shop" to the right deployer + encodes cleanly', () => {
  it('single-chain → JB721TiersHookProjectDeployer (deployTiersHookConfig + controller + salt)', () => {
    const s = newShopState();
    const cfg = build721Config(s, 'ipfs://x', 1);
    const cfgs = buildQueueRulesetConfigs(s, 1, 0);
    const call = buildNewShopQueueCall({ projectId: 5, deployConfig: cfg, cfgs, controller: CTRL, projectDeployer: SDEPLOYER, salt: SALT, isOmnichain: false });
    expect(call.to).toBe(SDEPLOYER);
    const data = encodeFunctionData({ abi: call.abi, functionName: 'queueRulesetsOf', args: call.args });
    const dec = decodeFunctionData({ abi: call.abi, data });
    expect(dec.functionName).toBe('queueRulesetsOf');
    expect(dec.args[0]).toBe(5n);                                   // projectId
    expect(dec.args[1].tiersConfig.tiers.length).toBe(1);          // deploy config tiers
    expect(dec.args[3]).toBe(CTRL);                                 // controller
  });
  it('omnichain → JBOmnichainDeployer (wrapped deploy721Config, memo)', () => {
    const s = newShopState();
    const cfg = build721Config(s, 'ipfs://x', 1);
    const cfgs = buildQueueRulesetConfigs(s, 1, 0);
    const call = buildNewShopQueueCall({ projectId: 5, deployConfig: cfg, cfgs, useDataHookForCashOut: true, omnichainDeployer: ODEPLOYER, salt: SALT, isOmnichain: true, memo: '' });
    expect(call.to).toBe(ODEPLOYER);
    const data = encodeFunctionData({ abi: call.abi, functionName: 'queueRulesetsOf', args: call.args });
    const dec = decodeFunctionData({ abi: call.abi, data });
    expect(dec.functionName).toBe('queueRulesetsOf');
    expect(dec.args[1].useDataHookForCashOut).toBe(true);
    expect(dec.args[1].deployTiersHookConfig.tiersConfig.tiers.length).toBe(1);
  });
});
