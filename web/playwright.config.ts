import { defineConfig } from '@playwright/test';

const useHostedServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
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
