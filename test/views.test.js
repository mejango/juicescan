// View / formatter tests — the pure display logic that turns indexer + chain data into what users read.
// These render DOM <span>s (jsdom), so we assert textContent. Guards the money-display path (USD scaling,
// big-int grouping) and the small-but-easy-to-break bool/empty cases.
import { describe, it, expect } from 'vitest';
import { scaledUsdToNumber, volumeUsd, bigint, bool } from '../src/bendystraw-format.js';

describe('volumeUsd — 18-dec-scaled USD → compact $ string', () => {
  it('converts 18-dec-scaled USD to a number without floating-point bigint loss', () => {
    expect(scaledUsdToNumber('2500000000000000000000000')).toBe(2500000);
    expect(scaledUsdToNumber('500000000000000000')).toBe(0.5);
    expect(scaledUsdToNumber('0')).toBe(0);
    expect(scaledUsdToNumber('')).toBeNull();
  });
  it('renders — for empty/zero', () => {
    expect(volumeUsd('0').textContent).toBe('—');
    expect(volumeUsd(null).textContent).toBe('—');
    expect(volumeUsd('').textContent).toBe('—');
  });
  it('dollars: 5e18 → $5.00', () => {
    expect(volumeUsd('5000000000000000000').textContent).toBe('$5.00');
  });
  it('thousands: 1e21 → $1.00k', () => {
    expect(volumeUsd('1000000000000000000000').textContent).toBe('$1.00k');
  });
  it('millions: 2.5e24 → $2.50M', () => {
    expect(volumeUsd('2500000000000000000000000').textContent).toBe('$2.50M');
  });
  it('sub-dollar uses 4 decimals', () => {
    expect(volumeUsd('500000000000000000').textContent).toBe('$0.5000');
  });
});

describe('bigint — grouped integer', () => {
  it('groups thousands', () => {
    expect(bigint('1000000').textContent).toBe((1000000).toLocaleString());
  });
  it('— for empty', () => {
    expect(bigint('').textContent).toBe('—');
  });
});

describe('bool — yes / no / —', () => {
  it('maps true/false/unknown', () => {
    expect(bool(true).textContent).toBe('yes');
    expect(bool(false).textContent).toBe('no');
    expect(bool(null).textContent).toBe('—');
  });
});
