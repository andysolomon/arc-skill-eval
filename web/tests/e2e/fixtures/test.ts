import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { DaemonMock } from './daemon';

export { expect };

type Options = {
  /**
   * When true (default) every request to the localhost daemon goes through
   * `DaemonMock`: registered endpoints answer, everything else is refused as if
   * the daemon were offline. Set false only for specs that probe a real daemon.
   */
  mockDaemon: boolean;
};

type Fixtures = {
  daemon: DaemonMock;
  /** Saves `web/test-artifacts/e2e/<spec>/<test>.png` after every test. */
  artifactScreenshot: void;
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const artifactPath = (testInfo: TestInfo) => {
  const webDir = path.dirname(testInfo.config.configFile ?? path.join(process.cwd(), 'x'));
  const spec = path.basename(testInfo.file).replace(/\.spec\.ts$/, '');
  // titlePath = [file, ...describe blocks, test title]
  const name = slug(testInfo.titlePath.slice(1).join(' '));
  return path.join(webDir, 'test-artifacts', 'e2e', spec, `${name}.png`);
};

export const test = base.extend<Fixtures & Options>({
  mockDaemon: [true, { option: true }],
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,

  page: async ({ page }, use) => {
    // Google Fonts is the only third-party request the app makes. Refuse it so
    // runs are hermetic and screenshots always use the same fallback font.
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.abort('blockedbyclient'),
    );
    await use(page);
  },

  daemon: async ({ page, mockDaemon }, use) => {
    const daemon = new DaemonMock(page);
    if (mockDaemon) {
      await daemon.install();
    }
    await use(daemon);
  },

  artifactScreenshot: [
    async ({ page, daemon }, use, testInfo) => {
      void daemon; // ensure daemon routing is installed for every test
      await use();

      if (page.isClosed() || testInfo.status === 'skipped') {
        return;
      }

      const file = artifactPath(testInfo);
      await mkdir(path.dirname(file), { recursive: true });
      await page
        .screenshot({ path: file, animations: 'disabled', caret: 'hide' })
        .catch(() => undefined);
    },
    { auto: true },
  ],
});

/**
 * Give the app a moment to hydrate persisted preferences (section, theme, env)
 * after a load. The shell renders defaults first and then applies stored
 * preferences asynchronously; an interaction in that window can be overwritten
 * by hydration, which no human user could hit but a test can.
 */
export const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(150);
};

/** Load the app and wait for the persisted shell state to hydrate. */
export const openApp = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('global-header')).toBeVisible();
  await expect(page.getByTestId('status-bar')).toBeVisible();
  await settle(page);
};

/** Reload like a user would: after pending preference writes have landed. */
export const reloadApp = async (page: Page) => {
  await settle(page);
  await page.reload();
  await expect(page.getByTestId('global-header')).toBeVisible();
  await settle(page);
};

export const goToSection = async (
  page: Page,
  section: 'run' | 'browse' | 'create' | 'review' | 'learn',
) => {
  await page.getByTestId(`section-nav-tab-${section}`).click();
  await expect(page.getByTestId(`section-nav-tab-${section}`)).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Sections hydrate their own persisted state (Create draft, Learn chapter)
  // on mount; let that land before interacting.
  await settle(page);
};

export const switchEnv = async (page: Page, env: 'hosted' | 'localhost') => {
  await page.getByTestId(`env-option-${env}`).click();
  await expect(page.getByTestId(`env-option-${env}`)).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.env)).toBe(env);
};

/** Point the localhost workspace chip at a directory, as a user would. */
export const chooseWorkspace = async (page: Page, reference: string) => {
  await page.getByTestId('workspace-chip').click();
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();
  const input = page.getByRole('textbox', {
    name: 'Enter a folder path or GitHub repository URL',
  });
  await input.fill(reference);
  await input.press('Enter');
  await expect(page.getByTestId('workspace-dropdown')).toBeHidden();
  await expect(page.getByTestId('workspace-chip')).toContainText(reference);
};

/**
 * Accept the next alert/confirm and resolve with its message. Register before
 * the action that opens it: an unhandled dialog would block that action.
 */
export const acceptNextDialog = (page: Page) =>
  new Promise<string>((resolve) => {
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    });
  });
