import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { DaemonMock } from './daemon';

export { expect };

type Options = {
  mockDaemon: boolean;
};

type Fixtures = {
  daemon: DaemonMock;
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

export const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(150);
};

export const openApp = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('global-header')).toBeVisible();
  await expect(page.getByTestId('status-bar')).toBeVisible();
  await settle(page);
};

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
  await settle(page);
};

export const switchEnv = async (page: Page, env: 'hosted' | 'localhost') => {
  await page.getByTestId(`env-option-${env}`).click();
  await expect(page.getByTestId(`env-option-${env}`)).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.env)).toBe(env);
};

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

export const acceptNextDialog = (page: Page) =>
  new Promise<string>((resolve) => {
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    });
  });
