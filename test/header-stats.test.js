// The project header's stat line: raised | balance | payments | owners or holders, as juicebox.money.
import { describe, it, expect } from 'vitest';
import { appendHeaderStats } from '../src/discover.js';

const line = (project) => {
  const host = document.createElement('div');
  appendHeaderStats(host, Object.assign({ id: '5', chainId: 1, chains: [{ id: 1, name: 'Ethereum' }], idByChain: { 1: 5 } }, project));
  return host.textContent.replace(/\s+/g, ' ');
};

describe('project header stats', () => {
  it('leads with what was raised when the index prices it, and counts payments and holders', () => {
    const text = line({ indexedStats: { volumeUsd: '12345000000000000000000', paymentsCount: 3 } });
    expect(text).toMatch(/^\$12[.,]?3\d*k? raised\|/i);
    expect(text).toMatch(/raised\|.* balance\|3 payments\|.* holders$/);
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
