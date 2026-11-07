import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Separate from vite.config.ts so the app build never sees these tests.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
