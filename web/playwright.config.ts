import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const useHostedServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

// The suite runs its own daemon on this port so a daemon you started for
// development (port 7357) is never touched. Keep in sync with
// tests/e2e/fixtures/local.ts.
const E2E_DAEMON_PORT = 7358;
const replayFixture = fileURLToPath(new URL('./tests/e2e/fixtures/replay.json', import.meta.url));

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
    : [
        {
          // The real daemon, with cases running on the library's replay
          // runtime (no model) and held for a moment so a test can cancel one.
          // It imports the library from the repository's dist/, so build it first.
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
          env: { VITE_DAEMON_URL: `http://localhost:${E2E_DAEMON_PORT}` },
        },
      ],
});
