import { describe, expect, it } from 'vitest';
import { encodeFunctionData } from 'viem';
import { __test } from '../src/create-flow.js';

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
