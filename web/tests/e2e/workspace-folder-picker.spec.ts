import { expect, test } from '@playwright/test';

const STALE_WORKSPACE_ROOT = '~/src/skills';

test('browse folders stays navigable when workspace root is stale', async ({ page, request }) => {
  const daemonProbe = await request.get('http://127.0.0.1:7357/fs');
  if (!daemonProbe.ok()) {
    test.skip(true, 'daemon not running on port 7357');
    return;
  }

  await page.goto('/');
  await page.getByTestId('env-option-localhost').click();
  await page.getByTestId('workspace-chip').click();
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();

  const reference = page.getByRole('textbox', { name: 'reference a folder or github repo' });
  await reference.fill(STALE_WORKSPACE_ROOT);
  await reference.press('Enter');

  await page.getByTestId('workspace-chip').click();
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();
  await page.getByRole('button', { name: 'browse folders' }).click();
  await expect(page.getByTestId('folder-picker')).toBeVisible();

  await expect(page.getByRole('button', { name: 'parent directory' })).toBeEnabled();
  await expect(page.locator('.folder-picker-row').first()).toBeVisible();
});
