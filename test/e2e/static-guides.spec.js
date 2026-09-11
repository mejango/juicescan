import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

for (const guide of ['learn', 'build']) {
  test(`${guide} is readable and navigable without JavaScript`, async ({ page, browser }) => {
    expect((await page.goto(`/${guide}.html`)).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('.guide-section')).toHaveCount(21);
    await expect(page.locator('script, button')).toHaveCount(0);
    const first = page.locator('.guide-toc-link').first();
    const target = await first.getAttribute('href');
    await first.click();
    await expect(page).toHaveURL(url => url.hash === target);
    await expect(page.locator(target).getByRole('heading', { level: 2 })).toBeInViewport();
    if (guide === 'build') {
      await page.getByText('Read or copy the build prompt', { exact: true }).click();
      await expect(page.locator('details pre')).toContainText('My product:');
    }
    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
    // Axe itself requires JavaScript. Audit the same script-free document in a
    // separate context after proving the native journey with JS disabled.
    const auditContext = await browser.newContext({ javaScriptEnabled: true, viewport: page.viewportSize() });
    const auditPage = await auditContext.newPage();
    try {
      await auditPage.goto(page.url());
      if (guide === 'build') await auditPage.locator('details summary').click();
      const a11y = await new AxeBuilder({ page: auditPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(a11y.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    } finally {
      await auditContext.close();
    }
  });
}
