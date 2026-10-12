import * as esbuild from 'esbuild';
import { expect, test } from '@playwright/test';
let harness;
async function source() {
  if (!harness) harness = esbuild.build({ stdin: { contents: "import { renderTierMediaInto } from './src/discover.js'; window.renderMedia = renderTierMediaInto;", resolveDir: process.cwd() }, bundle: true, format: 'esm', write: false, define: { __BENDYSTRAW_API_KEY__: '\"\"', __PINATA_JWT__: '\"\"' } }).then(result => result.outputFiles[0].text);
  return harness;
}
test('malformed creator artwork falls back without rewriting it or breaking valid images', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/image-fallback-harness.js', async route => route.fulfill({ contentType: 'text/javascript', body: await source() }));
  await page.goto('/index.html#learn');
  await page.addScriptTag({ url: '/image-fallback-harness.js', type: 'module' });
  await page.evaluate(() => {
    const main = document.querySelector('main'); main.replaceChildren();
    // Same malformed XML shape as recorded Defifa tier2: an entity split between text nodes.
    const broken = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg"><text>&</text><text>lt;</text></svg>');
    const valid = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="blue"/></svg>');
    for (const mode of ['thumb', 'full', 'detail']) {
      const box = document.createElement('div'); box.dataset.mode = mode; main.append(box);
      window.renderMedia(box, { image: broken }, 'Blue Team', mode);
    }
    const good = document.createElement('div'); good.dataset.mode = 'valid'; main.append(good);
    window.renderMedia(good, { image: valid }, 'Orange Team', 'thumb');
  });
  for (const mode of ['thumb', 'full', 'detail']) {
    await expect(page.locator(`[data-mode="${mode}"] .shop-tier-ph`)).toHaveText('Blue Team');
    await expect(page.locator(`[data-mode="${mode}"] img`)).toHaveCount(0);
  }
  await expect.poll(() => page.locator('[data-mode="valid"] img').evaluate(image => image.naturalWidth)).toBe(150);
});
