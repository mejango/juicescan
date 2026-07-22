import { describe, expect, it } from 'vitest';
import {
  ammPriceFromSqrtPriceX96,
  formatPrice,
} from '../src/discover.js';

describe('Uniswap V4 AMM price history', () => {
  it('converts ART pool sqrt prices into USDC per ART', () => {
    const initial = ammPriceFromSqrtPriceX96(
      0x2af49f5c8594347614n,
      true,
      6,
    );
    const afterTrade = ammPriceFromSqrtPriceX96(
      800571923982999312419n,
      true,
      6,
    );

    expect(initial).toBeCloseTo(0.0001000274, 10);
    expect(afterTrade).toBeCloseTo(0.0001021037, 10);
    expect(afterTrade).toBeGreaterThan(initial);
  });

  it('shows enough precision to distinguish the ART move', () => {
    expect(formatPrice(0.0001000274)).not.toBe(formatPrice(0.0001021037));
  });
});
