// The ruleset detail names a known rule-change deadline by its length; only an unknown contract shows as an address.
import { describe, it, expect } from 'vitest';
import { ruleChangeDeadlineText } from '../src/discover.js';
import { getAddress } from '../src/component-base.js';

describe('rule change deadline in the ruleset detail', () => {
  it('names each deadline contract on the chain it is read on', () => {
    expect(ruleChangeDeadlineText(getAddress('JBDeadline3Days', 8453), 8453)).toBe('3 days');
    expect(ruleChangeDeadlineText(getAddress('JBDeadline3Hours', 1).toUpperCase().replace('0X', '0x'), 1)).toBe('3 hours');
  });
  it('says there is none for the zero address or nothing', () => {
    expect(ruleChangeDeadlineText('0x0000000000000000000000000000000000000000', 1)).toBe('No deadline');
    expect(ruleChangeDeadlineText(undefined, 1)).toBe('No deadline');
  });
  it('shows an unknown contract as its address', () => {
    expect(ruleChangeDeadlineText('0x00000000000000000000000000000000000000A1', 1)).toMatch(/^0x0000.*00A1$/i);
  });
});
