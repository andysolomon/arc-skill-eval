import path from 'node:path';
import type { Page } from '@playwright/test';
import { ARTIFACT_PATH, featCommitArtifacts, runsForQuery } from './fixtures/data';
import type { DaemonMock } from './fixtures/daemon';
import { createWorkspace, recordArtifact, runSuite, usesDeployedApp } from './fixtures/local';
import { chooseWorkspace, expect, goToSection, openApp, switchEnv, test } from './fixtures/test';

const runsRail = (page: Page) => page.getByRole('complementary', { name: 'Runs Rail' });
const caseList = (page: Page) => page.getByRole('region', { name: 'Case List' });
const detail = (page: Page) => page.getByRole('region', { name: 'Selected case details' });
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Case detail tabs' }).getByRole('button', { name });

const selectTab = async (page: Page, name: string) => {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
};

const browseSampleRun = async (page: Page) => {
  await openApp(page);
  await goToSection(page, 'review');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await expect(page.getByTestId('review-app')).toBeVisible();
  await goToSection(page, 'browse');
  await expect(page.getByTestId('browse-app')).toBeVisible();
};

test.describe('hosted', () => {
  test('empty state points to Review for importing runs', async ({ page }) => {
    await openApp(page);
    await goToSection(page, 'browse');

    const empty = page.getByTestId('browse-empty-state');
    await expect(empty).toBeVisible();
    await expect(page.getByTestId('browse-empty-state-kicker')).toHaveText('Hosted mode');
    await expect(empty).toContainText('Import a run to browse results');
    await expect(page.getByTestId('browse-app')).toHaveCount(0);

    await empty.getByRole('link', { name: 'import run JSON in Review' }).click();
    await expect(page.getByTestId('review-empty-state')).toBeVisible();
  });

  test('imported runs are listed with the failing case selected', async ({ page }) => {
    await browseSampleRun(page);

    await expect(page.getByTestId('browsing-skill-sample-skill')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('browse-app')).toContainText('Browsing imported runs');

    await expect(runsRail(page)).toContainText('Runs');
    await expect(
      runsRail(page).getByRole('button', { name: 'select run sample-review-run' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(runsRail(page)).toContainText('1/2');

    await expect(caseList(page)).toContainText('1/2');
    await expect(caseList(page).getByRole('button')).toHaveCount(2);
    await expect(
      caseList(page).getByRole('button', { name: 'select case case-fail' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(detail(page).getByRole('heading', { level: 1 })).toHaveText('case-fail');
    await expect(detail(page).getByLabel('variant switch')).toHaveCount(0);
  });

  test('detail tabs render each view of the selected case', async ({ page }) => {
    await browseSampleRun(page);
    const surface = detail(page);

    await expect(tab(page, 'Overview')).toHaveAttribute('aria-current', 'page');
    await expect(surface).toContainText('FAIL');
    await expect(surface).toContainText('sample-skill / with_skill / case-fail');
    await expect(surface).toContainText('missing acceptance criteria');
    const kpis = surface.getByLabel('browse overview kpis');
    for (const label of ['tokens', 'cost', 'latency', 'ms/case']) {
      await expect(kpis).toContainText(label);
    }
    await expect(surface).toContainText(
      'Flag missing acceptance criteria before creating implementation work.',
    );

    await selectTab(page, 'Response');
    await expect(tab(page, 'Overview')).not.toHaveAttribute('aria-current', 'page');
    await expect(surface).toContainText('assistant.md / with_skill');
    await expect(surface).toContainText('The response skipped the checklist and moved directly to code.');

    await selectTab(page, 'Diff');
    await expect(surface).toContainText('This run has no comparison results.');

    await selectTab(page, 'Trace');
    await expect(surface).toContainText('turn 1');
    await expect(surface).toContainText('context manifest');
    await expect(surface).toContainText('assistant response');
    await expect(surface).toContainText('grading summary');

    await selectTab(page, 'Raw');
    const raw = surface.getByLabel('raw artifact json');
    await expect(raw).toContainText('"caseId": "case-fail"');
    await expect(raw).toContainText('"id": "sample-review-run"');
    await expect(raw).toContainText('"variant": "with_skill"');
  });

  test('cases are selectable by click, keyboard and j/k', async ({ page }) => {
    await browseSampleRun(page);
    const passCase = caseList(page).getByRole('button', { name: 'select case case-pass' });
    const failCase = caseList(page).getByRole('button', { name: 'select case case-fail' });
    const heading = detail(page).getByRole('heading', { level: 1 });

    await passCase.click();
    await expect(passCase).toHaveAttribute('aria-pressed', 'true');
    await expect(heading).toHaveText('case-pass');
    await expect(detail(page)).toContainText('PASS');

    await page.keyboard.press('j');
    await expect(heading).toHaveText('case-fail');
    await page.keyboard.press('j');
    await expect(heading).toHaveText('case-fail');
    await page.keyboard.press('k');
    await expect(heading).toHaveText('case-pass');
    await page.keyboard.press('k');
    await expect(heading).toHaveText('case-pass');

    await failCase.focus();
    await page.keyboard.press('Enter');
    await expect(failCase).toHaveAttribute('aria-pressed', 'true');
    await expect(heading).toHaveText('case-fail');
  });
});

test.describe('localhost with the real daemon', () => {
  test.use({ mockDaemon: false });
  test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

  test('reads a comparison run and its per-variant artifacts from disk', async ({ page, request }, testInfo) => {
    const workspace = await createWorkspace(testInfo);
    const alpha = path.join(workspace, 'skills', 'alpha');
    await runSuite(request, workspace, alpha, { compare: true });

    await openApp(page);
    await switchEnv(page, 'localhost');
    await chooseWorkspace(page, workspace);
    await goToSection(page, 'browse');
    await expect(page.getByTestId('browse-app')).toBeVisible();
    await expect(page.getByRole('group', { name: 'browsing skill' }).getByRole('button')).toHaveText(['alpha']);

    await caseList(page).getByRole('button', { name: 'select case eval-greets-the-user' }).click();
    const surface = detail(page);
    const variants = surface.getByLabel('variant switch');
    await expect(variants.getByRole('button')).toHaveText(['with_skill', 'without_skill']);
    await expect(surface).toContainText('PASS');

    await selectTab(page, 'Response');
    await expect(surface).toContainText('This answer comes from the replay runtime, not a model.');
    await selectTab(page, 'Raw');
    await expect(surface.getByLabel('raw artifact json')).toContainText('"case_id": "greets-the-user"');

    await recordArtifact(testInfo, { skill: 'alpha', compare: true, browsedCase: 'greets-the-user', verdict: 'PASS' });
  });
});

test.describe('localhost (daemon responses mocked)', () => {
  const mockDiskRuns = (daemon: DaemonMock) => {
    daemon.on('GET', '/runs', ({ query }) => ({ json: runsForQuery(query) }));
    daemon.on('GET', ARTIFACT_PATH, ({ path }) => {
      const [, runId, caseId, encodedKind] = ARTIFACT_PATH.exec(path) ?? [];
      const kind = decodeURIComponent(encodedKind ?? '');
      const body =
        runId === 'disk-run-compare' && caseId === 'feat-commit'
          ? featCommitArtifacts[kind]
          : undefined;
      return body === undefined ? { status: 404, text: `no artifact ${kind}` } : { text: body };
    });
  };

  const openLocalBrowse = async (page: Page) => {
    await openApp(page);
    await switchEnv(page, 'localhost');
    await goToSection(page, 'browse');
  };

  test('with the daemon offline, shows the local empty state', async ({ page }) => {
    await openLocalBrowse(page);

    await expect(page.getByTestId('browse-empty-state-kicker')).toHaveText('Localhost');
    await expect(page.getByTestId('browse-empty-state')).toContainText(
      'No local run artifacts found',
    );
    await expect(page.getByTestId('browse-empty-state')).toContainText('arc-skill-eval browse');
  });

  test('with no runs on disk, shows the local empty state', async ({ page, daemon }) => {
    daemon.on('GET', '/runs', { json: { runs: [] } });
    await openLocalBrowse(page);

    await expect(page.getByTestId('browse-empty-state')).toContainText(
      'No local run artifacts found',
    );
    await expect.poll(() => daemon.requestsTo('GET', '/runs').length).toBeGreaterThan(0);
  });

  test('reads runs and per-variant artifacts from the daemon', async ({ page, daemon }) => {
    mockDiskRuns(daemon);
    await openLocalBrowse(page);
    await expect(page.getByTestId('browse-app')).toBeVisible();
    await expect(page.getByTestId('browse-app')).toContainText('./evals-runs');

    const skillPicker = page.getByRole('group', { name: 'browsing skill' });
    await expect(skillPicker.getByRole('button')).toHaveText([
      'arc-conventional-commits',
      'release-please',
    ]);
    await expect(
      runsRail(page).getByRole('button', { name: 'select run disk-run-compare' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await caseList(page).getByRole('button', { name: 'select case feat-commit' }).click();
    const surface = detail(page);
    const variants = surface.getByLabel('variant switch');
    await expect(variants.getByRole('button')).toHaveText(['with_skill', 'without_skill']);
    await expect(variants.getByRole('button', { name: 'with_skill' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await expect(surface).toContainText('PASS');
    await expect(surface).toContainText('subject starts with feat(auth):');
    await expect(surface.getByLabel('browse overview kpis')).toContainText('1,234');
    await expect(surface.getByLabel('browse overview kpis')).toContainText('4321ms');
    await expect(surface).toContainText('Benchmark difference');

    await variants.getByRole('button', { name: 'without_skill' }).click();
    await expect(surface).toContainText('arc-conventional-commits / without_skill / feat-commit');
    await expect(surface).toContainText('FAIL');
    await expect(surface).toContainText('subject was "Add login form"');

    const requestedKinds = daemon
      .requestsTo('GET', ARTIFACT_PATH)
      .map((request) => decodeURIComponent(ARTIFACT_PATH.exec(request.path)?.[3] ?? ''));
    expect(requestedKinds).toEqual(
      expect.arrayContaining(['with_skill/grading.json', 'without_skill/timing.json']),
    );
    const artifactRequest = daemon.requestsTo('GET', ARTIFACT_PATH)[0];
    expect(artifactRequest.query.get('root')).toBe(
      '/home/tester/src/skills/arc-conventional-commits',
    );

    await selectTab(page, 'Response');
    await expect(surface).toContainText('assistant.md / without_skill');
    await expect(surface).toContainText('Add login form');
    await variants.getByRole('button', { name: 'with_skill' }).click();
    await expect(surface.getByRole('heading', { name: 'Commit message' })).toBeVisible();
    await expect(surface).toContainText('feat(auth): add login form');

    await selectTab(page, 'Diff');
    await expect(surface.getByLabel('with_skill response diff')).toContainText(
      'feat(auth): add login form',
    );
    await expect(surface.getByLabel('without_skill response diff')).toContainText('Add login form');

    await selectTab(page, 'Trace');
    await expect(surface).toContainText('trace / with_skill');
    await expect(surface).toContainText('bash x3');
    await expect(surface).toContainText('read x1');
    await expect(surface).toContainText('arc-conventional-commits x1');
    await expect(surface).toContainText('git:commit main');
    await expect(surface).toContainText('COMMIT_EDITMSG');

    await selectTab(page, 'Raw');
    await expect(surface.getByLabel('raw artifact json')).toContainText('"case_id":"feat-commit"');
  });

  test('missing artifacts surface the daemon error', async ({ page, daemon }) => {
    mockDiskRuns(daemon);
    await openLocalBrowse(page);

    await expect(detail(page).getByRole('heading', { level: 1 })).toHaveText('breaking-change');
    await expect(detail(page)).toContainText('no artifact with_skill/grading.json');

    await selectTab(page, 'Trace');
    await expect(detail(page)).toContainText('no artifact with_skill/tool-summary.json');
  });

  test('switching skills reloads runs for that skill', async ({ page, daemon }) => {
    mockDiskRuns(daemon);
    await openLocalBrowse(page);
    await expect(page.getByTestId('browse-app')).toBeVisible();

    await page.getByTestId('browsing-skill-release-please').click();
    await expect(page.getByTestId('browsing-skill-release-please')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(runsRail(page).getByRole('button')).toHaveCount(1);
    await expect(
      runsRail(page).getByRole('button', { name: 'select run disk-run-release' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(detail(page).getByRole('heading', { level: 1 })).toHaveText('configure-release');
    await expect
      .poll(() =>
        daemon.requestsTo('GET', '/runs').some((r) => r.query.get('skill') === 'release-please'),
      )
      .toBe(true);
  });
});
