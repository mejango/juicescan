import { describe, expect, it } from 'vitest';
import { keepShownActivityRows, mergeActivityPages } from '../src/discover.js';

const ev = (id, timestamp) => ({ id, timestamp, chainId: 1, type: 'pay' });

describe('merging paged activity queries', () => {
  it('keeps every row, newest first and deduplicated, when no query was capped', () => {
    const page = mergeActivityPages([
      { items: [ev('a', 30), ev('b', 10)], capped: false },
      { items: [ev('a', 30), ev('c', 20)], capped: false },
    ]);
    expect(page.edge).toBe(0);
    expect(page.events.map(e => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('stops at the newest edge of a capped query so no gap shows below it', () => {
    const page = mergeActivityPages([
      { items: [ev('a', 50), ev('b', 40)], capped: true },
      { items: [ev('c', 45), ev('d', 20), ev('e', 5)], capped: true },
      { items: [ev('f', 30)], capped: false },
    ]);
    expect(page.edge).toBe(40);
    // The edge's own timestamp waits for the next page: its transaction may be cut in half.
    expect(page.events.map(e => e.id)).toEqual(['a', 'c']);
  });

  it('keeps rows already shown when a new event slides the window', () => {
    const fresh = Object.assign([ev('new', 60), ev('a', 50)], { more: true, edge: 45 });
    const kept = keepShownActivityRows(fresh, [ev('a', 50), ev('c', 45), ev('d', 41)]);
    expect(kept.map(e => e.id)).toEqual(['new', 'a', 'c', 'd']);
    expect(kept.more).toBe(true);
  });
});
