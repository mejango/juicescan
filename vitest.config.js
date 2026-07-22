import { defineConfig } from 'vitest/config';

// jsdom so create-flow.js (which uses `el()`/document inside its helpers) imports cleanly; JSON imports
// (data/*.json) are handled by vite's transform.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // Count every executable JavaScript module shipped from src/, including
      // entry points that a unit test never imports. Generated registry code is
      // intentionally still in scope because the browser executes it.
      include: ['src/**/*.js'],
      exclude: ['dist/**', 'coverage/**', 'test/**'],
      // The app intentionally ships generated ABIs and large DOM renderers. The
      // global floor is therefore an honest all-production baseline; tighter
      // floors protect protocol helpers and safety-critical client boundaries.
      thresholds: {
        statements: 18,
        branches: 15,
        functions: 18,
        lines: 22,
        'src/app.js': {
          statements: 55,
          branches: 43,
          functions: 55,
          lines: 60,
        },
        'src/component-base.js': {
          statements: 32,
          branches: 27,
          functions: 34,
          lines: 33,
        },
        'src/nft721-build.js': {
          statements: 85,
          branches: 70,
          functions: 95,
          lines: 95,
        },
        'src/ruleset-config.js': {
          statements: 85,
          branches: 70,
          functions: 75,
          lines: 90,
        },
        'src/ruleset-ui.js': {
          statements: 80,
          branches: 45,
          functions: 55,
          lines: 80,
        },
        'src/pay-component.js': {
          statements: 44,
          branches: 45,
          functions: 50,
          lines: 50,
        },
        'src/relayr.js': {
          statements: 55,
          branches: 48,
          functions: 85,
          lines: 60,
        },
        'src/relayr-ui.js': {
          statements: 100,
          branches: 88,
          functions: 100,
          lines: 100,
        },
        'src/safe-app.js': {
          statements: 60,
          branches: 55,
          functions: 65,
          lines: 70,
        },
        'src/safe.js': {
          statements: 60,
          branches: 46,
          functions: 80,
          lines: 72,
        },
        'src/tokens.js': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/wallet.js': {
          statements: 68,
          branches: 49,
          functions: 70,
          lines: 76,
        },
        'src/wallet-links.js': {
          statements: 85,
          branches: 65,
          functions: 95,
          lines: 95,
        },
        'src/form.js': {
          statements: 80,
          branches: 68,
          functions: 75,
          lines: 90,
        },
        'src/learn-build.js': {
          statements: 95,
          branches: 60,
          functions: 90,
          lines: 98,
        },
      },
    },
  },
});
