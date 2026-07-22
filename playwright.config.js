import { defineConfig, devices } from '@playwright/test';

const appPort = Number(process.env.PLAYWRIGHT_APP_PORT || 4181);
const appOrigin = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: './test/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: appOrigin,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium', viewport: { width: 768, height: 1024 }, reducedMotion: 'reduce' } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' } },
    { name: 'narrow', use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium', viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' } },
  ],
  webServer: {
    command: 'node test/serve-dist.mjs',
    url: `${appOrigin}/index.html`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(appPort) },
  },
});
