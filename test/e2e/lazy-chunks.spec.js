import { expect, test } from '@playwright/test';

// The bundle ships as an ESM entry plus hashed chunks in chunks/. Served from a path-gateway URL
// (/ipfs/<cid>/), every chunk must resolve inside that directory, and each lazy surface must load and
// render on first use.
const ROOT = '/ipfs/bafylazychunkstest';
const CHAIN_IDS = [1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614];

async function open(page, hash) {
  const failures = [];
  const scripts = [];
  await page.addInitScript(chainIds => {
    const localRpc = `${window.location.origin}/__ci_rpc__`;
    for (const chainId of chainIds) localStorage.setItem(`jb-rpc-${chainId}`, localRpc);
  }, CHAIN_IDS);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.fallback();
    return route.abort('blockedbyclient');
  });
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith('.js')) scripts.push({ path, status: response.status() });
  });
  await page.goto(`${ROOT}/index.html#${hash}`, { waitUntil: 'domcontentloaded' });
  return { failures, scripts };
}

test('lazy surfaces load from same-directory chunks under a gateway path', async ({ page }) => {
  const { failures, scripts } = await open(page, 'learn-glossary');

  // The guide renders from its chunk, then the deep link scrolls to its section.
  const glossary = page.locator('#learn-glossary');
  await expect(glossary).toBeVisible();
  await expect.poll(() => glossary.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return rect.top >= -2 && rect.top < window.innerHeight;
  })).toBe(true);

  // API tab: the directory renders on activation; a function's source body loads when its section opens.
  await page.getByRole('button', { name: 'API', exact: true }).click();
  await page.locator('.contract-summary .contract-name').first().click();
  const row = page.locator('.fn-row').first();
  await row.locator('.fn-summary .fn-name-preview').click();
  const source = row.locator('.fn-section').filter({ has: page.locator('.fn-section-label', { hasText: /^source$/ }) });
  await source.locator('.fn-section-header').click();
  await expect(source.locator('.fn-source-code')).toContainText('function ');

  // The create wizard loads with its chunk from the Discover button.
  await page.getByRole('button', { name: 'DISCOVER', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.locator('dialog.create-overlay')).toHaveCount(1);

  expect(failures).toEqual([]);
  const chunks = scripts.filter(script => script.path.includes('/chunks/'));
  expect(chunks.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(script.path.startsWith(`${ROOT}/`), script.path).toBe(true);
    expect(script.status, script.path).toBe(200);
  }
});

test('a chunk that failed to load recovers through the reload button', async ({ page }) => {
  // The first request for the guides chunk fails. Browsers keep a failed module import failed, so the
  // panel asks for a reload, and the reload fetches the chunk again.
  let failed = 0;
  await page.route(/\/chunks\/learn-build-[^/]+\.js$/, route => {
    if (failed++ === 0) return route.abort('failed');
    return route.continue();
  });
  const { failures } = await open(page, 'learn');
  const panel = page.locator('#tab-learn');
  await expect(panel).toContainText('Reload the page to try again');
  await panel.getByRole('button', { name: '[reload]' }).click();
  await expect(panel.locator('#learn-glossary')).toHaveCount(1);
  expect(failed).toBe(2);
  expect(failures).toEqual([]);
});

test('the first view loads only the entry and its preloaded chunks', async ({ page }) => {
  // check:bundle budgets the static import closure; this catches an eager import() at startup that the
  // closure would miss.
  const { failures, scripts } = await open(page, 'discover');
  await page.waitForLoadState('networkidle');
  const preloaded = await page.evaluate(() => [...document.querySelectorAll('script[type="module"][src], link[rel="modulepreload"]')]
    .map(node => new URL(node.src || node.href).pathname));
  expect(failures).toEqual([]);
  // viem's call() imports its CCIP-read helper (a 223 B chunk) when an eth_call fails, as fixture reads do.
  const viemOnError = path => /\/chunks\/ccip-[^/]+\.js$/.test(path);
  expect(scripts.map(script => script.path).filter(path => !preloaded.includes(path) && !viemOnError(path))).toEqual([]);
});
