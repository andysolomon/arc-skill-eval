import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { createWorkspace, E2E_DAEMON_URL, recordArtifact, relativeTo, usesDeployedApp } from './fixtures/local';
import {
  acceptNextDialog,
  chooseWorkspace,
  expect,
  goToSection,
  openApp,
  switchEnv,
  test,
} from './fixtures/test';

const composer = (page: Page) => page.getByRole('complementary', { name: 'Configure local run' });
const runConsole = (page: Page) => page.getByRole('region', { name: 'Run console localhost' });
const progress = (page: Page) => page.getByLabel('run progress');
const progressRow = (page: Page, caseId: string) =>
  progress(page).getByTestId('run-progress-row').filter({ hasText: caseId });

const flagRow = (page: Page, label: string) =>
  composer(page).getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}`) });

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const runButton = (page: Page) =>
  composer(page).getByRole('button', { name: /^(▶|↻|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])/ });

const pickOption = async (page: Page, row: string, option: string) => {
  await flagRow(page, row).click();
  await expect(flagRow(page, row)).toHaveAttribute('aria-expanded', 'true');
  await composer(page).getByRole('button', { name: option, exact: true }).click();
  await expect(flagRow(page, row)).toHaveAttribute('aria-expanded', 'false');
  await expect(flagRow(page, row)).toContainText(option);
};

const selectSkill = async (page: Page, skillId: string) => {
  const skillRow = flagRow(page, 'Skill');
  if ((await skillRow.getAttribute('aria-expanded')) !== 'true') {
    await skillRow.click();
  }
  await composer(page).getByRole('button', { name: new RegExp(`^${skillId}`) }).click();
  await expect(skillRow).toContainText(skillId);
};

const consoleRunId = async (page: Page): Promise<string> => {
  await expect(runConsole(page)).toContainText(/console: [0-9a-f-]{36}/);
  const text = (await runConsole(page).textContent()) ?? '';
  return /console: ([0-9a-f-]{36})/.exec(text)?.[1] ?? '';
};

const runDirs = async (skillDir: string) =>
  (await readdir(path.join(skillDir, 'evals-runs')).catch(() => [] as string[])).sort();

const readGrading = async (file: string) =>
  JSON.parse(await readFile(file, 'utf8')) as { case_id: string; summary: { passed: number; failed: number; total: number } };

test.describe('hosted', () => {
  test('shows the localhost-only empty state with links to review and learn', async ({ page }) => {
    await openApp(page);

    const app = page.getByTestId('run-app');
    await expect(app).toHaveAttribute('data-env', 'hosted');
    await expect(page.getByTestId('run-empty-state-kicker')).toHaveText('Localhost only');
    await expect(app).toContainText('npm i -g arc-skill-eval');
    await expect(app).toContainText('arc-skill-eval run ./skills/my-skill --compare');
    await expect(composer(page)).toHaveCount(0);
    await expect(page.getByTestId('status-bar')).not.toContainText('judge');

    await app.getByRole('link', { name: 'import and review run JSON' }).click();
    await expect(page.getByTestId('section-nav-tab-review')).toHaveAttribute('aria-current', 'page');

    await goToSection(page, 'run');
    await page.getByTestId('run-app').getByRole('link', { name: 'evaluation guide' }).click();
    await expect(page.getByTestId('learn-app')).toBeVisible();
  });
});

test.describe('localhost composer, daemon offline', () => {
  test('with no workspace, shows the idle console and refuses to run without a skill', async ({ page }) => {
    await openApp(page);
    await switchEnv(page, 'localhost');

    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runConsole(page)).toContainText('arc-skill-eval run ./skills/<pick a workspace>');
    await expect(runConsole(page)).not.toContainText('--model');
    await expect(page.getByTestId('status-bar')).toContainText('daemon offline');
    await expect(flagRow(page, 'Skill')).toHaveAttribute('aria-expanded', 'true');
    await expect(composer(page)).toContainText('No skills found in this workspace');
    await expect(composer(page)).toContainText('Last run: None');

    await flagRow(page, 'Skill').click();
    await expect(flagRow(page, 'Skill')).toHaveAttribute('aria-expanded', 'false');

    const alertMessage = acceptNextDialog(page);
    await runButton(page).click();
    expect(await alertMessage).toBe('Choose a skill before starting the run.');
    await expect(flagRow(page, 'Skill')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('localhost with the real daemon', () => {
  test.use({ mockDaemon: false });
  test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

  let workspace = '';
  let alpha = '';

  test.beforeEach(async ({ page }, testInfo) => {
    workspace = await createWorkspace(testInfo);
    alpha = path.join(workspace, 'skills', 'alpha');
    await openApp(page);
    await switchEnv(page, 'localhost');
    await chooseWorkspace(page, workspace);
    await expect(composer(page)).toBeVisible();
  });

  test('lists workspace skills, their cases and the default models', async ({ page }) => {
    await expect(composer(page)).toContainText(`Skills in ${workspace}`);
    await expect(composer(page).getByRole('button', { name: /^alpha/ })).toContainText('evals');
    await expect(composer(page).getByRole('button', { name: /^beta/ })).toContainText('no evals');

    await expect(page.getByTestId('status-bar')).toContainText('replay/scripted');
    await expect(page.getByTestId('status-bar')).toContainText('judge replay/scripted');

    await selectSkill(page, 'beta');
    await expect(runButton(page)).toHaveText('▶ Create evals first');
    await expect(runButton(page)).toBeDisabled();

    await selectSkill(page, 'alpha');
    await expect(runButton(page)).toHaveText('▶ Run');
    await expect(runConsole(page)).toContainText(`arc-skill-eval run ${alpha}`);
    await expect(flagRow(page, 'Run model (--model)')).toContainText('default (replay/scripted)');

    await flagRow(page, 'Cases (--case)').click();
    for (const option of ['* (all cases)', 'greets-the-user', 'writes-a-report']) {
      await expect(composer(page).getByRole('button', { name: option, exact: true })).toBeVisible();
    }
    await flagRow(page, 'Cases (--case)').click();
  });

  test('flag rows update the assembled CLI command', async ({ page }) => {
    await selectSkill(page, 'alpha');
    const command = runConsole(page);

    await flagRow(page, 'Cases (--case)').click();
    await expect(flagRow(page, 'Cases (--case)')).toHaveAttribute('aria-expanded', 'true');
    await flagRow(page, 'Run model (--model)').click();
    await expect(flagRow(page, 'Cases (--case)')).toHaveAttribute('aria-expanded', 'false');
    await flagRow(page, 'Run model (--model)').click();

    await pickOption(page, 'Cases (--case)', 'writes-a-report');
    await expect(command).toContainText('--case writes-a-report');

    await pickOption(page, 'Run model (--model)', 'openai/gpt-5');
    await expect(command).toContainText('--model openai/gpt-5');
    await expect(flagRow(page, 'Judge model (--judge-model)')).toContainText('default (openai/gpt-5)');

    await pickOption(page, 'Judge model (--judge-model)', 'anthropic/claude-opus-4-5');
    await expect(command).toContainText('--judge-model anthropic/claude-opus-4-5');

    await expect(command).not.toContainText('--compare');
    await pickOption(page, 'Comparison (--compare)', 'on');
    await expect(command).toContainText('--compare');
    await expect(runButton(page)).toHaveText('▶ Run with comparison');

    await pickOption(page, 'Iterations (--iteration)', '3');
    await expect(command).toContainText('--iteration 3');

    await pickOption(page, 'Context (--context-mode)', 'ambient');
    await expect(command).toContainText('--context-mode ambient');

    await pickOption(page, 'Sandbox (--sandbox)', 'just-bash');
    await expect(command).toContainText('--sandbox just-bash');

    await flagRow(page, 'Additional skills (--extra-skill)').click();
    const extraInput = composer(page).getByRole('textbox', { name: 'Extra skill path' });
    await extraInput.fill('../beta');
    await extraInput.press('Enter');
    await extraInput.fill('../gamma');
    await composer(page).getByRole('button', { name: /Add comparison skill/ }).click();
    await extraInput.fill('../beta');
    await extraInput.press('Enter');
    await expect(flagRow(page, 'Additional skills (--extra-skill)')).toContainText('../beta, ../gamma');
    await expect(command).toContainText('--extra-skill ../beta');
    await expect(command).toContainText('--extra-skill ../gamma');

    await composer(page).getByTitle('Remove comparison skill').filter({ hasText: 'beta' }).click();
    await expect(command).not.toContainText('--extra-skill ../beta');
    await expect(command).toContainText('--extra-skill ../gamma');
  });

  test('runs the suite, streams case progress and writes artifacts', async ({ page }, testInfo) => {
    await selectSkill(page, 'alpha');
    await runButton(page).click();

    const runId = await consoleRunId(page);
    await expect(runButton(page)).toContainText('select to cancel');

    await expect(progressRow(page, 'writes-a-report')).toBeVisible();
    await expect(progressRow(page, 'greets-the-user')).toHaveAttribute('data-phase', 'pass');
    await expect(progressRow(page, 'greets-the-user')).toContainText('1/1 assert');
    await expect(progressRow(page, 'writes-a-report')).toHaveAttribute('data-phase', 'fail');
    await expect(progressRow(page, 'writes-a-report')).toContainText('1/2 assert');
    await expect(progress(page).getByText('all cases')).toHaveCount(0);

    const consoleRegion = runConsole(page);
    await expect(consoleRegion).toContainText('run complete');
    await expect(consoleRegion).toContainText('1/2 passed');
    await expect(consoleRegion).toContainText('≥1 assertion failed');
    await expect(consoleRegion).not.toContainText('BENCHMARK');
    await expect(runButton(page)).toHaveText('↻ Reset run');

    const [runDir] = await runDirs(alpha);
    expect(runDir).toBeTruthy();
    await expect(consoleRegion).toContainText(`wrote ${path.join(alpha, 'evals-runs', runDir!)}`);
    const greets = await readGrading(path.join(alpha, 'evals-runs', runDir!, 'eval-greets-the-user', 'grading.json'));
    const report = await readGrading(path.join(alpha, 'evals-runs', runDir!, 'eval-writes-a-report', 'grading.json'));
    expect(greets.summary).toMatchObject({ passed: 1, failed: 0, total: 1 });
    expect(report.summary).toMatchObject({ passed: 1, failed: 1, total: 2 });

    await flagRow(page, 'Skill').click();
    await expect(composer(page)).toContainText(`Last run: ${runId}`);
    await flagRow(page, 'Skill').click();

    await runButton(page).click();
    await expect(runConsole(page)).toContainText('no run yet');
    await expect(progress(page)).toBeEmpty();

    await recordArtifact(testInfo, {
      skill: 'alpha',
      runDir: relativeTo(workspace, path.join(alpha, 'evals-runs', runDir!)).replace(runDir!, '<run>'),
      cases: { [greets.case_id]: greets.summary, [report.case_id]: report.summary },
    });
  });

  test('a comparison run reports both sides and the delta', async ({ page }, testInfo) => {
    await selectSkill(page, 'alpha');
    await pickOption(page, 'Comparison (--compare)', 'on');
    await runButton(page).click();
    await expect(runConsole(page)).toContainText('running with_skill and without_skill');

    const consoleRegion = runConsole(page);
    await expect(consoleRegion).toContainText('run complete', { timeout: 15_000 });
    await expect(consoleRegion).toContainText('BENCHMARK');
    await expect(consoleRegion).toContainText('Δ +0.0%');

    const [runDir] = await runDirs(alpha);
    const variants = await readdir(path.join(alpha, 'evals-runs', runDir!, 'eval-greets-the-user'));
    expect(variants).toEqual(expect.arrayContaining(['with_skill', 'without_skill']));
    await recordArtifact(testInfo, { skill: 'alpha', compare: true, greetsVariants: variants.sort() });
  });

  test('a single case runs alone', async ({ page }) => {
    await selectSkill(page, 'alpha');
    await pickOption(page, 'Cases (--case)', 'writes-a-report');
    await runButton(page).click();

    await expect(runConsole(page)).toContainText('run complete');
    await expect(runConsole(page)).toContainText('0/1 passed');
    await expect(progress(page).getByTestId('run-progress-row')).toHaveCount(1);
    await expect(progressRow(page, 'writes-a-report')).toHaveAttribute('data-phase', 'fail');
  });

  test('cancel stops the run on the daemon', async ({ page, request }, testInfo) => {
    await selectSkill(page, 'alpha');
    await runButton(page).click();
    const runId = await consoleRunId(page);
    await expect(progressRow(page, 'greets-the-user')).toHaveAttribute('data-phase', 'running');

    await runButton(page).click();
    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runButton(page)).toHaveText('▶ Run');

    await expect
      .poll(async () => ((await (await request.get(`${E2E_DAEMON_URL}/runs/${runId}`)).json()) as { status: string }).status)
      .toBe('cancelled');
    const state = (await (await request.get(`${E2E_DAEMON_URL}/runs/${runId}`)).json()) as {
      progress: Array<{ caseId: string; phase: string }>;
    };
    expect(state.progress.find((row) => row.caseId === 'writes-a-report')?.phase).not.toBe('fail');

    await recordArtifact(testInfo, {
      status: 'cancelled',
      phases: Object.fromEntries(state.progress.map((row) => [row.caseId, row.phase])),
    });
  });

  test('a daemon rejection is surfaced and the console returns to idle', async ({ page }) => {
    await selectSkill(page, 'alpha');
    await rm(path.join(alpha, 'evals', 'evals.json'));

    const alertMessage = acceptNextDialog(page);
    await runButton(page).click();
    expect(await alertMessage).toBe('This skill has no evals/evals.json to run. Author an eval suite first.');

    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runButton(page)).toHaveText('▶ Run');
  });

  test('a completed run links to browse', async ({ page }) => {
    await selectSkill(page, 'alpha');
    await pickOption(page, 'Cases (--case)', 'greets-the-user');
    await runButton(page).click();
    await expect(runConsole(page)).toContainText('run complete');
    await expect(runConsole(page)).toContainText('all assertions passed');

    await runConsole(page).getByRole('link', { name: /inspect in browse/ }).click();
    await expect(page.getByTestId('section-nav-tab-browse')).toHaveAttribute('aria-current', 'page');
  });
});
