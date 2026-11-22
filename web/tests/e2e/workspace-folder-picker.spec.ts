import { expect, test } from './fixtures/test';

const STALE_WORKSPACE_ROOT = '~/src/skills';

// This spec talks to a real daemon when one is running, so don't mock it.
test.use({ mockDaemon: false });

test('browse folders stays navigable when workspace root is stale', async ({ page, request }) => {
  // The daemon is localhost-only chrome and is not started in CI. `request.get`
  // throws on ECONNREFUSED rather than returning a non-ok response, so the probe
  // has to be guarded — otherwise an absent daemon fails the run instead of skipping.
  const daemonUp = await request
    .get('http://127.0.0.1:7357/fs')
    .then((probe) => probe.ok())
    .catch(() => false);

  test.skip(!daemonUp, 'daemon not running on port 7357');

  await page.goto('/');
  await page.getByTestId('env-option-localhost').click();
  await page.getByTestId('workspace-chip').click();
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();

  const reference = page.getByRole('textbox', { name: 'Enter a folder path or GitHub repository URL' });
  await reference.fill(STALE_WORKSPACE_ROOT);
  await reference.press('Enter');

  await page.getByTestId('workspace-chip').click();
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();
  await page.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(page.getByTestId('folder-picker')).toBeVisible();

  await expect(page.getByRole('button', { name: 'parent directory' })).toBeEnabled();
  await expect(page.locator('.folder-picker-row').first()).toBeVisible();
});
