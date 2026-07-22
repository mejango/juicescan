import { describe, expect, it } from 'vitest';
import {
  ammPriceFromSqrtPriceX96,
  formatPrice,
} from '../src/discover.js';
import { componentReproPrompt } from '../src/component-base.js';

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

  it('copies the complete Bendystraw V4 history contract into the chart build prompt', () => {
    const prompt = componentReproPrompt(
      'Issuance, cash out, and AMM price history',
      'price-history',
    );

    expect(prompt).toContain('buybackPoolEvents');
    expect(prompt).toContain('swapEvents');
    expect(prompt).toContain('version: 6');
    expect(prompt).toContain('initialSqrtPriceX96');
    expect(prompt).toContain('sqrtPriceX96');
    expect(prompt).toContain('projectTokenIsCurrency0');
    expect(prompt).toContain('exact POST-TRADE Uniswap V4 spot');
    expect(prompt).toContain('10^(18-terminalDecimals)');
    expect(prompt).toContain('realized average-price fallback, NOT an exact spot');
    expect(prompt).toContain('retry the legacy swap selection');
    expect(prompt).toContain("Ignore direction='mint'");
  });
});
