import { describe, expect, it } from 'vitest';
import { accountingTokenDisplayLabel } from '../src/discover.js';

const TOKEN = '0x1111111111111111111111111111111111111111';

describe('accounting-token display labels', () => {
  it('prefers a sanitized symbol, then the token name', () => {
    expect(accountingTokenDisplayLabel('  WIN\u0000  ', 'Winner Token', TOKEN)).toBe('WIN');
    expect(accountingTokenDisplayLabel('', 'Winner Token', TOKEN)).toBe('Winner Token');
  });

  it('retains a recognizable address fallback when metadata is unavailable', () => {
    const label = accountingTokenDisplayLabel('', '', TOKEN);
    expect(label).toContain('0x1111');
    expect(label.endsWith('1111')).toBe(true);
  });
});
