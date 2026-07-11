import { describe, expect, test } from 'vitest';
import { getAddress } from '../src/abi-registry.js';
import { knownInstanceFamilyForDeployer, matchesKnown721HookClone, recognizeProjectContract } from '../src/discover.js';

describe('project contract recognition', () => {
  test('recognizes only exact known deployment addresses', () => {
    const controller = getAddress('JBController', 1);
    expect(recognizeProjectContract(controller, 1)).toMatchObject({ known: true, name: expect.any(String) });
    expect(recognizeProjectContract('0x000000000000000000000000000000000000dEaD', 1)).toMatchObject({ known: false, name: null });
  });

  test('zero address is not reported as an unknown contract', () => {
    expect(recognizeProjectContract('0x0000000000000000000000000000000000000000', 1)).toMatchObject({ known: true, name: null });
  });

  test('classifies Address Registry provenance only for understood instance deployers', () => {
    const hookDeployer = getAddress('JB721TiersHookDeployer', 84532);
    expect(knownInstanceFamilyForDeployer(hookDeployer, 84532)).toMatchObject({
      deployment: 'JB721TiersHookDeployer', family: 'JB721TiersHook',
    });
    expect(knownInstanceFamilyForDeployer(getAddress('JBController', 84532), 84532)).toBeNull();
  });

  test('checks the registered 721 instance identity against its canonical store, target, and project', () => {
    expect(matchesKnown721HookClone({
      store: getAddress('JB721TiersHookStore', 84532),
      metadataIdTarget: getAddress('JB721TiersHook', 84532),
      projectId: 9n,
    }, 84532, 9n)).toBe(true);
    expect(matchesKnown721HookClone({
      store: getAddress('JB721TiersHookStore', 84532),
      metadataIdTarget: getAddress('JB721TiersHook', 84532),
      projectId: 10n,
    }, 84532, 9n)).toBe(false);
  });
});
