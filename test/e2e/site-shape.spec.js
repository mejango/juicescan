import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const surfaces = [
  { button: 'DISCOVER', hash: 'discover', section: 'discover' },
  { button: null, hash: 'actions', section: 'common' },
  { button: 'LEARN', hash: 'learn', section: 'learn' },
  { button: 'BUILD', hash: 'build', section: 'build' },
  { button: 'API', hash: 'api', section: 'directory' },
  { button: 'DATA', hash: 'data', section: 'data' },
  { button: 'ADMIN', hash: 'admin', section: 'admin' },
  { button: 'WHY?', hash: 'why', section: 'why' },
];

function expectNoExternalTraffic(externalAttempts) {
  expect(
    externalAttempts,
    'an external HTTP or WebSocket destination was attempted',
  ).toEqual([]);
}

async function openStaticTab(page, hash, section = hash) {
  const externalAttempts = [];
  // Make the preference explicit on the page as well as in every project
  // profile; device descriptors must never silently reset this safety case.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Keep eager public-client reads deterministic without changing the
  // production bundle. The app already supports per-chain custom RPCs; install
  // same-origin fail-fast endpoints before any application script runs.
  await page.addInitScript(chainIds => {
    const localRpc = `${window.location.origin}/__ci_rpc__`;
    for (const chainId of chainIds) {
      localStorage.setItem(`jb-rpc-${chainId}`, localRpc);
    }
  }, [1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614]);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    externalAttempts.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/^wss?:\/\//, socket => {
    const url = new URL(socket.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      socket.connectToServer();
      return;
    }
    externalAttempts.push(socket.url());
    socket.close({ code: 1008, reason: 'External browser traffic is disabled in CI' });
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`/index.html#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`#tab-${section}`)).toHaveClass(/active/);
  await expect(page.locator(`#tab-${section}`)).toBeVisible();
  return { pageErrors, externalAttempts };
}

test('static guide keeps the site shell usable and inside every viewport', async ({ page }) => {
  const { pageErrors, externalAttempts } = await openStaticTab(page, 'learn');
  await expect(page.getByRole('heading', { name: 'JUICEBOX MONEY ENGINE' })).toBeVisible();
  await expect(page.getByRole('navigation').filter({ has: page.getByRole('button', { name: 'LEARN' }) })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. WHAT IS JUICEBOX?' })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const shell = ['#header', '#tabs', 'main', 'footer'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      shell,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  for (const item of geometry.shell) {
    expect(item.left, item.selector).toBeGreaterThanOrEqual(-1);
    expect(item.right, item.selector).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(item.width, item.selector).toBeGreaterThan(0);
  }
  expect(pageErrors).toEqual([]);
  expectNoExternalTraffic(externalAttempts);
});

test('every product surface remains visible, contained, and error-free', async ({ page }) => {
  const { pageErrors, externalAttempts } = await openStaticTab(page, 'learn');
  for (const surface of surfaces) {
    if (surface.button) {
      await page.getByRole('button', { name: surface.button, exact: true }).click();
    } else {
      // Actions is intentionally hidden from the current navigation, but its
      // documented hash route and content remain shipped and must stay sound.
      await page.evaluate(hash => { location.hash = `#${hash}`; }, surface.hash);
    }
    await expect(page).toHaveURL(new RegExp(`#${surface.hash}$`));
    const active = page.locator(`#tab-${surface.section}`);
    await expect(active).toHaveClass(/active/);
    await expect(active).toBeVisible();
    await expect(page.locator('.tab-content.active')).toHaveCount(1);
    await expect.poll(() => active.evaluate(node => node.textContent.trim().length)).toBeGreaterThan(20);

    const geometry = await page.evaluate(section => {
      const viewport = document.documentElement.clientWidth;
      const rect = document.querySelector(`#tab-${section}`).getBoundingClientRect();
      return {
        viewport,
        scrollWidth: document.documentElement.scrollWidth,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    }, surface.section);
    const label = surface.button || surface.section.toUpperCase();
    expect(geometry.scrollWidth, label).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.left, label).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, label).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.width, label).toBeGreaterThan(0);
  }
  expect(pageErrors).toEqual([]);
  expectNoExternalTraffic(externalAttempts);
});

for (const surface of surfaces) {
  test(`keyboard focus and WCAG AA rules remain intact on ${surface.section}`, async ({ page }) => {
    const { pageErrors, externalAttempts } = await openStaticTab(page, surface.hash, surface.section);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const focusIndicator = await page.locator(':focus').evaluate(element => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusIndicator.style).not.toBe('none');
    expect(focusIndicator.width).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    const results = await new AxeBuilder({ page })
      // Scan the active surface and the shared header/nav/footer. Hidden tabs
      // are ignored by axe and each becomes active in its own matrix case.
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const accessibilityDebt = results.violations.filter(({ id }) =>
      id === 'color-contrast' || id === 'target-size');
    expect(
      accessibilityDebt,
      `${surface.button}\n${accessibilityDebt.map(v => `${v.id}: ${v.nodes.length} nodes`).join('\n')}`,
    ).toEqual([]);
    const blocking = results.violations.filter(({ impact }) =>
      impact === 'critical' || impact === 'serious');
    expect(
      blocking,
      `${surface.button}\n${blocking.map(v => `${v.id}: ${v.help}`).join('\n')}`,
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
    expectNoExternalTraffic(externalAttempts);
  });
}
