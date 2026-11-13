// One toRemote ships one (source sucker, token) outbox. Two suckers or two tokens on the same chain pair are two
// groups, so Execute can never send the first row's outbox for another row.
import { describe, it, expect } from 'vitest';
import { groupQueuedMovements } from '../src/discover.js';

const row = (sucker, token, extra) => ({ chainId: 1, peerChainId: 8453, sourceSucker: sucker, token, ...extra });
describe('groupQueuedMovements', () => {
  it('keeps one group for one pair, sucker and token', () => {
    const groups = groupQueuedMovements([row('0xAA', '0xEE'), row('0xaa', '0xee')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });
  it('splits the same chain pair by sucker and by token', () => {
    const groups = groupQueuedMovements([row('0xaa', '0xee'), row('0xbb', '0xee'), row('0xaa', '0xcc')]);
    expect(groups).toHaveLength(3);
    groups.forEach(g => g.rows.forEach(r => {
      expect(r.sourceSucker).toBe(g.sample.sourceSucker);
      expect(r.token).toBe(g.sample.token);
    }));
  });
});
