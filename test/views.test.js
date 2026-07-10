// View / formatter tests — the pure display logic that turns indexer + chain data into what users read.
// These render DOM <span>s (jsdom), so we assert textContent. Guards the money-display path (USD scaling,
// big-int grouping) and the small-but-easy-to-break bool/empty cases.
import { describe, it, expect } from 'vitest';
import { scaledUsdToNumber, volumeUsd, bigint, bool, amount, rawAmount, uri, svg } from '../src/bendystraw-format.js';

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

describe('indexed amount provenance', () => {
  it('does not invent ETH or 18 decimals when the row has no denomination', () => {
    expect(amount('1000000000000000000', {}).textContent).toContain('raw');
    expect(amount('1000000000000000000', {}).textContent).not.toContain('ETH');
    expect(rawAmount('1234567').textContent).toContain((1234567).toLocaleString());
  });
  it('recognizes currency 2 as USD, not USDC, and formats signed values', () => {
    expect(amount('1250000', { decimals: 6, currency: 2 }).textContent).toBe('1.25 USD');
    expect(amount('-1250000', { decimals: 6, currency: 2 }).textContent).toBe('-1.25 USD');
  });
});

describe('indexed link and SVG safety', () => {
  it('renders non-web URI schemes as inert text', () => {
    const node = uri('javascript:alert(1)');
    expect(node.tagName).toBe('SPAN');
    expect(node.closest('a')).toBeNull();
  });
  it('renders indexed SVG in an isolated image rather than injecting active nodes', () => {
    const node = svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="alert(2)"/></svg>');
    expect(node.querySelector('img')).not.toBeNull();
    expect(node.querySelector('script')).toBeNull();
    expect(node.querySelector('rect')).toBeNull();
  });
});
