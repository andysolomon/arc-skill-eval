import { defineConfig } from '@playwright/test';

const useHostedServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // Each test saves a screenshot to test-artifacts/e2e/<spec>/<test>.png (see
  // tests/e2e/fixtures/test.ts); setup clears the folder, teardown indexes it.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173',
    headless: true,
  },
  webServer: useHostedServer
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173',
        port: 4173,
        reuseExistingServer: true,
      },
});
