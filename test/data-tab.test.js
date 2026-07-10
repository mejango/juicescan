import { describe, expect, it } from 'vitest';
import { coerce } from '../src/data-tab.js';

describe('Data tab variable coercion', () => {
  it('keeps bigint variables exact and rejects unsafe numeric variables', () => {
    expect(coerce('900719925474099312345', 'bigint')).toBe('900719925474099312345');
    expect(() => coerce('9007199254740993', 'int')).toThrow(/safe integer/i);
    expect(() => coerce('1,9007199254740993', 'chain_multi')).toThrow(/safe integer/i);
  });

  it('normalizes valid addresses and rejects malformed ones', () => {
    expect(coerce('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'address')).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(() => coerce('0x1234', 'address')).toThrow(/valid 0x address/i);
  });
});
