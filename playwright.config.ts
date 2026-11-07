import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// End-to-end tests run ONLY against the local emulators (project demo-tryline).
// The dev server is started here with explicit env vars, which take priority over any .env.local file.
const PORT = 5199;

const cached = join(homedir(), 'Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    actionTimeout: 20_000,
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    launchOptions: existsSync(cached) ? { executablePath: cached } : {},
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-tryline',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-tryline.firebaseapp.com',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    },
  },
});
