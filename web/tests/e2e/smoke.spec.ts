import { expect, test } from '@playwright/test';

const sectionCases = [
  { name: 'run', tab: 'section-nav-tab-run', screen: 'run-app', kicker: 'Localhost only' },
  { name: 'browse', tab: 'section-nav-tab-browse', screen: 'browse-empty-state', kicker: 'Hosted mode' },
  { name: 'create', tab: 'section-nav-tab-create', screen: 'create-app', kicker: 'step 01' },
  { name: 'review', tab: 'section-nav-tab-review', screen: 'review-empty-state', kicker: 'Import run JSON' },
  { name: 'learn', tab: 'section-nav-tab-learn', screen: 'learn-app', kicker: 'chapter 01' },
] as const;

const themes = ['tokyonight', 'gruvbox', 'nord'] as const;

test('five sections are reachable from section navigation', async ({ page }) => {
  await page.goto('/');

  for (const section of sectionCases) {
    await page.getByTestId(section.tab).click();
    await expect(page.getByTestId(section.screen)).toContainText(section.kicker);
  }
});

test('theme picker swaps the document theme', async ({ page }) => {
  await page.goto('/');

  for (const theme of themes) {
    await page.getByTestId(`theme-option-${theme}`).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(theme);
  }
});

test('reset hosted data clears persisted shell state and reloads', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('theme-option-nord').click();
  await page.getByTestId('section-nav-tab-learn').click();
  await expect(page.getByTestId('learn-app')).toBeVisible();

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await Promise.all([
    page.waitForEvent('load'),
    page.getByTestId('status-reset-hosted-data').click(),
  ]);

  await expect(page.getByTestId('run-app')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('tokyonight');
});
