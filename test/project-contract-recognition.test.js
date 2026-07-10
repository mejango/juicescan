import { describe, expect, test } from 'vitest';
import { getAddress } from '../src/abi-registry.js';
import { recognizeProjectContract } from '../src/discover.js';

describe('project contract recognition', () => {
  test('recognizes only exact known deployment addresses', () => {
    const controller = getAddress('JBController', 1);
    expect(recognizeProjectContract(controller, 1)).toMatchObject({ known: true, name: expect.any(String) });
    expect(recognizeProjectContract('0x000000000000000000000000000000000000dEaD', 1)).toMatchObject({ known: false, name: null });
  });

  test('zero address is not reported as an unknown contract', () => {
    expect(recognizeProjectContract('0x0000000000000000000000000000000000000000', 1)).toMatchObject({ known: true, name: null });
  });
});
