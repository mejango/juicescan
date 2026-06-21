import { defineConfig } from 'vitest/config';

// jsdom so create-flow.js (which uses `el()`/document inside its helpers) imports cleanly; JSON imports
// (data/*.json) are handled by vite's transform.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    testTimeout: 20000,
  },
});
