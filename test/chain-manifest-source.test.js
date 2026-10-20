import { expect, it } from 'vitest';
import manifest from '../data/manifest.json';
import { chains, meta } from '../src/abi-registry.js';
import { chainList, contractNameByAddress } from '../src/chain.js';

// chain.js reads the manifest's chains and contract addresses from the registry, so the registry must carry them
// exactly as the generated manifest has them.
it('the registry carries every manifest chain and contract identity', () => {
  expect(chains).toEqual(manifest.chains);
  for (const [name, contract] of Object.entries(manifest.contracts)) {
    expect(meta[name], name).toBeDefined();
    expect(meta[name].addresses, name).toEqual(contract.addresses);
    expect(meta[name].generation, name).toBe(contract.generation);
    expect(meta[name].contractName, name).toBe(contract.contractName);
  }
  expect(chainList().map(chain => String(chain.id)).sort()).toEqual(Object.keys(manifest.chains).sort());
  const terminal = manifest.contracts.JBMultiTerminal.addresses['1'];
  expect(contractNameByAddress(terminal)).toBe('JBMultiTerminal');
});
