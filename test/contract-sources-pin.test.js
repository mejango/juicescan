import { afterEach, describe, expect, test } from 'vitest';
import { getFunctionSource, sources } from '../src/abi-registry.js';
import contractSources from '../data/contract-sources.json';
import deploymentIndex from '../data/deployments.json';

const FIXTURE = '__ArityGuardFixture';

afterEach(() => {
  delete sources[FIXTURE];
});

function installFixture(candidates) {
  sources[FIXTURE] = {
    repo: 'fixture',
    githubUrl: 'https://github.com/example/fixture',
    path: 'src/Fixture.sol',
    startLine: 1,
    endLine: 99,
    functionsByName: { deployPool: candidates },
  };
}

describe('getFunctionSource arity guard', () => {
  test('a lone candidate whose parameter count differs from the ABI entry resolves to null', () => {
    // Historical INV-133 shape: a newer one-argument `deployPool` body is the
    // only parsed source, while the selected deployed ABI still takes two words.
    installFixture([
      {
        name: 'deployPool',
        paramTypes: ['uint256'],
        startLine: 626,
        endLine: 660,
        source: 'function deployPool(uint256 projectId) external { }',
      },
    ]);

    const deployedAbiEntry = {
      type: 'function',
      name: 'deployPool',
      inputs: [
        { name: 'projectId', type: 'uint256', internalType: 'uint256' },
        { name: 'minCashOutReturn', type: 'uint256', internalType: 'uint256' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    };

    expect(getFunctionSource(FIXTURE, deployedAbiEntry)).toBe(null);
  });

  test('a lone candidate whose parameter count matches still resolves', () => {
    installFixture([
      {
        name: 'deployPool',
        paramTypes: ['uint256', 'uint256'],
        startLine: 821,
        endLine: 873,
        source: 'function deployPool(uint256 projectId, uint256 minCashOutReturn) external { }',
      },
    ]);

    const resolved = getFunctionSource(FIXTURE, {
      type: 'function',
      name: 'deployPool',
      inputs: [
        { name: 'projectId', type: 'uint256', internalType: 'uint256' },
        { name: 'minCashOutReturn', type: 'uint256', internalType: 'uint256' },
      ],
    });

    expect(resolved).not.toBe(null);
    expect(resolved.startLine).toBe(821);
  });

  test('overloads still resolve to the matching arity, and an unmatched arity to null', () => {
    installFixture([
      { name: 'deployPool', paramTypes: ['uint256'], startLine: 10, endLine: 20, source: 'a' },
      { name: 'deployPool', paramTypes: ['uint256', 'uint256'], startLine: 30, endLine: 40, source: 'b' },
    ]);

    const oneArg = getFunctionSource(FIXTURE, {
      name: 'deployPool',
      inputs: [{ type: 'uint256', internalType: 'uint256' }],
    });
    expect(oneArg.startLine).toBe(10);

    const twoArg = getFunctionSource(FIXTURE, {
      name: 'deployPool',
      inputs: [
        { type: 'uint256', internalType: 'uint256' },
        { type: 'uint256', internalType: 'uint256' },
      ],
    });
    expect(twoArg.startLine).toBe(30);

    const threeArg = getFunctionSource(FIXTURE, {
      name: 'deployPool',
      inputs: [
        { type: 'uint256', internalType: 'uint256' },
        { type: 'uint256', internalType: 'uint256' },
        { type: 'address', internalType: 'address' },
      ],
    });
    expect(threeArg).toBe(null);
  });
});

describe('contract-sources.json is pinned to the deployed refs', () => {
  // Mirrors `node build/extract-sources.js --verify`: every displayed body must
  // come from the package version the deployment artifact was built from, not
  // from whatever the monorepo working tree happens to be checked out at.
  const deployments = deploymentIndex.deployments;

  function deployedRef(contractName) {
    const refs = new Set();
    for (const [deploymentName, record] of Object.entries(deployments)) {
      if (deploymentName !== contractName
        && (record.contractName !== contractName || /_deprecated\d*$/.test(deploymentName))) continue;
      for (const chain of Object.values(record.chains || {})) {
        if (chain.gitCommit) refs.add(chain.gitCommit);
      }
    }
    return refs;
  }

  test('every entry records the deployment artifact source ref', () => {
    const names = Object.keys(contractSources);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const refs = deployedRef(name);
      expect(refs.size, `${name} has no single deployed source ref`).toBe(1);
      expect(contractSources[name].sourceRef, `${name} source pin`).toBe([...refs][0]);
    }
  });

  test('no entry is emitted for a contract with no deployment', () => {
    for (const name of Object.keys(contractSources)) {
      expect(deployedRef(name).size, `${name} is not deployed`).toBe(1);
    }
  });

  test('current, previous and v1 hook bodies retain their own deployed package refs', () => {
    for (const [name, version] of [['JBBuybackHook', '1.4.0'], ['JBBuybackHook_deprecated1', '1.1.1'], ['JBBuybackHook_deprecated', '1.0.0']]) {
      const ref = `npm:@bananapus/buyback-hook-v6@${version}`;
      expect([...deployedRef(name)]).toEqual([ref]);
      expect(contractSources[name].sourceRef).toBe(ref);
    }
  });

  test('the LP split hook body is the deployed two-argument deployPool', () => {
    const candidates = contractSources.JBUniswapV4LPSplitHook.functionsByName.deployPool;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].paramTypes).toEqual(['uint256', 'uint256']);
    expect(candidates[0].source).toContain('uint256 minCashOutReturn');
  });
});
