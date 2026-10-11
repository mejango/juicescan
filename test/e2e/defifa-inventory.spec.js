import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Real Center snapshots, read through published SDK2.28.0 on 2026-10-11.
// Render the shipped Shop section with native inventory, without needing a
// functioning indexer or a wallet to assert protocol-specific write exclusion.
const fixtures = JSON.parse(readFileSync('test/fixtures/defifa-inventory.json', 'utf8'));
let harness;
async function source() {
  if (!harness) harness = esbuild.build({ stdin: { contents: "import { renderShopSection } from './src/discover.js'; window.renderNativeShop = renderShopSection;", resolveDir: process.cwd(), loader: 'js' }, bundle: true, format: 'esm', write: false, define: { __BENDYSTRAW_API_KEY__: '""', __PINATA_JWT__: '""' } }).then(result => result.outputFiles[0].text);
  return harness;
}
for (const fixture of fixtures) test(`Defifa ${fixture.chainId}/${fixture.projectId} native range inventory`, async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/defifa-harness.js', async route => route.fulfill({ contentType: 'text/javascript', body: await source() }));
  await page.goto('/index.html#learn');
  await page.addScriptTag({ url: '/defifa-harness.js', type: 'module' });
  await page.evaluate(({ chainId, projectId, inventory }) => {
    inventory.blockNumber = BigInt(inventory.blockNumber);
    inventory.tiers.forEach(tier => { tier.price = BigInt(tier.price); tier.currentSupply = BigInt(tier.currentSupply); });
    inventory.pricing.symbol = 'ETH';
    const main = document.querySelector('main'); main.replaceChildren(window.renderNativeShop({ id: Number(projectId), chainId, isRevnet: false }, inventory, null));
  }, fixture);
  await expect(page.getByText('Defifa NFT tiers', { exact: true })).toBeVisible();
  await expect(page.locator('.native-nft-inventory tbody tr')).toHaveCount(fixture.inventory.tiers.length);
  await expect(page.getByText(fixture.inventory.tiers[0].name, { exact: true })).toBeVisible();
  await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);
  await expect(page.locator('.native-nft-inventory th').nth(1)).toHaveText('Name');
  await expect(page.getByText('0.0000010 ETH', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add items|Add manager|Checkout|Mint/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

let controlHarness;
async function controlsSource() {
  if (!controlHarness) controlHarness = esbuild.build({
    stdin: { contents: "import { renderPayCard, renderShopSection } from './src/discover.js'; window.renderControls = function (id) { const p = { id, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false }; document.querySelector('main').replaceChildren(renderPayCard(p), renderShopSection(p)); };", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', write: false, define: { __BENDYSTRAW_API_KEY__: '""', __PINATA_JWT__: '""' },
    plugins: [{ name: 'controlled-identity', setup(build) {
      build.onResolve({ filter: /^@bananapus\/nana-sdk-core\/v6$/ }, () => ({ path: 'sdk', namespace: 'identity' }));
      build.onLoad({ filter: /.*/, namespace: 'identity' }, () => ({ contents: "export async function getProjectNftInventory(client, args) { if (args.tierLimit === 1) return window.inventoryPromise; throw new Error('Resolver unavailable'); }", loader: 'js' }));
    } }],
  }).then(result => result.outputFiles[0].text);
  return controlHarness;
}
test('protocol identification gates visible controls and preserves ordinary payments despite optional shop failure', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/inventory-controls.js', async route => route.fulfill({ contentType: 'text/javascript', body: await controlsSource() }));
  await page.goto('/index.html#learn');
  await page.addScriptTag({ url: '/inventory-controls.js', type: 'module' });
  await page.evaluate(() => { window.inventoryPromise = new Promise(resolve => window.resolveIdentity = resolve); window.renderControls(501); });
  await expect(page.locator('.paybox-amount-row')).toBeHidden();
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toBeHidden();
  await page.evaluate(() => window.resolveIdentity({ protocol: 'jb721' }));
  await expect(page.locator('.paybox-amount-row')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toBeVisible();
  await expect(page.getByText(/Resolver unavailable/).first()).toBeVisible();
  await page.evaluate(() => { window.inventoryPromise = Promise.resolve({ protocol: 'defifa', hook: '0x123', pricing: { currency: 61166, decimals: 18 }, blockNumber: 1n, phase: 1, tiers: [], nextStartingId: null }); window.renderControls(502); });
  await expect(page.getByText('Defifa NFT transactions are not supported in this interface.', {exact:true})).toBeVisible();
  await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);
  await expect(page.locator('.paybox-amount-row')).toBeHidden();
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toBeHidden();
});

test('generic Defifa tiers retain nonnumeric names and mixed prices without curve views or application links', async ({ page }) => {
  const fixture=structuredClone(fixtures[0]); fixture.inventory.phase=3;
  fixture.inventory.tiers=[{...fixture.inventory.tiers[0],id:1,name:'Blue Team',price:'1000000000000',currentSupply:'2'},{...fixture.inventory.tiers[0],id:2,name:'Orange Team',price:'3000000000000',currentSupply:'5'}];
  const curveRequests=[];
  page.on('request', request=>{if(request.url().startsWith('https://metalog.money/'))curveRequests.push(request.url());});
  await page.route('**/*', route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('**/defifa-harness.js', async route=>route.fulfill({contentType:'text/javascript',body:await source()}));
  await page.goto('/index.html#learn');await page.addScriptTag({url:'/defifa-harness.js',type:'module'});
  await page.evaluate(({chainId,projectId,inventory})=>{inventory.blockNumber=BigInt(inventory.blockNumber);inventory.tiers.forEach(t=>{t.price=BigInt(t.price);t.currentSupply=BigInt(t.currentSupply);});inventory.pricing.symbol='ETH';document.querySelector('main').replaceChildren(window.renderNativeShop({id:Number(projectId),chainId,isRevnet:false},inventory,null));},fixture);
  await expect(page.getByText('Defifa NFT tiers',{exact:true})).toBeVisible();
  await expect(page.getByText('Scoring',{exact:true})).toBeVisible();
  const rows=page.locator('.native-nft-inventory tbody tr');await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Blue Team');await expect(rows.nth(0)).toContainText('0.0000010 ETH');await expect(rows.nth(0).locator('td').last()).toHaveText('2');
  await expect(rows.nth(1)).toContainText('Orange Team');await expect(rows.nth(1)).toContainText('0.0000030 ETH');await expect(rows.nth(1).locator('td').last()).toHaveText('5');
  await expect(page.locator('.native-nft-inventory caption')).toHaveText('Onchain NFT tiers');
  await expect(page.locator('[data-inventory-block]')).toHaveAttribute('data-inventory-block',String(fixture.inventory.blockNumber));
  await expect(page.getByRole('button',{name:/Recorded curve evidence|Entries|Ranges/})).toHaveCount(0);
  await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);expect(curveRequests).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
});
