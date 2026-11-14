// Under the pay amount: its dollar value, the wallet's balance and a shortfall, as on juicebox.money.
import { describe, it, expect } from 'vitest';
import { payAmountHint } from '../src/discover.js';

const base = { decimals: 18, symbol: 'ETH', chainName: 'Base' };

describe('pay amount hint', () => {
  it('shows the value, the balance and a shortfall', () => {
    expect(payAmountHint({ ...base, amountRaw: 2n * 10n ** 18n, usdPerToken: 3000, balance: 10n ** 18n })).toEqual({
      about: 'About $6,000.00', balance: 'Balance: 1', short: 'You don’t have enough ETH on Base.',
    });
  });

  it('claims no shortfall when the balance covers the amount or could not be read', () => {
    expect(payAmountHint({ ...base, amountRaw: 10n ** 18n, usdPerToken: 3000, balance: 10n ** 18n }).short).toBeNull();
    expect(payAmountHint({ ...base, amountRaw: 10n ** 18n, usdPerToken: 3000, balance: null })).toEqual({
      about: 'About $3,000.00', balance: null, short: null,
    });
  });

  it('leaves the value out with no price or no amount, and reads a 6-decimal token', () => {
    expect(payAmountHint({ ...base, amountRaw: 10n ** 18n, usdPerToken: null, balance: null }).about).toBeNull();
    expect(payAmountHint({ ...base, amountRaw: null, usdPerToken: 3000, balance: 0n })).toEqual({ about: null, balance: 'Balance: 0', short: null });
    expect(payAmountHint({ decimals: 6, symbol: 'USDC', chainName: 'Ethereum', amountRaw: 2_500_000n, usdPerToken: 1, balance: 1_000_000n })).toEqual({
      about: 'About $2.50', balance: 'Balance: 1', short: 'You don’t have enough USDC on Ethereum.',
    });
  });
});
