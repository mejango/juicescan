// @vitest-environment jsdom
// The held-writes list asks the chain every 30 s while the page is visible. A hold whose hash the node does not
// know is re-read for ten minutes, then only by its Check button, which reads again before offering a release.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ account: '0x1111111111111111111111111111111111111111', view: null, read: null, offer: null }));
vi.mock('../src/wallet.js', () => ({ getAccount: () => h.account, onWalletChange: () => {} }));
vi.mock('../src/component-base.js', () => ({
  heldWriteView: (...args) => h.read(...args), offerHeldRelease: (...args) => h.offer(...args), errMessage: (error, fallback) => fallback,
}));

import { mountHeldWrites } from '../src/held-writes.js';
import { writeHold } from '../src/write-hold.js';

const TERMINAL = '0x3333333333333333333333333333333333333333';
function setVisibility(state) { Object.defineProperty(document, 'visibilityState', { value: state, configurable: true }); }

describe('held-writes polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); document.body.innerHTML = '';
    const hold = writeHold(8453, h.account, { to: TERMINAL, functionName: 'pay' });
    const record = hold.submitted(hold.reserve(), '0xabc');
    h.view = { record, state: 'unsettled', line: 'Your earlier pay is not found onchain.' };
    h.read = vi.fn(async () => h.view);
    h.offer = vi.fn();
    setVisibility('visible');
  });
  afterEach(() => { vi.useRealTimers(); setVisibility('visible'); });

  it('reads every 30 s, not while hidden, and stops re-reading an unsettled hold after ten minutes', async () => {
    mountHeldWrites();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29000);
    expect(h.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.read).toHaveBeenCalledTimes(2);

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(11 * 60000);
    const settledDown = h.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(h.read).toHaveBeenCalledTimes(settledDown);
    expect(document.querySelector('.held-writes-action').textContent).toBe('Check');
  });

  it('Check reads the hold again and offers a release only if it is still unsettled', async () => {
    mountHeldWrites();
    await vi.advanceTimersByTimeAsync(11 * 60000 + 30000);
    const before = h.read.mock.calls.length;
    document.querySelector('.held-writes-action').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.read).toHaveBeenCalledTimes(before + 1);
    expect(h.offer).toHaveBeenCalledTimes(1);

    h.view = { record: h.view.record, state: 'success', line: 'Your earlier pay went through.', receipt: { status: 'success' } };
    document.querySelector('.held-writes-action').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.offer).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.held-writes-action').textContent).toBe('Dismiss');
  });
});
