// surplus-token label (multi-token aware) + token/item cash-out mutual-exclusivity predicates.
import { describe, it, expect } from 'vitest';
import { __test } from '../src/create-flow.js';
const { initState, surplusTokenLabel, itemCashOutOn, anyTokenCashOut } = __test;
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
function base(over = {}) { const s = initState(); s.projectType = 'custom'; s.network = 'mainnet'; s.chainIds = [1]; return Object.assign(s, over); }

describe('surplusTokenLabel — honors multi-token accounting', () => {
  it('ETH only → "ETH"', () => { expect(surplusTokenLabel(base({ accepts: ['eth'] }))).toBe('ETH'); });
  it('USDC only → "USDC"', () => { expect(surplusTokenLabel(base({ accepts: ['usdc'] }))).toBe('USDC'); });
  it('ETH + USDC → "ETH and USDC"', () => { expect(surplusTokenLabel(base({ accepts: ['eth', 'usdc'] }))).toBe('ETH and USDC'); });
  it('custom token → its symbol', () => {
    const s = base({ accepts: ['custom'] });
    s.customToken = { address: DAI, symbol: 'DAI', decimals: 18, status: 'ok' };
    expect(surplusTokenLabel(s)).toBe('DAI');
  });
});

describe('token vs item cash-out mutual-exclusivity predicates', () => {
  it('itemCashOutOn requires shop + opt-in', () => {
    const s = base(); s.collection.useForRedemptions = true;
    expect(itemCashOutOn(s)).toBe(false); // shop off
    s.shopEnabled = true;
    expect(itemCashOutOn(s)).toBe(true);
  });
  it('anyTokenCashOut reflects any stage', () => {
    const s = base();
    expect(anyTokenCashOut(s)).toBe(false);
    s.stages[0].cashOutEnabled = true;
    expect(anyTokenCashOut(s)).toBe(true);
  });
});
