import path from 'node:path';
import { createWorkspace, recordArtifact, usesDeployedApp } from './fixtures/local';
import { chooseWorkspace, expect, openApp, switchEnv, test } from './fixtures/test';

test.use({ mockDaemon: false });
test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

test('browse folders falls back to an existing ancestor when the workspace path is stale', async ({
  page,
}, testInfo) => {
  const workspace = await createWorkspace(testInfo);
  const stale = path.join(workspace, 'moved', 'away');

  await openApp(page);
  await switchEnv(page, 'localhost');
  await chooseWorkspace(page, stale);

  await page.getByTestId('workspace-chip').click();
  await expect(page.getByTestId('workspace-dropdown')).toBeVisible();
  await page.getByRole('button', { name: 'Choose a folder' }).click();
  const picker = page.getByTestId('folder-picker');
  await expect(picker).toBeVisible();

  await expect(picker).toContainText(`directory not found. Showing ${workspace}`);
  await expect(picker.locator('.folder-picker-row').filter({ hasText: 'skills' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'parent directory' })).toBeEnabled();

  await picker.locator('.folder-picker-row').filter({ hasText: 'skills' }).click();
  await expect(picker.locator('.folder-picker-row').filter({ hasText: 'alpha' })).toBeVisible();
  await recordArtifact(testInfo, {
    stale: path.relative(workspace, stale),
    fellBackTo: '<workspace>',
    listed: ['alpha', 'beta', 'gamma'],
  });
});
