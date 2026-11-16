// @vitest-environment jsdom
// The shared background refresh for project cards: every 30 s while shown, nothing while hidden or off the page,
// back at once when shown again, and slower after a failure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { livePoll } from '../src/live-poll.js';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
function card() { const node = document.createElement('div'); document.body.appendChild(node); return node; }

describe('livePoll', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); });

  it('ticks every 30 s and never overlaps a slow tick', async () => {
    let finish;
    const tick = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    livePoll(card(), tick);
    await vi.advanceTimersByTimeAsync(29999);
    expect(tick).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120000);
    expect(tick).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(30000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('doubles the wait after each failed tick, up to the cap, and restores it on success', async () => {
    const results = [false, 'throw', false, false, false, true, true];
    const times = [];
    const start = Date.now();
    const tick = vi.fn(async () => {
      times.push(Date.now() - start);
      const result = results.shift();
      if (result === 'throw') throw new Error('indexer down');
      return result;
    });
    livePoll(card(), tick);
    await vi.advanceTimersByTimeAsync(20 * 60000);
    const gaps = times.slice(1, 8).map((time, index) => time - times[index]);
    expect(gaps).toEqual([60000, 120000, 240000, 240000, 240000, 30000, 30000]);
  });

  it('does nothing while the page is hidden and ticks at once when it is visible again, if one is overdue', async () => {
    const tick = vi.fn(async () => {});
    livePoll(card(), tick);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(tick).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(0);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('stops while its tab is off the page and resumes when the tab is shown again', async () => {
    const tick = vi.fn(async () => {});
    const node = card();
    livePoll(node, tick);
    await vi.advanceTimersByTimeAsync(30000);
    expect(tick).toHaveBeenCalledTimes(1);

    node.remove();
    await vi.advanceTimersByTimeAsync(5 * 60000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    document.body.appendChild(node);
    document.dispatchEvent(new CustomEvent('jb:tab-shown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);

    // Shown again before the next tick is due: it waits out the rest of the interval.
    node.remove();
    document.body.appendChild(node);
    document.dispatchEvent(new CustomEvent('jb:tab-shown'));
    await vi.advanceTimersByTimeAsync(29000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
