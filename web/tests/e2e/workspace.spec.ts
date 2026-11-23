import type { Page } from '@playwright/test';
import type { DaemonMock, DaemonRequest } from './fixtures/daemon';
import { chooseWorkspace, expect, openApp, reloadApp, switchEnv, test } from './fixtures/test';

const HOME = '/home/tester';

type Entry = { name: string; type: 'dir' | 'file'; isSkill?: boolean; hasEvalsRuns?: boolean };

/** In-memory filesystem served by the mocked `GET /fs`. */
const tree: Record<string, Entry[]> = {
  '/': [{ name: 'home', type: 'dir' }],
  '/home': [{ name: 'tester', type: 'dir' }],
  [HOME]: [
    { name: 'src', type: 'dir' },
    { name: 'notes.txt', type: 'file' },
  ],
  [`${HOME}/src`]: [{ name: 'skills', type: 'dir' }],
  [`${HOME}/src/skills`]: [
    { name: 'arc-conventional-commits', type: 'dir', isSkill: true, hasEvalsRuns: true },
    { name: 'release-please', type: 'dir', isSkill: true },
    { name: 'README.md', type: 'file' },
  ],
  [`${HOME}/empty`]: [],
};

const resolve = (raw: string | null) => {
  if (!raw) return HOME;
  const expanded = raw.startsWith('~') ? `${HOME}${raw.slice(1)}` : raw;
  return expanded.replace(/\/+$/, '') || '/';
};

const parentOf = (dir: string) => (dir === '/' ? null : dir.slice(0, dir.lastIndexOf('/')) || '/');

const fsHandler = ({ query }: DaemonRequest) => {
  const dir = resolve(query.get('path'));
  const entries = tree[dir];
  if (!entries) {
    return { json: { ok: false, path: dir, parent: parentOf(dir), error: 'directory not found', entries: [] } };
  }
  return {
    json: {
      ok: true,
      path: dir,
      parent: parentOf(dir),
      entries: entries.map((entry) => ({
        name: entry.name,
        path: dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`,
        type: entry.type,
        isSkill: entry.isSkill ?? false,
        hasEvalsRuns: entry.hasEvalsRuns ?? false,
      })),
    },
  };
};

const workspaceHandler = ({ query }: DaemonRequest) => {
  const root = query.get('root') ?? '';
  if (root.startsWith('github.com/')) {
    return {
      json: {
        ok: true,
        source: 'github',
        resolvedPath: `${HOME}/.cache/arc-skill-eval/${root.slice('github.com/'.length)}`,
        skills: [{ id: 'remote-skill', path: `${HOME}/.cache/remote-skill`, hasEvals: false }],
      },
    };
  }
  const dir = resolve(root);
  if (!tree[dir]) {
    return { json: { ok: false, source: 'local', resolvedPath: dir, error: 'directory not found' } };
  }
  return {
    json: {
      ok: true,
      source: 'local',
      resolvedPath: dir,
      skills: tree[dir]
        .filter((entry) => entry.isSkill)
        .map((entry) => ({ id: entry.name, path: `${dir}/${entry.name}`, hasEvals: true })),
    },
  };
};

const mockFilesystem = (daemon: DaemonMock) => {
  daemon.on('GET', '/fs', fsHandler);
  daemon.on('GET', '/workspace', workspaceHandler);
};

const dropdown = (page: Page) => page.getByTestId('workspace-dropdown');
const picker = (page: Page) => page.getByTestId('folder-picker');
const folderRow = (page: Page, name: string) =>
  picker(page).getByRole('button', { name: new RegExp(`^└?\\s*${name}/`) });

const openPicker = async (page: Page) => {
  await page.getByTestId('workspace-chip').click();
  await expect(dropdown(page)).toBeVisible();
  await dropdown(page).getByRole('button', { name: 'Choose a folder' }).click();
  await expect(picker(page)).toBeVisible();
};

const openLocalhost = async (page: Page) => {
  await openApp(page);
  await switchEnv(page, 'localhost');
};

test('folder picker browses the daemon filesystem and selects a directory', async ({
  page,
  daemon,
}) => {
  mockFilesystem(daemon);
  await openLocalhost(page);
  await openPicker(page);

  // With no workspace yet, the picker starts at the daemon's home directory.
  await expect(picker(page)).toContainText(HOME);
  await expect(folderRow(page, 'src')).toBeVisible();
  await expect(picker(page)).toContainText('notes.txt');

  await folderRow(page, 'src').click();
  await expect(picker(page)).toContainText(`${HOME}/src`);
  await folderRow(page, 'skills').click();
  await expect(picker(page)).toContainText(`${HOME}/src/skills`);
  await expect(folderRow(page, 'arc-conventional-commits')).toContainText('skill');
  await expect(folderRow(page, 'arc-conventional-commits')).toContainText('runs');
  await expect(folderRow(page, 'release-please')).toContainText('skill');
  await expect(folderRow(page, 'release-please')).not.toContainText('runs');

  await picker(page).getByRole('button', { name: 'parent directory' }).click();
  await expect(folderRow(page, 'skills')).toBeVisible();
  await folderRow(page, 'skills').click();

  await picker(page).getByRole('button', { name: /Select this directory/ }).click();
  await expect(dropdown(page)).toBeHidden();
  await expect(page.getByTestId('workspace-chip')).toContainText(`${HOME}/src/skills`);

  // The chosen directory is saved and its skills are listed.
  await page.getByTestId('workspace-chip').click();
  const saved = dropdown(page).getByRole('button', { name: `✓ ${HOME}/src/skills` });
  await expect(saved).toBeVisible();
  await expect(dropdown(page)).toContainText('└ arc-conventional-commits/');
  await expect(dropdown(page)).toContainText('└ release-please/');
});

test('folder picker: back, empty directories and the root', async ({ page, daemon }) => {
  mockFilesystem(daemon);
  await openLocalhost(page);
  await chooseWorkspace(page, '~/empty');

  // The picker opens at the current workspace.
  await openPicker(page);
  await expect(picker(page)).toContainText(`${HOME}/empty`);
  await expect(picker(page)).toContainText('This directory is empty');

  const up = picker(page).getByRole('button', { name: 'parent directory' });
  await up.click();
  await expect(folderRow(page, 'src')).toBeVisible();
  await up.click();
  await expect(folderRow(page, 'tester')).toBeVisible();
  await up.click();
  await expect(folderRow(page, 'home')).toBeVisible();
  // At the filesystem root there is no parent to go up to.
  await expect(up).toBeDisabled();

  await picker(page).getByRole('button', { name: 'Back to saved directories' }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(dropdown(page)).toContainText('Saved directories');
});

test('a stale workspace is flagged and the picker falls back to an ancestor', async ({
  page,
  daemon,
}) => {
  mockFilesystem(daemon);
  await openLocalhost(page);
  await chooseWorkspace(page, '~/gone/skills');

  await page.getByTestId('workspace-chip').click();
  await expect(dropdown(page)).toContainText('✗ directory not found');
  await expect(page.getByTestId('workspace-chip').getByTitle(/directory not found/)).toBeVisible();

  await dropdown(page).getByRole('button', { name: 'Choose a folder' }).click();
  await expect(picker(page)).toContainText(`✗ directory not found. Showing ${HOME}`);
  await expect(folderRow(page, 'src')).toBeVisible();
  await expect(picker(page).getByRole('button', { name: /Select this directory/ })).toBeEnabled();

  // Navigating into a missing folder from a good listing keeps the listing.
  daemon.on('GET', '/fs', (request) =>
    request.query.get('path') === `${HOME}/src`
      ? { json: { ok: false, path: `${HOME}/src`, parent: HOME, error: 'permission denied', entries: [] } }
      : fsHandler(request),
  );
  await folderRow(page, 'src').click();
  await expect(picker(page)).toContainText('✗ permission denied');
  await expect(folderRow(page, 'src')).toBeVisible();
});

test('with the daemon offline the picker says so', async ({ page }) => {
  await openLocalhost(page);
  await openPicker(page);

  await expect(picker(page)).toContainText('daemon offline');
  await expect(picker(page).getByRole('button', { name: /Select this directory/ })).toBeDisabled();
});

test('a GitHub reference is resolved by the daemon and labelled', async ({ page, daemon }) => {
  mockFilesystem(daemon);
  await openLocalhost(page);
  await chooseWorkspace(page, 'github.com/acme/skills');

  await page.getByTestId('workspace-chip').click();
  await expect(dropdown(page)).toContainText('Cloned from GitHub');
  await expect(dropdown(page)).toContainText('└ remote-skill/');
  await expect(dropdown(page)).toContainText(`${HOME}/.cache/arc-skill-eval/acme/skills`);
  expect(daemon.requestsTo('GET', '/workspace').at(-1)?.query.get('root')).toBe(
    'github.com/acme/skills',
  );
});

test('saved directories persist, switch the workspace, and stale ones are pruned', async ({
  page,
  daemon,
}) => {
  mockFilesystem(daemon);
  await openLocalhost(page);
  await chooseWorkspace(page, `${HOME}/src/skills`);
  await chooseWorkspace(page, `${HOME}/empty`);

  await page.getByTestId('workspace-chip').click();
  await expect(dropdown(page).getByRole('button', { name: `✓ ${HOME}/empty` })).toBeVisible();
  await dropdown(page).getByRole('button', { name: `${HOME}/src/skills` }).click();
  await expect(dropdown(page)).toBeHidden();
  await expect(page.getByTestId('workspace-chip')).toContainText(`${HOME}/src/skills`);

  // Both survive a reload; the active one is restored.
  await reloadApp(page);
  await expect(page.getByTestId('workspace-chip')).toContainText(`${HOME}/src/skills`);
  await page.getByTestId('workspace-chip').click();
  await expect(dropdown(page).getByRole('button', { name: `✓ ${HOME}/src/skills` })).toBeVisible();
  await expect(dropdown(page).getByRole('button', { name: `${HOME}/empty` })).toBeVisible();
  await page.keyboard.press('Escape');

  // A saved directory that no longer exists is dropped on the next load.
  daemon.on('GET', '/fs', (request) =>
    resolve(request.query.get('path')) === `${HOME}/empty`
      ? { json: { ok: false, path: `${HOME}/empty`, parent: HOME, error: 'directory not found', entries: [] } }
      : fsHandler(request),
  );
  await reloadApp(page);
  await page.getByTestId('workspace-chip').click();
  await expect(dropdown(page).getByRole('button', { name: `✓ ${HOME}/src/skills` })).toBeVisible();
  await expect(dropdown(page).getByRole('button', { name: `${HOME}/empty` })).toHaveCount(0);
});
