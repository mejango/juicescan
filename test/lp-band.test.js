// A position's band on the display axis.
import { describe, it, expect } from 'vitest';
import { lpBandPricesOf } from '../src/discover.js';

const pos = { pair: { decimals: 18, symbol: 'ETH' }, pairIsC0: true, tickLower: -60, tickUpper: 60 };

describe('LP band prices', () => {
  it('orders the band min below max whichever currency sorts first', () => {
    // pairIsC0 flips the axis: the lower tick is the HIGHER display price.
    const band = lpBandPricesOf(pos);
    expect(band.min).toBeLessThan(band.max);
    expect(band.min).toBeCloseTo(1.0001 ** -60, 6);
    expect(band.max).toBeCloseTo(1.0001 ** 60, 6);
  });
});
