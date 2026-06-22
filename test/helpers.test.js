// Cross-component money/address helpers: every pay/cashout/mint/burn/payout component routes amounts
// through parseAmount/formatAmount and recipients through addrOrZero/isAddr. A bug here mis-scales a
// transaction amount (wrong decimals) or mis-routes funds, so they get their own guard.
import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount } from '../src/encoding.js';
import { isAddr, addrOrZero, ZERO_ADDRESS } from '../src/component-base.js';
import { parseEther, parseUnits } from 'viem';

const GOOD = '0x1111111111111111111111111111111111111111';

describe('parseAmount / formatAmount — decimals-correct amount scaling', () => {
  it('18-dec parses like parseEther and round-trips', () => {
    expect(parseAmount('1.5', 18)).toBe(parseEther('1.5'));
    expect(formatAmount(parseAmount('1.5', 18), 18)).toBe('1.5');
  });
  it('6-dec (USDC) parses like parseUnits(…,6) — 1.5 → 1500000, not 1.5e18', () => {
    expect(parseAmount('1.5', 6)).toBe(parseUnits('1.5', 6));
    expect(parseAmount('1.5', 6)).toBe(1500000n);
    expect(formatAmount(1500000n, 6)).toBe('1.5');
  });
  it('round-trips an exact integer at 6 and 18 decimals', () => {
    for (const d of [6, 18]) expect(formatAmount(parseAmount('1000', d), d)).toBe('1000');
  });
});

describe('addrOrZero / isAddr — recipient safety coercion', () => {
  it('a valid address passes through', () => {
    expect(isAddr(GOOD)).toBe(true);
    expect(addrOrZero(GOOD)).toBe(GOOD);
  });
  it('blank / garbage / non-string coerces to the zero address (never garbage on-chain)', () => {
    for (const bad of ['', '0x', '0xnothex', 'vitalik.eth', null, undefined, 123]) {
      expect(isAddr(bad)).toBe(false);
      expect(addrOrZero(bad)).toBe(ZERO_ADDRESS);
    }
  });
  it('accepts a non-checksummed address (strict:false) so user paste isn’t rejected', () => {
    expect(isAddr(GOOD.toLowerCase())).toBe(true);
  });
});
