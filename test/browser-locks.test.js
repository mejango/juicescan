// Without Web Locks, browserLocks() still serializes each lock name and honors ifAvailable; it never refuses.
import { expect, it, vi } from 'vitest';

it('falls back to an exclusive in-tab lock per name when Web Locks and IndexedDB are missing', async () => {
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('indexedDB', undefined);
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const { browserLocks } = await import('../src/browser-locks.js');
  const locks = browserLocks();
  let release;
  const first = locks.request('a', { ifAvailable: true }, lock => new Promise(resolve => { release = () => resolve(lock); }));
  await Promise.resolve();
  expect(await locks.request('a', { ifAvailable: true }, lock => lock)).toBeNull();
  expect(await locks.request('b', lock => lock.name)).toBe('b');
  const order = [];
  const queued = locks.request('a', {}, () => order.push('queued'));
  order.push('released'); release();
  expect((await first).name).toBe('a');
  await queued;
  expect(order).toEqual(['released', 'queued']);
  browserLocks();
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0][0]).toMatch(/within this tab only/);
  vi.unstubAllGlobals();
});
