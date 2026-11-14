import { describe, expect, it } from 'vitest';
import { encodeFunctionData } from 'viem';
import { __test, createsSafe, withSafeCreation } from '../src/create-flow.js';
import { MULTICALL3, unbundleSafeLaunch } from '../src/safe-create.js';

const { initState, buildLaunchArgs, buildRevnetArgs } = __test;
const DEAD = '0xdead000000000000000000000000000000000000';
const SALT = '0x' + '00'.repeat(32);

describe('create authority defaults', () => {
  it('sends project ownership to 0xdead when changes are not enabled', () => {
    const state = initState();
    state.projectType = 'custom';
    state.chainIds = [1];
    state.details.name = 'Immutable project';

    expect(state.details.owner).toBe(DEAD);
    const tx = buildLaunchArgs(state, 1, state.details.owner, 'ipfs://project', SALT, 0);
    expect(tx.args[0]).toBe(DEAD);
  });

  it('uses 0xdead as the default revnet operator', () => {
    const state = initState();
    state.projectType = 'revnet';
    state.chainIds = [1];
    state.details.name = 'Operatorless revnet';
    state.details.ticker = 'REV';

    expect(state.revOperator).toBe(DEAD);
    const tx = buildRevnetArgs(state, 1, DEAD, 'ipfs://revnet', SALT, 0);
    expect(tx.args[1].operator).toBe(DEAD);
  });

  it('deploys a revnet with no shop items through the overload that carries the shop config', () => {
    const state = initState();
    state.projectType = 'revnet';
    state.chainIds = [1];
    state.details.name = 'Shopless revnet';
    state.details.ticker = 'REV';
    state.collection = Object.assign({}, state.collection, { opCanMint: false });

    const tx = buildRevnetArgs(state, 1, DEAD, 'ipfs://revnet', SALT, 0);
    expect(tx.args).toHaveLength(6);
    expect(tx.args[4].baseline721HookConfiguration.tiersConfig.tiers).toEqual([]);
    expect(tx.args[4].preventOperatorMinting).toBe(true);
    expect(() => encodeFunctionData(tx)).not.toThrow();
  });
});

describe('a launch that creates its Safe', () => {
  // The SDK's own address vector, also pinned in safe-create.test.js.
  const SAFE = { owners: ['0x0000000000000000000000000000000000000002', '0x0000000000000000000000000000000000000003', '0x0000000000000000000000000000000000000004'],
    threshold: 2, saltNonce: '0x' + '00'.repeat(31) + '2a', proxyCreationCode: '0x6001600055', address: '0xF0CBF9d51dEe3F870E12f3b4dC36cB5f9a3e4132' };

  it('is on only while the owner or operator is kept', () => {
    const state = initState();
    state.projectType = 'custom';
    state.authoritySafe.on = true;
    expect(createsSafe(state)).toBe(false); // ownership goes to 0xdead by default
    state.details.owner = '';
    expect(createsSafe(state)).toBe(true);
    state.projectType = 'revnet';
    expect(createsSafe(state)).toBe(false);
    state.revOperator = '';
    expect(createsSafe(state)).toBe(true);
  });

  it('sends one batch per chain: the Safe, then exactly the launch call, with its fee', () => {
    const state = initState();
    state.projectType = 'custom'; state.chainIds = [1]; state.details.name = 'Safe project'; state.details.owner = '';
    state.authoritySafe.on = true;
    const plan = Object.assign(buildLaunchArgs(state, 1, SAFE.address, 'ipfs://project', SALT, 0), { chainId: 1, value: 5n });
    const launch = encodeFunctionData({ abi: plan.abi, functionName: plan.functionName || 'launchProjectFor', args: plan.args });
    const batch = withSafeCreation(plan, SAFE);
    expect(batch.address).toBe(MULTICALL3);
    expect(batch.functionName).toBe('aggregate3Value');
    expect(batch.value).toBe(5n);
    expect(batch.launch.address).toBe(plan.address);
    const data = encodeFunctionData({ abi: batch.abi, functionName: batch.functionName, args: batch.args });
    const inner = unbundleSafeLaunch({ to: batch.address, data, value: batch.value }, SAFE);
    expect([inner.to.toLowerCase(), inner.data, inner.value]).toEqual([plan.address.toLowerCase(), launch, 5n]);
    expect(plan.args[0]).toBe(SAFE.address);
  });
});
