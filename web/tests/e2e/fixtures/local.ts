import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';

export const E2E_DAEMON_PORT = 7358;
export const E2E_DAEMON_URL = `http://localhost:${E2E_DAEMON_PORT}`;

export const usesDeployedApp = Boolean(process.env.PLAYWRIGHT_BASE_URL);

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(fixturesDir, '..', '..', '..');
const workspaceTemplate = path.join(fixturesDir, 'workspace');
export const workspacesDir = path.join(webDir, 'test-artifacts', 'e2e-workspaces');
const recordsDir = path.join(webDir, 'test-artifacts', 'e2e');

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

export const createWorkspace = async (testInfo: TestInfo): Promise<string> => {
  const target = path.join(workspacesDir, slug(`${path.basename(testInfo.file)}-${testInfo.title}`));
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(workspaceTemplate, target, { recursive: true });
  return target;
};

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export const readText = (file: string) => readFile(file, 'utf8');

export const recordArtifact = async (testInfo: TestInfo, record: unknown): Promise<void> => {
  const spec = path.basename(testInfo.file).replace(/\.spec\.ts$/, '');
  const name = slug(testInfo.titlePath.slice(1).join(' '));
  const file = path.join(recordsDir, spec, `${name}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
};

export const runSuite = async (
  request: APIRequestContext,
  workspace: string,
  skillDir: string,
  options: Readonly<{ compare?: boolean }> = {},
): Promise<string> => {
  expect((await request.get(`${E2E_DAEMON_URL}/workspace?root=${encodeURIComponent(workspace)}`)).ok()).toBe(true);
  const response = await request.post(`${E2E_DAEMON_URL}/runs`, {
    data: { workspaceRoot: skillDir, case: '*', compare: options.compare ? 'on' : 'off' },
  });
  expect(response.status()).toBe(201);
  const { runId } = (await response.json()) as { runId: string };
  await expect
    .poll(
      async () => ((await (await request.get(`${E2E_DAEMON_URL}/runs/${runId}`)).json()) as { status: string }).status,
      { timeout: 20_000 },
    )
    .toBe('completed');
  return runId;
};

export const relativeTo = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');
