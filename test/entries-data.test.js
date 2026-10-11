import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEntriesPage, validateEntriesPage } from '../src/entries-data.js';
const address = '0x' + '11'.repeat(20), hash = '0x' + 'ab'.repeat(32);
const context = { chainId: 8453, projectId: 27n, hook: address };
function page() {
  const ranges = [
    { tierId: 1, label: 'Below', lower: null, upper: -1 },
    { tierId: 2, label: '<img onerror=alert(1)>', lower: -1, upper: 1 },
    { tierId: 3, label: 'Above', lower: 1, upper: null },
  ];
  return { schema: 'metalog.entries.v1', chainId: 8453, projectId: '27', blockNumber: '100', snapshotBlockHash: hash, hook: address, ranges,
    entries: [{ status: 'verified-curve', transactionHash: hash, blockNumber: '99', timestamp: 1234, account: address, beneficiary: address,
      stakeWei: '1000000000000', tokenIds: ['2000000001'], quantities: [0, 1, 0], coefficients: [0, 1],
      chart: { low: -1, high: 1, peak: 0.5, visibleMass: 1, buckets: [{ lower: -1, upper: 0, density: 0.5, mass: 0.5 }, { lower: 0, upper: 1, density: 0.5, mass: 0.5 }],
        positions: ranges.map((range, index) => ({ range, quantity: index === 1 ? 1 : 0, share: index === 1 ? 1 : 0, density: index === 1 ? 0.5 : null })) } }],
    scannedFromBlock: '90', scannedToBlock: '100', complete: false, nextCursor: '89:2147483647' };
}
function response(payload = page()) { return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }); }
afterEach(() => vi.unstubAllGlobals());
describe('Metalog entry evidence trust boundary', () => {
  it('preserves the exact API payload and labels as inert text, without decoding or chart reconstruction', () => {
    const value = page(); expect(validateEntriesPage(value, context)).toBe(value);
    expect(value.entries[0].chart.buckets).toHaveLength(2);
  });
  it.each(['verified-manual', 'unrecognized', 'unsupported', 'invalid'])('accepts explicit %s status without guessing a curve', status => {
    const value = page(), entry = value.entries[0]; entry.status = status;
    if (status !== 'verified-manual') { entry.coefficients = null; entry.chart = null; entry.stakeWei = null; entry.beneficiary = null; entry.reason = 'Not attributable'; }
    expect(validateEntriesPage(value, context)).toBe(value);
  });
  it.each([
    value => { value.schema = 'other.v1'; }, value => { value.chainId = 1; }, value => { value.projectId = '28'; }, value => { value.hook = '0x' + '22'.repeat(20); },
    value => { value.snapshotBlockHash = 'no hash'; }, value => { value.blockNumber = '1e4'; }, value => { value.blockNumber = (2n ** 256n).toString(); },
    value => { value.entries[0].timestamp = 8640000000001; }, value => { value.entries[0].quantities = [0, 0, 0]; },
    value => { value.entries[0].account = 'javascript:alert(1)'; }, value => { value.entries[0].timestamp = Infinity; },
    value => { value.entries[0].coefficients[1] = NaN; }, value => { value.entries[0].quantities[1] = -1; },
    value => { value.entries[0].tokenIds = ['1', '1']; }, value => { value.entries[0].stakeWei = '-1'; }, value => { value.entries[0].blockNumber = '101'; },
    value => { value.entries[0].chart.buckets[0].upper = -2; }, value => { value.entries[0].chart.buckets[1].lower = 0.1; },
    value => { value.entries[0].chart.positions[1].range = { ...value.ranges[1], tierId: 6 }; }, value => { value.entries[0].chart.positions[1].quantity = 2; },
    value => { value.entries[0].chart.positions[0].density = 0; }, value => { value.entries[0].chart.peak = -1; },
    value => { value.entries[0].status = 'unrecognized'; }, value => { value.entries[0].chart = null; },
    value => { value.ranges[1].lower = -0.5; }, value => { value.ranges[2].tierId = 2; },
    value => { value.entries.push(...Array(8).fill(value.entries[0])); }, value => { value.entries[0].chart.buckets = Array(1025).fill(value.entries[0].chart.buckets[0]); },
    value => { value.entries[0].tokenIds = Array(2001).fill('1'); }, value => { value.entries[0].reason = 'x'.repeat(1025); },
    value => { value.complete = true; }, value => { value.nextCursor = '101:0'; }, value => { value.scannedFromBlock = '101'; },
  ])('rejects malformed or mismatched evidence %#', change => {
    const value = page(); change(value); expect(() => validateEntriesPage(value, context)).toThrow('invalid entry evidence');
  });
  it.each(['verified-curve', 'verified-manual'])('requires attributable bounded receipts for %s', status => {
    for (const change of [e => { e.stakeWei = null; }, e => { e.beneficiary = null; }, e => { e.tokenIds = []; e.quantities = [0,0,0]; }, e => { e.tokenIds = Array.from({length:201}, (_,i) => String(i+1)); e.quantities = [0,201,0]; e.chart = null; e.chartError = 'Precision unavailable'; }]) {
      const value=page();value.entries[0].status=status;change(value.entries[0]);
      expect(() => validateEntriesPage(value,context)).toThrow('invalid entry evidence');
    }
  });
  it.each(['verified-curve', 'verified-manual'])('preserves verified %s receipts and coefficients when chart precision is unavailable', status => {
    const value = page(), entry = value.entries[0]; entry.status = status; entry.chart = null;
    entry.chartError = 'This range layout cannot be drawn at chart precision. See the exact counts and receipt.';
    expect(validateEntriesPage(value, context)).toBe(value);
    expect(entry.coefficients).toEqual([0, 1]); expect(entry.tokenIds).toEqual(['2000000001']);
    expect(entry.quantities).toEqual([0, 1, 0]); expect(entry.transactionHash).toBe(hash);
  });
  it('rejects malformed chart limitation messages', () => {
    for (const chartError of ['', null, 42, 'x'.repeat(1025)]) {
      const value = page(); Object.assign(value.entries[0], { chart: null, chartError });
      expect(() => validateEntriesPage(value, context)).toThrow('invalid entry evidence');
    }
  });
  it('pins the snapshot hash when a caller supplies the original page identity', () => {
    expect(() => validateEntriesPage(page(), { ...context, snapshotBlockHash: '0x' + 'cd'.repeat(32) })).toThrow('invalid entry evidence');
    expect(validateEntriesPage(page(), { ...context, snapshotBlockHash: hash })).toBeTruthy();
  });
  it('accepts a completed empty history without fabricating scanned blocks', () => {
    const value = page(); Object.assign(value, { entries: [], scannedFromBlock: null, scannedToBlock: null, complete: true, nextCursor: null });
    expect(validateEntriesPage(value, context)).toBe(value);
  });
});
describe('bounded read-only API fetch', () => {
  it('uses the sole public API and carries the original snapshot and cursor on continuation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response()); vi.stubGlobal('fetch', fetch);
    const first = await fetchEntriesPage(context);
    await fetchEntriesPage({ ...context, snapshotBlockHash: first.snapshotBlockHash }, { blockNumber: first.blockNumber, cursor: first.nextCursor });
    expect(String(fetch.mock.calls[0][0])).toBe('https://metalog.money/api/markets/8453/27/entries');
    expect(String(fetch.mock.calls[1][0])).toBe('https://metalog.money/api/markets/8453/27/entries?blockNumber=100&cursor=89%3A2147483647');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
  });
  it('rejects a continuation that changes the original block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await expect(fetchEntriesPage(context, { blockNumber: '101', cursor: '89:0' })).rejects.toThrow('invalid entry evidence');
  });
  it.each([{ cursor: '89:0' }, { cursor: 'data:foo', blockNumber: '100' }, { blockNumber: '-1' }])('rejects invalid pagination before any network read %j', async options => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(fetchEntriesPage(context, options)).rejects.toThrow('invalid entry evidence'); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([400, 403, 404, 429, 503])('surfaces safe HTTP %s errors without exposing the response body', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret <script>', { status })));
    await expect(fetchEntriesPage(context)).rejects.toThrow(status === 429 ? 'busy' : 'unavailable');
  });
  it('rejects declared oversize before reading the body', async () => {
    const cancel = vi.fn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': String(2 * 1024 * 1024 + 1) }), body: { cancel } }));
    await expect(fetchEntriesPage(context)).rejects.toThrow('size limit'); expect(cancel).toHaveBeenCalledOnce();
  });
  it('stops an undeclared oversized streaming body at the limit', async () => {
    const cancel = vi.fn(), releaseLock = vi.fn(), read = vi.fn().mockResolvedValue({ done: false, value: new Uint8Array(1024 * 1024) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), body: { getReader: () => ({ read, cancel, releaseLock }) } }));
    await expect(fetchEntriesPage(context)).rejects.toThrow('size limit'); expect(read).toHaveBeenCalledTimes(3); expect(cancel).toHaveBeenCalledOnce(); expect(releaseLock).toHaveBeenCalledOnce();
  });
  it.each([new Response('<html>', { headers: { 'Content-Type': 'text/html' } }), new Response('data:application/json,{}', { headers: { 'Content-Type': 'application/json' } })])('does not decode HTML, data URLs, or guessed schemas', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(value)); await expect(fetchEntriesPage(context)).rejects.toThrow('invalid entry evidence');
  });
  it('does not leak network diagnostics or retry another endpoint', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('private transport detail')); vi.stubGlobal('fetch', fetch);
    await expect(fetchEntriesPage(context)).rejects.toThrow('Metalog entry history is unavailable'); expect(fetch).toHaveBeenCalledOnce();
  });
  it('sanitizes streamed transport errors and failing error-body cancellation', async () => {
    const releaseLock = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), body: { getReader: () => ({ read: () => Promise.reject(new Error('secret stream details')), releaseLock }) } })
      .mockResolvedValueOnce({ ok: false, status: 503, body: { cancel: () => Promise.reject(new Error('secret cancel details')) } }));
    await expect(fetchEntriesPage(context)).rejects.toThrow('invalid entry evidence');
    expect(releaseLock).toHaveBeenCalledOnce();
    await expect(fetchEntriesPage(context)).rejects.toThrow('entry history is unavailable');
  });
  it('preserves explicit caller cancellation', async () => {
    const controller = new AbortController(), error = new DOMException('Aborted', 'AbortError'); controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(fetchEntriesPage(context, { signal: controller.signal })).rejects.toBe(error);
  });
});
