import { describe, it, expect } from 'vitest';
import { authorityRowsDiverged } from '../src/discover.js';

describe('authorityRowsDiverged', () => {
  it('detects per-chain operator or owner splits', () => {
    expect(authorityRowsDiverged([
      { chainId: 11155111, owner: '0x1111111111111111111111111111111111111111' },
      { chainId: 421614, owner: '0x1111111111111111111111111111111111111111' },
      { chainId: 11155420, owner: '0x2222222222222222222222222222222222222222' },
    ])).toBe(true);
  });

  it('treats uniform known rows as not diverged', () => {
    expect(authorityRowsDiverged([
      { chainId: 11155111, owner: '0x1111111111111111111111111111111111111111' },
      { chainId: 421614, owner: '0x1111111111111111111111111111111111111111' },
    ])).toBe(false);
  });

  it('ignores unknown rows when comparing known authorities', () => {
    expect(authorityRowsDiverged([
      { chainId: 11155111, owner: '0x1111111111111111111111111111111111111111' },
      { chainId: 421614, owner: null },
    ])).toBe(false);
  });
});
