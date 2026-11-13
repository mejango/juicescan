import { describe, it, expect, afterEach, vi } from 'vitest';
import { bendystrawBatcher } from '../src/discover.js';
import { bendystrawQuery } from '../src/bendystraw-client.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Bendystraw request volume', () => {
  it('turns rows asked for together into one list query, 50 at a time', async () => {
    const loadRows = vi.fn(async (args) => Object.fromEntries(args.map((arg) => [arg, 'row ' + arg])));
    const load = bendystrawBatcher(loadRows);
    const keys = Array.from({ length: 71 }, (_, index) => 'p' + index);
    const rows = await Promise.all(keys.map((key) => load(key, key)));
    expect(loadRows).toHaveBeenCalledTimes(2);
    expect(loadRows.mock.calls.map((call) => call[0].length)).toEqual([50, 21]);
    expect(rows[0]).toBe('row p0');
    expect(rows[70]).toBe('row p70');
  });

  it('resolves a row the indexer did not return as null and passes a failure to every caller', async () => {
    const load = bendystrawBatcher(async () => ({}));
    expect(await load('missing', 'missing')).toBe(null);
    const failing = bendystrawBatcher(async () => { throw new Error('down'); });
    await expect(Promise.all([failing('a', 'a'), failing('b', 'b')])).rejects.toThrow('down');
  });

  it('waits for Retry-After before asking a rate-limited indexer again', async () => {
    vi.useFakeTimers();
    const ok = { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: async () => '{"data":{"ok":true}}' };
    const limited = { ok: false, status: 429, statusText: 'Too Many Requests', headers: new Headers({ 'retry-after': '30' }), body: null };
    const fetchMock = vi.fn().mockResolvedValueOnce(limited).mockResolvedValue(ok);
    vi.stubGlobal('fetch', fetchMock);
    const result = bendystrawQuery('{ ok }');
    await vi.advanceTimersByTimeAsync(29000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
