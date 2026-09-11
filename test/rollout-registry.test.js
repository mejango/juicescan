import { afterEach, describe, expect, it, vi } from 'vitest';
const routingRuntime = vi.hoisted(() => ({ client: null }));
vi.mock('../src/component-base.js', async original => ({ ...await original(), createPublicClientForChain: () => routingRuntime.client }));
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeFunctionData } from 'viem';
import { mirrorBatch, buildStep, NATIVE_TOKEN } from '../src/safe-batch.js';
import { projectRouterPath } from '../src/discover.js';
import { mirrorResolver } from '../src/safe-batch-ui.js';
import { getABI, getAddress, meta as contractMeta } from '../src/abi-registry.js';
import { contractNameByAddress } from '../src/chain.js';
import { decodeCallForDisplay } from '../src/component-base.js';

const require = createRequire(import.meta.url);
const { abiEntryKey, validateGatewayRollout } = require('../build/sync-deployments.js');
const directories = [];
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function artifact(name, address, args = [], names = []) {
  return { contractName: name, chainId: '0xaa36a7', address, args,
    abi: [{ type: 'constructor', inputs: names.map(name => ({ name, type: 'address' })) }],
    receipt: { status: '0x1', blockNumber: '0x42', transactionHash: '0x' + 'ab'.repeat(32) } };
}
function rolloutFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'juicescan-rollout-'));
  directories.push(directory);
  const hook = artifact('JBBuybackHook', '0x' + '11'.repeat(20));
  const router = artifact('JBRouterTerminal', '0x' + '22'.repeat(20), [hook.address], ['buybackHook']);
  const gateway = artifact('JBRouterTerminalGateway', '0x' + '33'.repeat(20), [router.address], ['router']);
  const save = (record) => writeFileSync(join(directory, record.contractName + '.json'), JSON.stringify(record));
  [hook, router, gateway].forEach(save);
  return { directory, hook, router, gateway, save };
}

describe('staged buyback and gateway rollout', () => {
  it('uses the old mainnet ABI while exposing the floor-fix ABI and gateway only on executed testnets', () => {
    const hasFloorError = (chain) => getABI('JBBuybackHook', chain).some(entry => entry.name === 'JBBuybackHook_DerivedFloorNotMet');
    expect(hasFloorError(1)).toBe(false);
    expect(hasFloorError(11155111)).toBe(true);
    expect(getAddress('JBRouterTerminalGateway', 1)).toBeNull();
    expect(getAddress('JBRouterTerminalGateway', 11155111)).toMatch(/^0x/);
    expect(getAddress('JBRatioPriceFeed', 11155420)).toMatch(/^0x/);
    expect(getAddress('JBRouterTerminalGateway', 11155420)).toBeNull();
    expect(getAddress('JBBuybackHook', 11155420)).toBeNull();
  });

  it('preserves previous and v1 identities and decodes their queued transactions with their own ABI', () => {
    for (const name of ['JBBuybackHook_deprecated', 'JBBuybackHook_deprecated1', 'JBRouterTerminal_deprecated', 'JBRouterTerminal_deprecated1']) {
      const address = getAddress(name, 11155111);
      expect(address).toMatch(/^0x/);
      expect(contractNameByAddress(address)).toBe(name);
      expect(contractMeta[name].generation).toBe(name.endsWith('1') ? 'previous' : 'v1');
    }
    const name = 'JBBuybackHook_deprecated1';
    const data = encodeFunctionData({ abi: getABI(name), functionName: 'setTwapWindowOf', args: [2n, '0x' + '00'.repeat(20), 1800n] });
    expect(decodeCallForDisplay({ address: getAddress(name, 11155111), chainId: 11155111, calldata: data }).fn).toBe('setTwapWindowOf');
  });

  it.each([1, 11155420])('does not mirror a testnet migration or its pool to unexecuted chain %s', async (chainId) => {
    const steps = [
      buildStep('setHookFor', { chainId: 11155111, projectId: 2, values: { hook: getAddress('JBBuybackHook', 11155111) } }),
      buildStep('setPoolFor', { chainId: 11155111, projectId: 2, values: { fee: 10000, tickSpacing: 200, twapWindow: 1800, terminalToken: NATIVE_TOKEN } }),
      buildStep('setTerminalFor', { chainId: 11155111, projectId: 2, values: { terminal: getAddress('JBRouterTerminalGateway', 11155111) } }),
    ];
    const project = { id: '2', chainId: 11155111, idByChain: { [chainId]: 6 } };
    const result = await mirrorBatch(steps, 11155111, chainId, mirrorResolver(project), 6);
    expect(result.steps).toEqual([]);
    expect(result.skipped.map(step => step.kind)).toEqual(['setHookFor', 'setPoolFor', 'setTerminalFor']);
  });

  it.each([false, true])('drops a dependent pool when its required hook cannot be mirrored (reordered: %s)', async (reordered) => {
    const steps = [
      buildStep('setHookFor', { chainId: 11155111, projectId: 2, values: { hook: getAddress('JBBuybackHook', 11155111) } }),
      buildStep('setPoolFor', { chainId: 11155111, projectId: 2, values: { fee: 10000, tickSpacing: 200, twapWindow: 1800, terminalToken: NATIVE_TOKEN } }),
    ];
    if (reordered) steps.reverse();
    const result = await mirrorBatch(steps, 11155111, 84532, async (kind, chain, step) => kind === 'setHookFor' ? null : { values: step.values }, 6);
    expect(result.steps).toEqual([]);
    expect(result.skipped[1].reason).toMatch(/setHookFor could not be mirrored/);
  });

  it.each(['gateway', 'previous', 'direct'])('resolves the %s project router path without replacing its selected terminal', async (mode) => {
    const registry = getAddress('JBRouterTerminalRegistry', 11155111);
    const gateway = getAddress('JBRouterTerminalGateway', 11155111);
    const router = getAddress('JBRouterTerminal', 11155111);
    const previous = getAddress('JBRouterTerminal_deprecated1', 11155111);
    routingRuntime.client = { readContract: vi.fn(async ({ functionName, args }) => {
      if (functionName === 'isTerminalOf') return args[1] === (mode === 'direct' ? gateway : registry);
      if (functionName === 'terminalOf') return mode === 'previous' ? previous : gateway;
      if (functionName === 'ROUTER') return router;
      throw new Error('Unexpected read');
    }) };
    expect(await projectRouterPath({ id: '2', chainId: 11155111 }, 11155111)).toEqual({
      registry: mode === 'direct' ? null : registry,
      terminal: mode === 'previous' ? previous : gateway,
      gateway: mode === 'previous' ? null : gateway,
      router: mode === 'previous' ? previous : router,
    });
  });

  it('does not turn a failed router-path read into an absent router', async () => {
    routingRuntime.client = { readContract: vi.fn(async () => { throw new Error('RPC unavailable'); }) };
    await expect(projectRouterPath({ id: '2', chainId: 11155111 }, 11155111)).rejects.toThrow('RPC unavailable');
  });

  it('deduplicates ABI signatures independently of compiler internal types and argument names', () => {
    expect(abiEntryKey({ type: 'function', name: 'pay', inputs: [{ name: 'token', type: 'address', internalType: 'contract IERC20' }] }))
      .toBe(abiEntryKey({ type: 'function', name: 'pay', inputs: [{ name: '_token', type: 'address', internalType: 'address' }] }));
  });

  it('rejects a proposal-only or reverted gateway artifact and mismatched router/hook identity', () => {
    const fixture = rolloutFixture();
    expect(() => validateGatewayRollout(fixture.directory)).not.toThrow();
    fixture.gateway.receipt.status = '0x0'; fixture.save(fixture.gateway);
    expect(() => validateGatewayRollout(fixture.directory)).toThrow(/executed/);
    delete fixture.gateway.receipt; fixture.save(fixture.gateway);
    expect(() => validateGatewayRollout(fixture.directory)).toThrow(/executed/);
    fixture.gateway = artifact('JBRouterTerminalGateway', '0x' + '33'.repeat(20), [fixture.hook.address], ['router']); fixture.save(fixture.gateway);
    expect(() => validateGatewayRollout(fixture.directory)).toThrow(/identities/);
  });
});
