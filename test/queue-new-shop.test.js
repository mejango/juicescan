// "Start a new shop" at queue time routes to a DEPLOYER (single-chain JB721TiersHookProjectDeployer, omnichain
// JBOmnichainDeployer explicit overload) — NOT plain JBController.queueRulesetsOf. Mis-routing would queue a
// ruleset with no shop. These are pure encoder/routing tests (the design's highest-risk surface). The on-chain
// deploy-fresh branch requires tiers.length > 0, so that's asserted too.
import { describe, it, expect } from 'vitest';
import { encodeFunctionData, decodeFunctionData, toFunctionSelector } from 'viem';
import { build721Config, buildQueueRulesetConfigs, __test } from '../src/create-flow.js';
import { buildNewShopQueueCall, buildOmnichainQueueArgs, newShopDeploymentSalt } from '../src/discover.js';
import { getABI } from '../src/abi-registry.js';

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
  s.nfts = [{ price: '0.1', limited: true, supply: '100', category: 0 }];
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
    s.nfts[0].price = '1';
    expect(storeUnit(s)).toBe('USD');
    const cfg = build721Config(s, 'ipfs://x', 1);
    expect(cfg.tiersConfig.currency).toBe(2);
    expect(cfg.tiersConfig.decimals).toBe(6);
    expect(cfg.tiersConfig.tiers[0].price).toBe(1000000n);
  });

  it('per-chain item supply flows into each chain\'s tiersConfig', () => {
    const s = newShopState();
    s.chainIds = [1, 8453];
    __test.pcAddrSet(s, 8453, 'isup:0', '7');
    expect(build721Config(s, 'ipfs://x', 1).tiersConfig.tiers[0].initialSupply).toBe(100);
    expect(build721Config(s, 'ipfs://x', 8453).tiersConfig.tiers[0].initialSupply).toBe(7);
  });

  it('per-chain payout amounts produce per-chain limits and splits', () => {
    const s = initState();
    s.projectType = 'custom'; s.network = 'mainnet'; s.chainIds = [1, 8453]; s.accepts = ['eth'];
    s.details.name = 'P'; s.details.owner = ALICE;
    s.stages[0].payoutMode = 'limited';
    s.stages[0].payoutRecipients = [{ type: 'wallet', address: ALICE, projectId: 0, percent: 0, amountEth: '1' }];
    __test.pcAddrSet(s, 8453, 'pamt:0:0', '2.5');
    const limitOn = (cid) => buildQueueRulesetConfigs(s, cid, 0)[0].fundAccessLimitGroups[0].payoutLimits[0].amount;
    expect(limitOn(1)).toBe(1000000000000000000n);
    expect(limitOn(8453)).toBe(2500000000000000000n);
  });

  it('sorts tiers by category before deployer encoding', () => {
    const s = newShopState();
    s.nfts = [
      { price: '0.1', limited: true, supply: '10', category: 7 },
      { price: '0.2', limited: true, supply: '20', category: 0 },
      { price: '0.3', limited: true, supply: '30', category: 3 },
    ];
    const cfg = build721Config(s, 'ipfs://x', 1);
    expect(cfg.tiersConfig.tiers.map((t) => t.category)).toEqual([0, 3, 7]);
    expect(cfg.tiersConfig.tiers.map((t) => t.initialSupply)).toEqual([20, 30, 10]);
  });
});

describe('buildNewShopQueueCall — routes "new shop" to the right deployer + encodes cleanly', () => {
  it('uses nonce-based CREATE for a fresh direct shop and reserves deterministic salt for omnichain hooks', () => {
    const s = newShopState();
    expect(newShopDeploymentSalt(s, ALICE, false)).toBe(SALT);
    expect(newShopDeploymentSalt(s, ALICE, true)).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(newShopDeploymentSalt(s, ALICE, true)).not.toBe(SALT);
  });

  it('single-chain → JB721TiersHookProjectDeployer (deployTiersHookConfig + controller + salt)', () => {
    const s = newShopState();
    const cfg = build721Config(s, 'ipfs://x', 1);
    const cfgs = buildQueueRulesetConfigs(s, 1, 0, { payDataHookVariant: true });
    const call = buildNewShopQueueCall({ projectId: 5, deployConfig: cfg, cfgs, controller: CTRL, projectDeployer: SDEPLOYER, salt: SALT, isOmnichain: false });
    expect(call.to).toBe(SDEPLOYER);
    const data = encodeFunctionData({ abi: call.abi, functionName: 'queueRulesetsOf', args: call.args });
    const dec = decodeFunctionData({ abi: call.abi, data });
    expect(dec.functionName).toBe('queueRulesetsOf');
    expect(dec.args[0]).toBe(5n);                                   // projectId
    expect(dec.args[1].tiersConfig.tiers.length).toBe(1);          // deploy config tiers
    expect(dec.args[2].projectId).toBe(5n);                        // nested JBQueueRulesetsConfig
    expect(dec.args[2].rulesetConfigurations).toHaveLength(cfgs.length);
    expect(dec.args[2].rulesetConfigurations[0].metadata.useDataHookForPay).toBeUndefined();
    expect(dec.args[3]).toBe(CTRL);                                 // controller

    // Decode with the generated deployment ABI too: a self-consistent but wrong local tuple would still pass
    // the round-trip above while producing a selector the deployed contract rejects.
    const canonical = decodeFunctionData({ abi: getABI('JB721TiersHookProjectDeployer'), data });
    expect(canonical.functionName).toBe('queueRulesetsOf');
    expect(canonical.args[2].projectId).toBe(5n);
    expect(canonical.args[2].rulesetConfigurations).toHaveLength(cfgs.length);
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

    const canonicalAbi = getABI('JBOmnichainDeployer');
    const canonicalFunction = canonicalAbi.find((item) => item.type === 'function' && item.name === 'queueRulesetsOf' && item.inputs.length === 4);
    expect(data.slice(0, 10)).toBe(toFunctionSelector(canonicalFunction));
    const canonical = decodeFunctionData({ abi: canonicalAbi, data });
    expect(canonical.args[0]).toBe(5n);
    expect(canonical.args[1].useDataHookForCashOut).toBe(true);
    expect(canonical.args[1].deployTiersHookConfig.tiersConfig.tiers).toHaveLength(1);
    expect(canonical.args[2]).toHaveLength(cfgs.length);
    expect(canonical.args[3]).toBe('');
  });
});

describe('buildOmnichainQueueArgs — existing-shop JBOmnichainDeployer overload', () => {
  it('pins target, chain, value, selector, project, rulesets, and memo through the generated ABI', () => {
    const s = newShopState();
    const cfgs = buildQueueRulesetConfigs(s, 1, 0);
    const tx = buildOmnichainQueueArgs({
      chainId: 1,
      omnichainDeployer: ODEPLOYER,
      projectId: 23,
      rulesetConfigs: cfgs,
      memo: 'next stage',
    });
    expect(tx).toMatchObject({
      chainId: 1,
      address: ODEPLOYER,
      contractName: 'JBOmnichainDeployer',
      functionName: 'queueRulesetsOf',
      value: 0n,
    });

    const data = encodeFunctionData({ abi: tx.abi, functionName: tx.functionName, args: tx.args });
    const canonicalAbi = getABI('JBOmnichainDeployer');
    const canonicalFunction = canonicalAbi.find((item) => item.type === 'function' && item.name === 'queueRulesetsOf' && item.inputs.length === 3);
    expect(data.slice(0, 10)).toBe(toFunctionSelector(canonicalFunction));
    const canonical = decodeFunctionData({ abi: canonicalAbi, data });
    expect(canonical.functionName).toBe('queueRulesetsOf');
    expect(canonical.args[0]).toBe(23n);
    expect(canonical.args[1]).toHaveLength(cfgs.length);
    expect(canonical.args[1][0].duration).toBe(cfgs[0].duration);
    expect(canonical.args[1][0].weight).toBe(cfgs[0].weight);
    expect(canonical.args[1][0].metadata.baseCurrency).toBe(cfgs[0].metadata.baseCurrency);
    expect(canonical.args[2]).toBe('next stage');
  });
});
