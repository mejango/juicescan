// A dropdown must never show the browser's default arrow. The one `select` rule in src/style.css removes
// it, draws the caret and reserves its room; this reads the computed result in the shipped stylesheet for
// a bare select and for every class the app puts on one, so a later rule cannot bring the arrow back,
// drop the caret or let text run under it.
import { expect, test } from '@playwright/test';

const CLASSES = ['', 'field', 'field create-input create-input-auto', 'create-amount-cur', 'create-after-select',
  'network-dropdown', 'fn-view-dropdown', 'style-editor-select', 'pay-currency-btn', 'operator-cat-select',
  'operator-edit-jwt extras-select extras-behavior-select', 'ops-chain-select', 'rf-chainselect', 'safe-nonce-input',
  'price-detail-select', 'paybox-select', 'discover-net-select', 'time-zone-select', 'font-selector-sel',
  'funding-chart-select', 'create-wrap-select-native'];

test('no dropdown can show the default arrow', async ({ page }) => {
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort('blockedbyclient');
  });
  await page.goto('/index.html#learn');
  await expect(page.locator('.font-selector-sel')).toBeAttached();
  const bad = await page.evaluate(classes => {
    const host = document.body.appendChild(document.createElement('div'));
    host.className = 'component-wrapper';
    for (const cls of classes) for (const disabled of [false, true]) {
      const select = host.appendChild(document.createElement('select'));
      select.className = cls; select.disabled = disabled;
      select.appendChild(document.createElement('option')).textContent = 'Option';
    }
    return [...document.querySelectorAll('select')].map(select => {
      const style = getComputedStyle(select);
      const inset = parseFloat(style.backgroundPosition.match(/calc\(100% - ([\d.]+)px\)/)?.[1] ?? '0');
      const ok = style.appearance === 'none' && style.backgroundImage.includes('data:image/svg+xml')
        && style.backgroundRepeat === 'no-repeat' && style.backgroundSize === '10px 6px'
        && parseFloat(style.paddingRight) >= inset + 10 + 6;
      return ok ? null : `${select.className || '(no class)'}: ${style.appearance}, ${style.paddingRight}, ${style.backgroundPosition}`;
    }).filter(Boolean);
  }, CLASSES);
  expect(bad).toEqual([]);
});
