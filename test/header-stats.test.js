// The project header's stat line: raised | balance | payments | owners or holders, as juicebox.money.
import { describe, it, expect } from 'vitest';
import { appendHeaderStats, raisedByChainRows } from '../src/discover.js';

const line = (project) => {
  const host = document.createElement('div');
  appendHeaderStats(host, Object.assign({ id: '5', chainId: 1, chains: [{ id: 1, name: 'Ethereum' }], idByChain: { 1: 5 } }, project));
  return host.textContent.replace(/\s+/g, ' ');
};

describe('project header stats', () => {
  it('leads with what was raised when the index prices it, and counts payments and holders', () => {
    const text = line({ indexedStats: { volumeUsd: '12345000000000000000000', paymentsCount: 3 } });
    expect(text.startsWith('$12,345.00 raised|')).toBe(true);
    expect(text).toMatch(/raised\|.* balance\|3 payments\|.* holders$/);
  });
  it('breaks raised down by chain on hover, in the project\'s chain order, skipping chains that raised nothing', () => {
    const byChain = [
      { chainId: 8453, volume: '2000000000000000000', volumeUsd: '6000000000000000000000', tokenSymbol: 'ETH', decimals: 18 },
      { chainId: 10, volume: '0', volumeUsd: '0', tokenSymbol: 'ETH', decimals: 18 },
      { chainId: 1, volumeUsd: '6345000000000000000000' },
    ];
    const rows = raisedByChainRows(byChain, [1, 8453, 10]);
    expect(rows.map((row) => row.name)).toEqual(['Ethereum', 'Base']);
    expect(rows[0].text).toBe('$6,345.00');
    // Dollars only: a chain's token volume can mix tokens.
    expect(rows[1].text).toBe('$6,000.00');
    expect(raisedByChainRows(undefined, [1])).toEqual([]);
    const host = document.createElement('div');
    appendHeaderStats(host, { id: '5', chainId: 1, chains: [{ id: 1 }, { id: 8453 }], idByChain: { 1: 5 },
      indexedStats: { volumeUsd: '12345000000000000000000', paymentsCount: 3, byChain } });
    const pop = host.querySelector('.usd-balance--has-pop .usd-balance-pop');
    expect(pop.textContent).toContain('All chains$12,345.00');
    expect(pop.querySelectorAll('.usd-balance-pop-row').length).toBe(3);
  });
  it('leaves raised out when the index has no priced volume', () => {
    const text = line({ indexedStats: { volumeUsd: '0', paymentsCount: 1 } });
    expect(text).not.toContain('raised');
    expect(text).toMatch(/ balance\|1 payment\|.* holders$/);
  });
  it('calls a revnet\'s holders owners and shows its payments too', () => {
    expect(line({ isRevnet: true, indexedStats: { volumeUsd: '0', paymentsCount: 2 } })).toMatch(/ balance\|2 payments\|.* owners$/);
    expect(line({ isRevnet: true })).toMatch(/ balance\|.* owners$/);
  });
});
