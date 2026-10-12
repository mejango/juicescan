import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Recorded Center snapshots from SDK2.28.0, used only as browser fixtures.
// remainingSupply=100 is synthetic selection capacity, not live supply evidence.
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
    inventory.tiers.forEach(tier => { tier.price = BigInt(tier.price); tier.currentSupply = BigInt(tier.currentSupply); tier.remainingSupply = 100n; });
    inventory.pricing.symbol = 'ETH';
    const main = document.querySelector('main'); main.replaceChildren(window.renderNativeShop({ id: Number(projectId), chainId, isRevnet: false }, inventory, null));
  }, fixture);
  await expect(page.getByText('Defifa NFT tiers', { exact: true })).toBeVisible();
  await expect(page.locator('.shop-grid .shop-tier')).toHaveCount(fixture.inventory.tiers.length);
  await expect(page.getByText(fixture.inventory.tiers[0].name, { exact: true })).toBeVisible();
  await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);
  await expect(page.locator('.shop-tier-name').first()).toHaveText(fixture.inventory.tiers[0].name);
  await expect(page.locator('.shop-tier-supply').first()).toContainText(fixture.inventory.tiers[0].currentSupply + ' NFTs');
  await expect(page.getByText('0.0000010 ETH', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add items|Add manager|Checkout|Mint/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

let controlHarness;
async function controlsSource() {
  if (!controlHarness) controlHarness = esbuild.build({
    stdin: { contents: "import { renderPayCard, renderShopSection, renderTokenPanel, makeNftCart } from './src/discover.js'; window.renderControls = function (id, multichain) { const p = { id, chainId: 8453, ruleset: { start: 0, weight: 0n }, isRevnet: false }; if(multichain){p.chains=[{id:8453,name:'Base'},{id:84532,name:'Base Sepolia'}];p.idByChain={8453:id,84532:46};} const cart=makeNftCart(); document.querySelector('main').replaceChildren(renderPayCard(p,cart), renderShopSection(p,undefined,cart)); }; window.renderTokens = function (id) { const p = { id, chainId: 8453, isRevnet: false }; const main = document.querySelector('main'); main.innerHTML = '<span data-project-flavor=\"8453:' + id + '\">CUSTOM</span>'; main.appendChild(renderTokenPanel(p)); };", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', write: false, define: { __BENDYSTRAW_API_KEY__: '""', __PINATA_JWT__: '""' },
    plugins: [{ name: 'controlled-identity', setup(build) {
      build.onResolve({ filter: /^@bananapus\/nana-sdk-core\/v6$/ }, () => ({ path: 'sdk', namespace: 'identity' }));
      build.onResolve({filter:/^\//,namespace:'identity'},args=>({path:args.path,namespace:'file'}));
      build.onLoad({ filter: /.*/, namespace: 'identity' }, () => ({ contents: "export * from " + JSON.stringify(process.cwd() + "/node_modules/@bananapus/nana-sdk-core/dist/esm/v6/index.js") + "; export async function getProjectNftInventory(client, args) { if (args.tierLimit === 1) return window.inventoryPromise; if(window.fullInventory) return window.fullInventory; throw new Error('Resolver unavailable'); }", loader: 'js' }));
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
  await expect(page.locator('.paybox-memo')).toBeHidden();
  await expect(page.locator('.paybox-feedback')).toBeHidden();
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toBeHidden();
  await page.evaluate(() => window.resolveIdentity({ protocol: 'jb721' }));
  await expect(page.locator('.paybox-amount-row')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toBeVisible();
  await expect(page.getByText(/Resolver unavailable/).first()).toBeVisible();
  await page.evaluate(() => { window.inventoryPromise = Promise.resolve({ protocol: 'defifa', hook: '0x123', pricing: { currency: 61166, decimals: 18 }, blockNumber: 1n, phase: 1, tiers: [], nextStartingId: null }); window.renderControls(502); });
  await expect(page.locator('.paybox-mode')).toHaveValue('addbalance');
  await expect(page.locator('.paybox-mode option[value="pay"]')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Add',exact:true})).toBeVisible();
  await expect(page.locator('.paybox-memo')).toBeVisible();
  await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);
  await expect(page.locator('.paybox-amount-row')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toBeHidden();
});

test('failed NFT identity leaves intentional balance funding and Retry available without offering mint', async ({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route('**/inventory-controls.js',async route=>route.fulfill({contentType:'text/javascript',body:await controlsSource()}));
 await page.goto('/index.html#learn');await page.addScriptTag({url:'/inventory-controls.js',type:'module'});
 await page.evaluate(()=>{window.inventoryPromise=new Promise((resolve,reject)=>window.rejectFundingIdentity=reject);window.renderControls(504)});
 await expect(page.locator('.paybox-amount-row')).toBeHidden();
 await page.evaluate(()=>window.rejectFundingIdentity(new Error('NFT identity unavailable')));
 await expect(page.locator('.paybox-mode')).toHaveValue('addbalance');
 await expect(page.locator('.paybox-mode option[value="pay"]')).toHaveCount(0);
 await expect(page.locator('.paybox-memo')).toBeVisible();
 await expect(page.locator('.paybox-status').getByRole('button',{name:'Retry',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Add',exact:true})).toBeVisible();
});

test('initial Tokens keeps failed identity unverified and retries Defifa guidance without a wallet send', async ({ page }) => {
  const writes = [];
  page.on('request', request => { if (/eth_send|wallet_send|personal_sign|eth_sign/.test(request.postData() || '')) writes.push(request.url()); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/inventory-controls.js', async route => route.fulfill({ contentType: 'text/javascript', body: await controlsSource() }));
  await page.goto('/index.html#learn');
  await page.addScriptTag({ url: '/inventory-controls.js', type: 'module' });
  await page.evaluate(() => {
    window.inventoryPromise = new Promise((resolve, reject) => { window.rejectIdentity = reject; });
    window.renderTokens(503);
  });
  await expect(page.locator('[data-project-flavor]')).toHaveText('Checking');
  await expect(page.getByText('Checking token protocol…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deploy ERC-20', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.rejectIdentity(new Error('Identity unavailable')));
  await expect(page.locator('[data-project-flavor]')).toHaveText('Unverified');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.evaluate(() => { window.inventoryPromise = Promise.resolve({ protocol: 'defifa' }); });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('[data-project-flavor]')).toHaveText('Defifa');
  await expect(page.getByText('Defifa NFTs', { exact: true })).toBeVisible();
  await expect(page.getByText(/Defifa uses NFTs for participation and payouts/)).toBeVisible();
  await expect(page.getByText(/Your project tokens are recorded as Juicebox credits/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deploy ERC-20', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('generic Defifa tiers retain nonnumeric names and mixed prices without curve views or application links', async ({ page }) => {
  const fixture=structuredClone(fixtures[0]); fixture.inventory.phase=3;
  fixture.inventory.tiers=[{...fixture.inventory.tiers[0],id:1,name:'Blue Team',price:'1000000000000',currentSupply:'2'},{...fixture.inventory.tiers[0],id:2,name:'Orange Team',price:'3000000000000',currentSupply:'5'}];
  const curveRequests=[];
  page.on('request', request=>{if(request.url().startsWith('https://metalog.money/'))curveRequests.push(request.url());});
  await page.route('**/*', route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('**/defifa-harness.js', async route=>route.fulfill({contentType:'text/javascript',body:await source()}));
  await page.goto('/index.html#learn');await page.addScriptTag({url:'/defifa-harness.js',type:'module'});
  await page.evaluate(({chainId,projectId,inventory})=>{inventory.blockNumber=BigInt(inventory.blockNumber);inventory.tiers.forEach(t=>{t.price=BigInt(t.price);t.currentSupply=BigInt(t.currentSupply);t.remainingSupply=100n;});inventory.pricing.symbol='ETH';document.querySelector('main').replaceChildren(window.renderNativeShop({id:Number(projectId),chainId,isRevnet:false},inventory,null));},fixture);
  await expect(page.getByText('Defifa NFT tiers',{exact:true})).toBeVisible();
  await expect(page.getByText('Scoring',{exact:true})).toBeVisible();
  const rows=page.locator('.shop-grid .shop-tier');await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Blue Team');await expect(rows.nth(0)).toContainText('0.0000010 ETH');await expect(rows.nth(0).locator('.shop-tier-supply')).toContainText('2 NFTs');
  await expect(rows.nth(1)).toContainText('Orange Team');await expect(rows.nth(1)).toContainText('0.0000030 ETH');await expect(rows.nth(1).locator('.shop-tier-supply')).toContainText('5 NFTs');
  await expect(page.locator('.native-nft-inventory')).toHaveCount(0);
  for(const button of await page.locator('.shop-tier-stepbtn').all()) await expect(button).toBeDisabled();
  await expect(page.locator('[data-inventory-block]')).toHaveAttribute('data-inventory-block',String(fixture.inventory.blockNumber));
  await expect(page.getByRole('button',{name:/Recorded curve evidence|Entries|Ranges/})).toHaveCount(0);
  await expect(page.locator('a[href*="metalog.money"]')).toHaveCount(0);expect(curveRequests).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
});

test('fixture native cart uses shared Pay preview, mixed prices, and balance funding without losing selection', async ({ page }, testInfo) => {
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/eth_send|wallet_send|personal_sign|eth_sign/.test(request.postData() || '')) writes.push(request.url()); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/inventory-controls.js', async route => route.fulfill({ contentType: 'text/javascript', body: await controlsSource() }));
  await page.goto('/index.html#learn');
  await page.addScriptTag({ url: '/inventory-controls.js', type: 'module' });
  await page.evaluate(() => {
    const tiers = [{ id: 1, name: 'Blue Team', price: 1000000000000n, currentSupply: 2n, remainingSupply: 100n },
      { id: 7, name: 'Orange Team', price: 3000000000000n, currentSupply: 5n, remainingSupply: 100n }];
    window.fullInventory = { protocol: 'defifa', hook: '0x' + '12'.repeat(20), blockNumber: 1n, phase: 1,
      pricing: { currency: 1, decimals: 18 }, tiers, nextStartingId: null,
      capabilities: { genericPay: false, genericCashOut: false, manageTiers: false } };
    window.inventoryPromise = Promise.resolve({ ...window.fullInventory, tiers: tiers.slice(0, 1) });
    window.renderControls(521, true);
  });
  await expect(page.locator('.paybox-mode')).toHaveValue('pay');
  await expect(page.locator('.shop-grid .shop-tier')).toHaveCount(2);
  await expect(page.locator('.paybox-shop-item')).toHaveCount(2);
  const native = page.locator('.paybox .defifa-nft-actions');
  await expect(native.locator('input[aria-label="Selected NFT amount"]')).toBeVisible();
  await expect(page.locator('.paybox > .paybox-amount-row')).toBeHidden();
  await expect(page.locator('.paybox-chain-static:visible')).toHaveCount(1);
  await expect(page.locator('.paybox-chain-static:visible')).toHaveText('Base');
  await expect(native.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();
  const orange = page.locator('.shop-tier[data-tier-id="7"]');
  await orange.getByRole('button', { name: '+', exact: true }).click();
  await orange.getByRole('button', { name: '+', exact: true }).click();
  await expect(native.locator('input[aria-label="Selected NFT amount"]')).toHaveValue('0.0000060 ETH');
  await expect(native.locator('.paybox-nft-label')).toHaveText('Orange Team ×2');
  await expect(page.locator('.paybox-shop-item').nth(1).locator('.paybox-shop-qty')).toHaveText('2');
  await page.locator('.paybox-shop-thumb').first().click();
  await expect(page.locator('.shop-tier[data-tier-id="1"] .shop-tier-qty')).toHaveText('1');
  await expect(native.locator('input[aria-label="Selected NFT amount"]')).toHaveValue('0.0000070 ETH');
  await expect(native.locator('input[aria-label="Selected NFT amount"]')).toHaveAttribute('readonly', '');
  await page.locator('.paybox-mode').selectOption('addbalance');
  const fundingChain = page.locator('.paybox-payon select:not(.paybox-mode)');
  await expect(fundingChain).toBeVisible();
  await fundingChain.selectOption('84532');
  await expect(native).toBeHidden();
  await expect(page.locator('.paybox > .paybox-amount-row')).toBeVisible();
  await expect(page.locator('.paybox > .paybox-amount-row').getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await page.locator('.paybox-mode').selectOption('pay');
  await expect(fundingChain).toBeHidden();
  await expect(page.locator('.paybox-chain-static:visible')).toHaveCount(1);
  await expect(page.locator('.paybox-chain-static:visible')).toHaveText('Base');
  await expect(native.locator('input[aria-label="Selected NFT amount"]')).toHaveValue('0.0000070 ETH');
  await page.locator('.paybox-mode').selectOption('addbalance');
  await expect(fundingChain).toBeVisible();
  await expect(fundingChain).toHaveValue('84532');
  await page.locator('.paybox-mode').selectOption('pay');
  await expect(page.getByRole('button', { name: '+ Add manager', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('fixture-native-shared-checkout.png'), fullPage: true });
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test('fixture closed entry keeps tier facts visible and balance funding available', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/inventory-controls.js', async route => route.fulfill({ contentType: 'text/javascript', body: await controlsSource() }));
  await page.goto('/index.html#learn'); await page.addScriptTag({ url: '/inventory-controls.js', type: 'module' });
  await page.evaluate(() => {
    window.fullInventory = { protocol: 'defifa', hook: '0x' + '13'.repeat(20), blockNumber: 2n, phase: 3, pricing: { currency: 1, decimals: 18 },
      tiers: [{ id: 1, name: 'Blue Team', price: 1000000000000n, currentSupply: 2n, remainingSupply: 100n }], nextStartingId: null };
    window.inventoryPromise = Promise.resolve(window.fullInventory); window.renderControls(522);
  });
  await expect(page.getByText('NFT minting is not open.', { exact: true })).toBeVisible();
  await expect(page.locator('.shop-tier-name')).toHaveText('Blue Team');
  for (const button of await page.locator('.shop-tier-stepbtn').all()) await expect(button).toBeDisabled();
  await page.locator('.paybox-mode').selectOption('addbalance');
  await expect(page.locator('.paybox > .paybox-amount-row')).toBeVisible();
  await expect(page.locator('.paybox > .paybox-amount-row').getByRole('button', { name: 'Add', exact: true })).toBeVisible();
});

test('pending identity has no empty warning outline and real funding errors remain visible', async ({ page }, testInfo) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/inventory-controls.js', async route => route.fulfill({ contentType: 'text/javascript', body: await controlsSource() }));
  await page.goto('/index.html#learn'); await page.addScriptTag({ url: '/inventory-controls.js', type: 'module' });
  await page.evaluate(() => { window.inventoryPromise = new Promise(resolve => window.finishModeIdentity = resolve); window.renderControls(28); });
  const warning = page.locator('.paybox > .paybox-contract-warning');
  await expect(warning).toHaveText('');
  expect(await warning.evaluate(node => node.getBoundingClientRect().height)).toBe(0);
  await page.screenshot({path: testInfo.outputPath('pending-identity.png'), fullPage: true});
  await page.evaluate(() => window.finishModeIdentity(null));
  await expect(warning).toContainText('Could not verify which tokens');
  await expect(warning).toBeVisible();
  expect(await warning.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(0);
});

test('native Pay mode caret matches ordinary compact sizing after full inventory and mode changes', async ({ page }, testInfo) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/inventory-controls.js', async route => route.fulfill({ contentType: 'text/javascript', body: await controlsSource() }));
  await page.goto('/index.html#learn'); await page.addScriptTag({ url: '/inventory-controls.js', type: 'module' });
  await page.evaluate(() => { window.inventoryPromise = Promise.resolve(null); window.renderControls(529); });
  const mode = page.locator('.paybox-mode'); await expect(mode).toBeVisible();
  const ordinaryWidth = await mode.evaluate(node => node.getBoundingClientRect().width);
  await page.evaluate(() => {
    window.fullInventory = { protocol: 'defifa', hook: '0x' + '12'.repeat(20), blockNumber: 1n, phase: 1, pricing: { currency: 1, decimals: 18 }, nextStartingId: null, tiers: [{ id: 1, name: 'Blue Team', price: 1000000000000n, currentSupply: 2n, remainingSupply: 100n }] };
    window.inventoryPromise = Promise.resolve({ ...window.fullInventory, tiers: window.fullInventory.tiers.slice(0, 1) }); window.renderControls(28);
  });
  await expect(mode).toHaveValue('pay');
  expect(await mode.evaluate(node => node.getBoundingClientRect().width)).toBeLessThan(60);
  expect(Math.abs(await mode.evaluate(node => node.getBoundingClientRect().width) - ordinaryWidth)).toBeLessThanOrEqual(1);
  await testInfo.attach('mode-widths', {body: JSON.stringify({ordinaryWidth, nativeWidth: await mode.evaluate(node => node.getBoundingClientRect().width)}), contentType: 'application/json'});
  await page.screenshot({path: testInfo.outputPath('native-compact-pay.png'), fullPage: true});
  await mode.selectOption('addbalance');
  expect(await mode.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(ordinaryWidth);
  await mode.selectOption('pay');
  expect(Math.abs(await mode.evaluate(node => node.getBoundingClientRect().width) - ordinaryWidth)).toBeLessThanOrEqual(1);
});
