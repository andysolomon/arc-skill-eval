import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { E2E_DAEMON_PORT, E2E_DAEMON_URL } from './tests/e2e/fixtures/local';

const useHostedServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

const replayFixture = fileURLToPath(new URL('./tests/e2e/fixtures/replay.json', import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173',
    headless: true,
  },
  webServer: useHostedServer
    ? undefined
    : [
        {
          command: 'npm --prefix .. run build && node daemon/src/index.mjs',
          url: `http://127.0.0.1:${E2E_DAEMON_PORT}/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            PORT: String(E2E_DAEMON_PORT),
            ARC_SKILL_EVAL_DAEMON_REPLAY: replayFixture,
            ARC_SKILL_EVAL_DAEMON_REPLAY_DELAY_MS: '700',
          },
        },
        {
          command: 'npm run build && npm run preview -- --port 4173 --strictPort',
          port: 4173,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { VITE_DAEMON_URL: E2E_DAEMON_URL },
        },
      ],
});
