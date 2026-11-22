import type { Page, WebSocketRoute } from '@playwright/test';
import { WORKSPACE_ROOT, workspaceResponse } from './fixtures/data';
import type { DaemonMock } from './fixtures/daemon';
import {
  acceptNextDialog,
  chooseWorkspace,
  expect,
  goToSection,
  openApp,
  switchEnv,
  test,
} from './fixtures/test';

const RUN_ID = 'run-e2e-123';
const WS_URL = `ws://localhost:7357/runs/${RUN_ID}`;

const composer = (page: Page) => page.getByRole('complementary', { name: 'Configure local run' });
const runConsole = (page: Page) => page.getByRole('region', { name: 'Run console localhost' });
const progress = (page: Page) => page.getByLabel('run progress');

/** The composer's flag row toggle, e.g. "Run model (--model)". */
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

const openLocalRun = async (page: Page, daemon: DaemonMock) => {
  daemon.on('GET', '/workspace', { json: workspaceResponse });
  await openApp(page);
  await switchEnv(page, 'localhost');
  await chooseWorkspace(page, WORKSPACE_ROOT);
  await expect(composer(page)).toBeVisible();
};

const selectSkill = async (page: Page, skillId: string) => {
  const skillRow = flagRow(page, 'Skill');
  if ((await skillRow.getAttribute('aria-expanded')) !== 'true') {
    await skillRow.click();
  }
  await composer(page).getByRole('button', { name: new RegExp(`^${skillId}`) }).click();
  await expect(skillRow).toContainText(skillId);
};

test.describe('hosted', () => {
  test('shows the localhost-only empty state with links to review and learn', async ({ page }) => {
    await openApp(page);

    const app = page.getByTestId('run-app');
    await expect(app).toHaveAttribute('data-env', 'hosted');
    await expect(page.getByTestId('run-empty-state-kicker')).toHaveText('Localhost only');
    await expect(app).toContainText('npm i -g arc-skill-eval');
    await expect(app).toContainText('arc-skill-eval run ./skills/my-skill --compare');
    await expect(composer(page)).toHaveCount(0);

    await app.getByRole('link', { name: 'import and review run JSON' }).click();
    await expect(page.getByTestId('section-nav-tab-review')).toHaveAttribute('aria-current', 'page');

    await goToSection(page, 'run');
    await page.getByTestId('run-app').getByRole('link', { name: 'evaluation guide' }).click();
    await expect(page.getByTestId('learn-app')).toBeVisible();
  });
});

test.describe('localhost composer', () => {
  test('with no workspace, shows the idle console and refuses to run without a skill', async ({
    page,
  }) => {
    await openApp(page);
    await switchEnv(page, 'localhost');

    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runConsole(page)).toContainText('arc-skill-eval run ./skills/<pick a workspace>');
    await expect(runConsole(page)).toContainText(
      '--model anthropic/claude-sonnet-4  --judge-model anthropic/claude-sonnet-4',
    );
    await expect(flagRow(page, 'Skill')).toHaveAttribute('aria-expanded', 'true');
    await expect(composer(page)).toContainText('No skills found in this workspace');
    await expect(composer(page)).toContainText('Last run: None');

    // Collapse the skill row, then try to run: the app alerts and re-opens it.
    await flagRow(page, 'Skill').click();
    await expect(flagRow(page, 'Skill')).toHaveAttribute('aria-expanded', 'false');

    const alertMessage = acceptNextDialog(page);
    await runButton(page).click();
    expect(await alertMessage).toBe('Choose a skill before starting the run.');
    await expect(flagRow(page, 'Skill')).toHaveAttribute('aria-expanded', 'true');
  });

  test('lists workspace skills and blocks skills without evals', async ({ page, daemon }) => {
    await openLocalRun(page, daemon);

    expect(daemon.requestsTo('GET', '/workspace')[0]?.query.get('root')).toBe(WORKSPACE_ROOT);
    await expect(composer(page)).toContainText(`Skills in ${WORKSPACE_ROOT}`);
    const commitsSkill = composer(page).getByRole('button', { name: /^arc-conventional-commits/ });
    const releaseSkill = composer(page).getByRole('button', { name: /^release-please/ });
    await expect(commitsSkill).toContainText('evals');
    await expect(releaseSkill).toContainText('no evals');

    await selectSkill(page, 'release-please');
    await expect(runButton(page)).toHaveText('▶ Create evals first');
    await expect(runButton(page)).toBeDisabled();

    await selectSkill(page, 'arc-conventional-commits');
    await expect(runButton(page)).toHaveText('▶ Run');
    await expect(runButton(page)).toBeEnabled();
    await expect(runConsole(page)).toContainText(
      'arc-skill-eval run /home/tester/src/skills/arc-conventional-commits',
    );
  });

  test('flag rows update the assembled CLI command', async ({ page, daemon }) => {
    await openLocalRun(page, daemon);
    await selectSkill(page, 'arc-conventional-commits');
    const command = runConsole(page);

    // Only one flag row is open at a time.
    await flagRow(page, 'Cases (--case)').click();
    await expect(flagRow(page, 'Cases (--case)')).toHaveAttribute('aria-expanded', 'true');
    await flagRow(page, 'Run model (--model)').click();
    await expect(flagRow(page, 'Cases (--case)')).toHaveAttribute('aria-expanded', 'false');
    await flagRow(page, 'Run model (--model)').click();

    await pickOption(page, 'Cases (--case)', 'case-fail');
    await expect(command).toContainText('--case case-fail');

    await pickOption(page, 'Run model (--model)', 'openai/gpt-5');
    await expect(command).toContainText('--model openai/gpt-5');

    await pickOption(page, 'Judge model (--judge-model)', 'anthropic/claude-opus-4');
    await expect(command).toContainText('--judge-model anthropic/claude-opus-4');

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

    // Extra skills: add two (Enter and button), ignore a duplicate, remove one.
    await flagRow(page, 'Additional skills (--extra-skill)').click();
    const extraInput = composer(page).getByRole('textbox', { name: 'Extra skill path' });
    await extraInput.fill('./skills/extra-one');
    await extraInput.press('Enter');
    await extraInput.fill('./skills/extra-two');
    await composer(page).getByRole('button', { name: /Add comparison skill/ }).click();
    await extraInput.fill('./skills/extra-one');
    await extraInput.press('Enter');
    await expect(flagRow(page, 'Additional skills (--extra-skill)')).toContainText(
      './skills/extra-one, ./skills/extra-two',
    );
    await expect(command).toContainText('--extra-skill ./skills/extra-one');
    await expect(command).toContainText('--extra-skill ./skills/extra-two');

    await composer(page).getByTitle('Remove comparison skill').filter({ hasText: 'extra-one' }).click();
    await expect(command).not.toContainText('--extra-skill ./skills/extra-one');
    await expect(command).toContainText('--extra-skill ./skills/extra-two');
  });
});

test.describe('localhost run console', () => {
  test('streams progress over the daemon WebSocket and shows the benchmark', async ({
    page,
    daemon,
  }) => {
    let server: WebSocketRoute | undefined;
    await page.routeWebSocket(WS_URL, (ws) => {
      server = ws;
    });
    daemon.on('POST', '/runs', { json: { runId: RUN_ID, wsUrl: WS_URL } });

    await openLocalRun(page, daemon);
    await selectSkill(page, 'arc-conventional-commits');
    await pickOption(page, 'Comparison (--compare)', 'on');
    await runButton(page).click();

    // The run is accepted and the socket opens.
    await expect.poll(() => server !== undefined).toBe(true);
    await expect(runConsole(page)).toContainText(`console: ${RUN_ID}`);
    await expect(runButton(page)).toContainText('Running…');
    await expect(runConsole(page)).toContainText('running with_skill · without_skill');
    await expect(progress(page)).toContainText('all cases');

    const [postRun] = daemon.requestsTo('POST', '/runs');
    expect(postRun.body).toMatchObject({
      workspaceRoot: '/home/tester/src/skills/arc-conventional-commits',
      case: '*',
      model: 'anthropic/claude-sonnet-4',
      judgeModel: 'anthropic/claude-sonnet-4',
      compare: 'on',
      extraSkill: [],
      iteration: 1,
      contextMode: 'isolated',
      sandbox: 'none',
    });

    server!.send(
      JSON.stringify({ type: 'case.progress', caseId: 'case-pass', passed: 1, failed: 0, total: 3 }),
    );
    await expect(progress(page)).toContainText('case-pass');
    await expect(progress(page)).toContainText('1/3 assert');

    // A later event for the same case updates its row instead of adding one.
    server!.send(
      JSON.stringify({ type: 'case.progress', caseId: 'case-pass', passed: 3, failed: 0, total: 3 }),
    );
    server!.send(
      JSON.stringify({ type: 'case.progress', caseId: 'case-fail', passed: 0, failed: 1, total: 1 }),
    );
    await expect(progress(page)).toContainText('3/3 assert');
    await expect(progress(page)).toContainText('0/1 assert');
    await expect(progress(page).getByText('case-pass', { exact: true })).toHaveCount(1);

    server!.send(
      JSON.stringify({
        type: 'run.completed',
        runId: RUN_ID,
        passed: 1,
        total: 2,
        cost: 0.41,
        exitCode: 1,
        withSkill: 1,
        withoutSkill: 0,
        artifactPath: `evals-runs/${RUN_ID}`,
      }),
    );

    const consoleRegion = runConsole(page);
    await expect(consoleRegion).toContainText('run complete');
    await expect(consoleRegion).toContainText('1/2 passed');
    await expect(consoleRegion).toContainText('BENCHMARK');
    await expect(consoleRegion).toContainText('with_skill');
    await expect(consoleRegion).toContainText('without_skill');
    await expect(consoleRegion).toContainText('Δ +50.0%');
    await expect(consoleRegion).toContainText('exit code');
    await expect(consoleRegion).toContainText('≥1 assertion failed');
    await expect(consoleRegion).toContainText(`wrote evals-runs/${RUN_ID}`);
    await expect(runButton(page)).toHaveText('↻ Reset run');

    // The finished run id is remembered as the last run.
    await flagRow(page, 'Skill').click();
    await expect(composer(page)).toContainText(`Last run: ${RUN_ID}`);
    await flagRow(page, 'Skill').click();
  });

  const replayCompletedSnapshot = async (page: Page) => {
    // A socket that opens on an already-finished run gets a completed snapshot.
    await page.routeWebSocket(WS_URL, (ws) => {
      ws.send(
        JSON.stringify({
          type: 'run.snapshot',
          run: {
            runId: RUN_ID,
            status: 'completed',
            progress: [{ caseId: 'case-pass', passed: 2, failed: 0, total: 2 }],
          },
          passed: 1,
          total: 1,
          exitCode: 0,
        }),
      );
    });
  };

  test('a completed snapshot finishes the run; reset returns to idle', async ({ page, daemon }) => {
    await replayCompletedSnapshot(page);
    daemon.on('POST', '/runs', { json: { runId: RUN_ID, wsUrl: WS_URL } });

    await openLocalRun(page, daemon);
    await selectSkill(page, 'arc-conventional-commits');
    await runButton(page).click();

    await expect(runConsole(page)).toContainText('run complete');
    await expect(runConsole(page)).toContainText('1/1 passed');
    await expect(progress(page)).toContainText('case-pass');
    await expect(progress(page)).toContainText('2/2 assert');
    await expect(runConsole(page)).toContainText('all assertions passed');
    await expect(runConsole(page)).toContainText(`evals-runs/${RUN_ID}`);
    await expect(runButton(page)).toHaveText('↻ Reset run');

    await runButton(page).click();
    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runConsole(page)).not.toContainText('BENCHMARK');
    await expect(progress(page)).toBeEmpty();
    await expect(runButton(page)).toHaveText('▶ Run');
  });

  test('a completed run links to browse', async ({ page, daemon }) => {
    await replayCompletedSnapshot(page);
    daemon.on('POST', '/runs', { json: { runId: RUN_ID, wsUrl: WS_URL } });

    await openLocalRun(page, daemon);
    await selectSkill(page, 'arc-conventional-commits');
    await runButton(page).click();
    await expect(runConsole(page)).toContainText('run complete');

    await runConsole(page).getByRole('link', { name: /inspect in browse/ }).click();
    await expect(page.getByTestId('section-nav-tab-browse')).toHaveAttribute('aria-current', 'page');
  });

  test('cancelling a running run deletes it on the daemon and resets', async ({
    page,
    daemon,
  }) => {
    await page.routeWebSocket(WS_URL, () => {});
    daemon.on('POST', '/runs', { json: { runId: RUN_ID, wsUrl: WS_URL } });
    daemon.on('DELETE', `/runs/${RUN_ID}`, { json: { ok: true } });

    await openLocalRun(page, daemon);
    await selectSkill(page, 'arc-conventional-commits');
    await runButton(page).click();
    await expect(runButton(page)).toContainText('Running…');

    await runButton(page).click();
    await expect.poll(() => daemon.requestsTo('DELETE', `/runs/${RUN_ID}`).length).toBe(1);
    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runButton(page)).toHaveText('▶ Run');
  });

  test('a daemon rejection is surfaced and the console returns to idle', async ({
    page,
    daemon,
  }) => {
    daemon.on('POST', '/runs', { status: 400, json: { error: 'evals/evals.json not found' } });

    await openLocalRun(page, daemon);
    await selectSkill(page, 'arc-conventional-commits');

    const alertMessage = acceptNextDialog(page);
    await runButton(page).click();
    expect(await alertMessage).toBe('evals/evals.json not found');

    await expect(runConsole(page)).toContainText('no run yet');
    await expect(runButton(page)).toHaveText('▶ Run');
  });
});
