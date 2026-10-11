import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
const fixture = JSON.parse(readFileSync('test/fixtures/defifa-inventory.json', 'utf8'))[0];
const hash = '0x' + 'ab'.repeat(32);
function pagePayload() {
  const ranges = [{ tierId: 1, label: 'Below', lower: null, upper: -1 }, { tierId: 2, label: 'Middle', lower: -1, upper: 1 }, { tierId: 3, label: 'Above', lower: 1, upper: null }];
  return { schema: 'metalog.entries.v1', chainId: fixture.chainId, projectId: String(fixture.projectId), blockNumber: '100', snapshotBlockHash: hash, hook: fixture.inventory.hook, ranges, scannedFromBlock: '90', scannedToBlock: '100', complete: false, nextCursor: '89:0', entries: [{ status: 'verified-manual', transactionHash: hash, blockNumber: '99', timestamp: 1234, account: fixture.inventory.hook, beneficiary: fixture.inventory.hook, stakeWei: '1000000000000', tokenIds: ['2000000001'], quantities: [0, 1, 0], coefficients: [0, 1], chart: { low: -1, high: 1, peak: 0.5, visibleMass: 1, buckets: [{ lower: -1, upper: 0, density: 0.5, mass: 0.5 }, { lower: 0, upper: 1, density: 0.5, mass: 0.5 }], positions: ranges.map((range, i) => ({ range, quantity: i === 1 ? 1 : 0, share: i === 1 ? 1 : 0, density: i === 1 ? 0.5 : null })) } }] };
}
let harness;
async function source() { if (!harness) harness = esbuild.build({ stdin: { contents: "import { renderShopSection } from './src/discover.js'; window.renderNativeShop = renderShopSection;", resolveDir: process.cwd(), loader: 'js' }, bundle: true, format: 'esm', write: false, define: { __BENDYSTRAW_API_KEY__: '""', __PINATA_JWT__: '""' } }).then(r => r.outputFiles[0].text); return harness; }
test('native Entries is lazy, responsive, read-only and carries snapshot continuation', async ({ page }, testInfo) => {
  const calls = [];
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/entries-harness.js', async route => route.fulfill({ contentType: 'text/javascript', body: await source() }));
  await page.route('https://metalog.money/api/markets/**/entries*', route => {
    calls.push(route.request().url());
    const payload = pagePayload(); if (calls.length > 1) Object.assign(payload, { entries: [], complete: true, nextCursor: null });
    return route.fulfill({ json: payload });
  });
  await page.goto('/index.html#learn'); await page.addScriptTag({ url: '/entries-harness.js', type: 'module' });
  await page.evaluate(f => {
    const inventory = f.inventory; inventory.blockNumber = BigInt(inventory.blockNumber); inventory.tiers.forEach(t => { t.price = BigInt(t.price); t.currentSupply = BigInt(t.currentSupply); }); inventory.pricing.symbol = 'ETH';
    document.querySelector('main').replaceChildren(window.renderNativeShop({ id: Number(f.projectId), chainId: f.chainId, isRevnet: false }, inventory, null));
  }, fixture);
  await expect(page.getByRole('button', { name: 'Entries', exact: true })).toBeVisible(); expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verified manual allocation' })).toBeVisible(); expect(calls).toHaveLength(1);
  await expect(page.getByText('Actual entries · reference curve', { exact: true })).toBeVisible();
  await expect(page.locator('.native-entries svg')).toHaveAttribute('role', 'img');
  await expect(page.getByRole('link', { name: 'Receipt', exact: true })).toHaveAttribute('href', `https://basescan.org/tx/${hash}`);
  await expect(page.getByText(/History is incomplete/)).toBeVisible();
  expect(await page.locator('.native-entries').evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect(page.getByRole('button', { name: /Pay$|Add manager|Checkout|Mint/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('native-entries.png'), fullPage: true });
  await page.getByRole('button', { name: 'Load earlier entries' }).click();
  await expect(page.getByText(/History scan complete/)).toBeVisible(); expect(new URL(calls[1]).searchParams.get('blockNumber')).toBe('100'); expect(new URL(calls[1]).searchParams.get('cursor')).toBe('89:0');
  await page.getByRole('button', { name: 'Ranges', exact: true }).click(); await expect(page.locator('.native-nft-inventory').first()).toBeVisible();
});
