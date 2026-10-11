import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../src/entries-data.js', () => ({ fetchEntriesPage: api.read }));
import { renderEntries } from '../src/entries-view.js';
const hook = '0x' + '11'.repeat(20), hash = '0x' + 'ab'.repeat(32);
const context = { chainId: 8453, projectId: '27', hook };
function page() {
  const ranges = [{ tierId: 1, label: '<script>bad()</script>', lower: null, upper: 0 }, { tierId: 2, label: 'Above', lower: 0, upper: null }];
  return { schema: 'metalog.entries.v1', chainId: 8453, projectId: '27', hook, blockNumber: '100', snapshotBlockHash: hash, ranges, scannedFromBlock: '90', scannedToBlock: '100', complete: false, nextCursor: '89:0', entries: [{ status: 'verified-manual', transactionHash: hash, blockNumber: '99', timestamp: 1234, account: hook, beneficiary: hook, stakeWei: '1', quantities: [1, 0], tokenIds: ['1'], coefficients: [0, 1], reason: 'Manual allocation', chart: { low: -1, high: 1, peak: 0.5, buckets: [{ lower: -1, upper: 0, density: 0.5 }, { lower: 0, upper: 1, density: 0.5 }], positions: ranges.map((range, i) => ({ range, quantity: i ? 0 : 1, share: i ? 0 : 1, density: null })) } }] };
}
const options = { receiptUrl: h => 'https://basescan.org/tx/' + h };
afterEach(() => { document.body.replaceChildren(); api.read.mockReset(); });
it('renders API evidence as inert text and distinguishes manual reference from verified curves', async () => {
  api.read.mockResolvedValue(page()); document.body.appendChild(renderEntries(context, options));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Verified manual allocation'));
  expect(document.body.textContent).toContain('reference curve');
  expect(document.querySelectorAll('script')).toHaveLength(0);
  expect(document.body.textContent).toContain('<script>bad()</script>');
  expect(document.querySelector('svg').getAttribute('role')).toBe('img');
  expect(document.querySelector('a').href).toBe('https://basescan.org/tx/' + hash);
  expect(document.body.textContent).toContain('1970-01-01T00:20:34.000Z');
  expect(document.body.textContent).not.toContain('·');
  expect(document.body.textContent).toContain('block 99');
  expect(document.body.textContent).toContain('History is incomplete');
});
it('preserves snapshot on continuation and explicitly exposes failure/retry without discarding earlier evidence', async () => {
  api.read.mockResolvedValueOnce(page()).mockRejectedValueOnce(new Error('HTTP 429')).mockResolvedValueOnce({ ...page(), complete: true, nextCursor: null, entries: [] });
  document.body.appendChild(renderEntries(context, options));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Snapshot block 100'));
  [...document.querySelectorAll('button')].find(b => b.textContent === 'Load earlier entries').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Entries unavailable: HTTP 429'));
  expect(api.read.mock.calls[1][1]).toMatchObject({ cursor: '89:0', blockNumber: '100' });
  expect(document.querySelectorAll('.native-entry-card')).toHaveLength(1);
  [...document.querySelectorAll('button')].find(b => b.textContent === 'Retry').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('History scan complete'));
});
it('retains verified quantities, coefficients and receipt when chart precision is unavailable', async () => {
  const value = page(); value.entries[0].chart = null; value.entries[0].chartError = 'Range precision unavailable'; api.read.mockResolvedValue(value);
  document.body.appendChild(renderEntries(context, options));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Chart unavailable: Range precision unavailable'));
  expect(document.querySelector('svg')).toBeNull(); expect(document.body.textContent).toContain('Coefficients: [0,1]'); expect(document.querySelector('a')).not.toBeNull();
});

it('labels partial receipt attribution and preserves very small chart densities', async () => {
  const value = page(), entry = value.entries[0]; entry.beneficiary = null; entry.stakeWei = null;
  entry.chart.peak = 1e-12; entry.chart.buckets.forEach(b => { b.density = 1e-12; }); api.read.mockResolvedValue(value);
  document.body.appendChild(renderEntries(context, options));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Stake unavailable'));
  expect(document.body.textContent).toContain('Multiple recipients');
  const path = document.querySelector('svg path'); expect(path.getAttribute('d')).not.toContain('NaN');
  expect(path.getAttribute('d')).toMatch(/^M[^,]+,12 L[^,]+,12$/);
});

it('preserves rejected snapshot evidence until explicit restart requests and accepts a fresh latest page', async () => {
  const first = page(), changed = {...page(), snapshotBlockHash: '0x'+'cd'.repeat(32), nextCursor:'88:0'}, latest={...page(),blockNumber:'200',snapshotBlockHash:'0x'+'cd'.repeat(32),complete:true,nextCursor:null};
  api.read.mockResolvedValueOnce(first).mockResolvedValueOnce(changed).mockResolvedValueOnce(latest);
  document.body.appendChild(renderEntries(context,options));
  await vi.waitFor(()=>expect(document.body.textContent).toContain('Snapshot block 100'));
  [...document.querySelectorAll('button')].find(b=>b.textContent==='Load earlier entries').click();
  await vi.waitFor(()=>expect(document.body.textContent).toContain('snapshot changed'));
  expect(document.querySelectorAll('.native-entry-card')).toHaveLength(1);
  expect(document.body.textContent).not.toContain('History scan complete');
  expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Retry').hidden).toBe(true);
  [...document.querySelectorAll('button')].find(b=>b.textContent==='Restart history').click();
  await vi.waitFor(()=>expect(document.body.textContent).toContain('Snapshot block 200'));
  expect(api.read.mock.calls[2][1]).toEqual({cursor:undefined,blockNumber:undefined});
  expect(document.querySelectorAll('.native-entry-card')).toHaveLength(1);
  expect(document.body.textContent).toContain('History scan complete');
});
