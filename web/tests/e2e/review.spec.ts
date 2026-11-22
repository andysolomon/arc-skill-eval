import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { localhostRuns, runsForQuery } from './fixtures/data';
import {
  acceptNextDialog,
  expect,
  goToSection,
  openApp,
  reloadApp,
  switchEnv,
  test,
} from './fixtures/test';

const REVIEW_RUNS_FIXTURE = path.join(import.meta.dirname, 'fixtures', 'review-runs.json');

const importPanelResult = (page: Page) => page.getByLabel('import inspection result');
const pasteBox = (page: Page) => page.getByRole('textbox', { name: 'paste arc-skill-eval json' });
const runsRail = (page: Page) => page.getByRole('complementary', { name: 'Review runs' });
const summary = (page: Page) => page.getByRole('region', { name: 'review.html' });
const feedbackPanel = (page: Page) =>
  page.getByRole('complementary', { name: 'Feedback and proposed changes' });
const noteBox = (page: Page) => page.getByRole('textbox', { name: 'feedback note' });
const recordButton = (page: Page) => page.getByRole('button', { name: 'record feedback' });

const openReview = async (page: Page) => {
  await openApp(page);
  await goToSection(page, 'review');
};

const loadSample = async (page: Page) => {
  await page.getByRole('button', { name: 'Load sample' }).click();
  await expect(page.getByTestId('review-app')).toBeVisible();
};

const inspectPasted = async (page: Page, json: unknown) => {
  await pasteBox(page).fill(typeof json === 'string' ? json : JSON.stringify(json));
  await page.getByRole('button', { name: 'Inspect JSON' }).click();
};

test.describe('hosted import', () => {
  test('empty state offers file, paste and sample import', async ({ page }) => {
    await openReview(page);

    const empty = page.getByTestId('review-empty-state');
    await expect(empty).toBeVisible();
    await expect(page.getByTestId('review-empty-state-kicker')).toHaveText('Import run JSON');
    await expect(page.getByLabel('accepted import files')).toHaveText(
      /evals\.json.*grading\.json.*benchmark\.json.*timing\.json.*feedback\.json/,
    );
    await expect(empty.getByText('Choose JSON file')).toBeVisible();
    await expect(pasteBox(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load sample' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Review workspace' })).toHaveCount(0);
  });

  test('load sample imports a run and opens the review workspace', async ({ page }) => {
    await openReview(page);
    await loadSample(page);

    await expect(importPanelResult(page)).toContainText('parses as JSON');
    await expect(importPanelResult(page)).toContainText('recognized as run results');
    await expect(importPanelResult(page)).toContainText('✓ run results');
    await expect(importPanelResult(page)).toContainText('2 cases · sample-skill');
    await expect(pasteBox(page)).toHaveValue(/"id": "sample-review-run"/);

    await expect(page.getByTestId('reviewing-skill-sample-skill')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const run = runsRail(page).getByRole('button', { name: 'select run sample-review-run' });
    await expect(run).toHaveAttribute('aria-pressed', 'true');
    await expect(run).toContainText('sample-skill');
    await expect(run).toContainText('1/2');
    await expect(run).toContainText('$0.41');
    await expect(run).toContainText('exit 1');

    await expect(summary(page)).toContainText('sample-skill');
    await expect(summary(page)).toContainText('1/2 passed');
    // The failing case is selected first and shows its evidence.
    const failCase = summary(page).getByRole('button', { name: 'select case case-fail' });
    const passCase = summary(page).getByRole('button', { name: 'select case case-pass' });
    await expect(failCase).toHaveAttribute('aria-pressed', 'true');
    await expect(failCase).toContainText('missing acceptance criteria');
    await expect(passCase).toContainText('Δ +66.7%');
    await expect(passCase).toContainText('3/3');
    await expect(feedbackPanel(page)).toContainText('feedback.json: case-fail');

    await passCase.click();
    await expect(passCase).toHaveAttribute('aria-pressed', 'true');
    await expect(failCase).toHaveAttribute('aria-pressed', 'false');
    await expect(feedbackPanel(page)).toContainText('feedback.json: case-pass');

    // Keyboard selection works on the case cards too.
    await failCase.focus();
    await page.keyboard.press('Enter');
    await expect(failCase).toHaveAttribute('aria-pressed', 'true');
  });

  test('importing a JSON file with several runs and skills', async ({ page }) => {
    await openReview(page);

    await page.locator('input[type="file"]').setInputFiles(REVIEW_RUNS_FIXTURE);
    await expect(page.getByTestId('review-app')).toBeVisible();
    await expect(importPanelResult(page)).toContainText('5 cases · arc-conventional-commits');
    await expect(pasteBox(page)).toHaveValue(/commits-run-2/);

    const skillPicker = page.getByRole('group', { name: 'reviewing skill' });
    await expect(skillPicker.getByRole('button')).toHaveText([
      'arc-conventional-commits',
      'arc-creating-evals',
    ]);
    await expect(page.getByTestId('reviewing-skill-arc-conventional-commits')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Runs are filtered to the selected skill; the first (imported) run is selected.
    const rail = runsRail(page);
    await expect(rail.getByRole('button')).toHaveCount(2);
    await expect(rail.getByRole('button', { name: 'select run commits-run-2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(summary(page)).toContainText('1/3 passed');
    await expect(
      summary(page).getByRole('button', { name: 'select case breaking-change' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toContainText('missing BREAKING CHANGE footer');
    await expect(summary(page).getByRole('button', { name: 'select case docs-only' })).toContainText(
      'n/a',
    );

    await rail.getByRole('button', { name: 'select run commits-run-1' }).click();
    await expect(summary(page)).toContainText('1/1 passed');

    await page.getByTestId('reviewing-skill-arc-creating-evals').click();
    await expect(rail.getByRole('button')).toHaveCount(1);
    await expect(rail.getByRole('button', { name: 'select run evals-run-1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(summary(page)).toContainText('arc-creating-evals');
  });

  test('pasted JSON is inspected: invalid, suite, artifacts and malformed runs', async ({
    page,
  }) => {
    await openReview(page);

    await inspectPasted(page, '{not json');
    await expect(importPanelResult(page).getByRole('alert')).toContainText('Not valid JSON');
    await expect(page.getByTestId('review-empty-state')).toBeVisible();

    await inspectPasted(page, {
      skill_name: 'release-please',
      evals: [
        {
          id: 'configures',
          prompt: 'Set up releases',
          assertions: [{ type: 'file-exists', path: 'release-please-config.json' }],
        },
        { id: 'docs-only', prompt: 'Fix a typo, should not release', assertions: ['no release'] },
      ],
    });
    await expect(importPanelResult(page)).toContainText('has a skill_name');
    await expect(importPanelResult(page)).toContainText('every case has ≥1 assertion');
    await expect(importPanelResult(page)).toContainText('uses deterministic checks');
    await expect(importPanelResult(page)).toContainText('Recommended');
    await expect(importPanelResult(page)).toContainText('✓ evals.json · suite');
    await expect(importPanelResult(page)).toContainText('2 cases · release-please');
    // A suite is inspected, not imported as a run.
    await expect(page.getByTestId('review-empty-state')).toBeVisible();

    await inspectPasted(page, { skill_name: 'broken', evals: [{ id: 'no-prompt' }] });
    await expect(importPanelResult(page)).toContainText('every case has a prompt');
    await expect(importPanelResult(page)).not.toContainText('✓ evals.json · suite');

    await inspectPasted(page, {
      case_id: 'feat-commit',
      summary: { passed: 2, total: 3 },
      assertion_results: [],
    });
    await expect(importPanelResult(page)).toContainText('✓ grading.json');
    await expect(importPanelResult(page)).toContainText('2/3 passed · feat-commit');

    await inspectPasted(page, { with: 0.9, without: 0.4, delta: 0.5 });
    await expect(importPanelResult(page)).toContainText('✓ benchmark.json');

    await inspectPasted(page, { duration_ms: 1200, cost: 0.02 });
    await expect(importPanelResult(page)).toContainText('✓ timing.json');
    await expect(importPanelResult(page)).toContainText('1200ms · $0.02');

    await inspectPasted(page, { notes: ['a', 'b'] });
    await expect(importPanelResult(page)).toContainText('✓ feedback.json');
    await expect(importPanelResult(page)).toContainText('2 notes');

    await inspectPasted(page, { hello: 'world' });
    await expect(importPanelResult(page).getByRole('alert')).toContainText(
      'not a recognized arc-skill-eval JSON file',
    );

    await inspectPasted(page, { runs: [{ id: 'empty', cases: [] }] });
    await expect(importPanelResult(page)).toContainText('run results are well-formed');
    await expect(importPanelResult(page).getByRole('alert')).toContainText(
      'Import must include at least one run with cases.',
    );
    await expect(page.getByTestId('review-empty-state')).toBeVisible();
  });

  test('imported runs survive switching sections', async ({ page }) => {
    await openReview(page);
    await loadSample(page);

    await goToSection(page, 'learn');
    await goToSection(page, 'review');
    await expect(page.getByTestId('review-app')).toBeVisible();
    await expect(summary(page)).toContainText('1/2 passed');
  });
});

test.describe('feedback', () => {
  test('notes are recorded per case, persist across reload and can be removed', async ({
    page,
  }) => {
    await openReview(page);
    await loadSample(page);

    await expect(recordButton(page)).toBeDisabled();
    await noteBox(page).fill('   ');
    await expect(recordButton(page)).toBeDisabled();

    await noteBox(page).fill('Add a checklist assertion before implementation.');
    await expect(recordButton(page)).toBeEnabled();
    await recordButton(page).click();
    await expect(noteBox(page)).toHaveValue('');

    const notes = feedbackPanel(page).getByRole('article');
    await expect(notes).toHaveCount(1);
    await expect(notes.first()).toContainText('case-fail');
    await expect(notes.first()).toContainText('Add a checklist assertion before implementation.');

    await summary(page).getByRole('button', { name: 'select case case-pass' }).click();
    await noteBox(page).fill('Tighten the summary length check.');
    await recordButton(page).click();
    await expect(notes).toHaveCount(2);
    // Newest first.
    await expect(notes.first()).toContainText('case-pass');

    // Imported runs live in memory, notes are persisted: re-import after reload.
    await reloadApp(page);
    await expect(page.getByTestId('review-empty-state')).toBeVisible();
    await loadSample(page);
    await expect(notes).toHaveCount(2);

    // Removing asks for confirmation; dismissing keeps the note.
    page.once('dialog', (dialog) => void dialog.dismiss());
    await notes.first().getByRole('button', { name: /^remove feedback / }).click();
    await expect(notes).toHaveCount(2);

    const confirmMessage = acceptNextDialog(page);
    await notes.first().getByRole('button', { name: /^remove feedback / }).click();
    expect(await confirmMessage).toBe('Remove this feedback note?');
    await expect(notes).toHaveCount(1);
    await expect(notes.first()).toContainText('case-fail');
  });

  test('hosted: a change plan is derived from notes and downloaded as JSON', async ({ page }) => {
    await openReview(page);
    await loadSample(page);

    const planPanel = page.getByRole('region', {
      name: 'Download changes proposed from feedback',
    });
    const download = planPanel.getByRole('button', { name: 'Download change plan' });
    await expect(planPanel).toContainText('Download a change plan');
    await expect(download).toBeDisabled();

    await noteBox(page).fill('Require an acceptance-criteria checklist.');
    await recordButton(page).click();
    await expect(download).toBeEnabled();

    const downloadEvent = page.waitForEvent('download');
    await download.click();
    const file = await downloadEvent;
    expect(file.suggestedFilename()).toMatch(
      /^improve-plan-sample-skill-sample-review-run-.+\.json$/,
    );

    const plan = JSON.parse(await readFile(await file.path(), 'utf8')) as {
      runId: string;
      items: Array<{ path: string; before: string; after: string }>;
    };
    expect(plan.runId).toBe('sample-review-run');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      path: 'evals/evals.json',
      after: 'Require an acceptance-criteria checklist.',
    });
    expect(plan.items[0].before).toContain('case-fail');

    await expect(planPanel.getByRole('status')).toContainText('Change plan download started');
    const items = planPanel.getByLabel('Downloaded change plan');
    await expect(items).toContainText('evals/evals.json');
    await expect(items).toContainText('+ Require an acceptance-criteria checklist.');
  });
});

test.describe('localhost', () => {
  const openLocalReview = async (page: Page, daemon: import('./fixtures/daemon').DaemonMock) => {
    daemon.on('GET', '/runs', ({ query }) => ({ json: runsForQuery(query) }));
    await openApp(page);
    await switchEnv(page, 'localhost');
    await goToSection(page, 'review');
    await expect(page.getByTestId('review-app')).toBeVisible();
  };

  test('reviews runs read from disk by the daemon', async ({ page, daemon }) => {
    await openLocalReview(page, daemon);

    // No import panel: the daemon supplies runs.
    await expect(page.getByTestId('review-empty-state-kicker')).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText('./evals-runs');
    await expect(page.getByTestId('reviewing-skill-arc-conventional-commits')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      runsRail(page).getByRole('button', { name: 'select run disk-run-compare' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toContainText('1/2 passed');

    await page.getByTestId('reviewing-skill-release-please').click();
    await expect(
      runsRail(page).getByRole('button', { name: 'select run disk-run-release' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toContainText('1/1 passed');
    expect(daemon.requestsTo('GET', '/runs').some((r) => r.query.get('skill') === 'release-please')).toBe(
      true,
    );
  });

  test('proposes changes, stages them on the daemon and applies them', async ({
    page,
    daemon,
  }) => {
    daemon.on('POST', '/apply-plan', ({ body }) => ({
      json: {
        planId: 'plan-1',
        stagingPath: '/tmp/staging/plan-1',
        diff: { file: 'evals/evals.json', received: (body as { runId: string }).runId },
      },
    }));
    daemon.on('POST', '/apply-plan/plan-1/commit', {
      json: { planId: 'plan-1', committed: true, path: '/home/tester/evals/evals.json' },
    });
    await openLocalReview(page, daemon);

    const panel = page.getByRole('region', { name: 'Propose changes from local feedback' });
    const propose = panel.getByRole('button', { name: 'Propose changes' });
    await expect(propose).toBeDisabled();

    await noteBox(page).fill('Assert the BREAKING CHANGE footer.');
    await recordButton(page).click();
    await expect(propose).toBeEnabled();
    await propose.click();

    await expect(panel.getByLabel('Proposed change plan')).toContainText(
      '+ Assert the BREAKING CHANGE footer.',
    );
    const staged = panel.getByRole('region', { name: 'Staged change plan' });
    await expect(staged).toContainText('staged plan-1 at /tmp/staging/plan-1');
    await expect(staged).toContainText('"received": "disk-run-compare"');

    const [stageRequest] = daemon.requestsTo('POST', '/apply-plan');
    expect(stageRequest.body).toMatchObject({
      runId: 'disk-run-compare',
      workspaceRoot: localhostRuns.runs[0].workspaceRoot,
    });

    await staged.getByRole('button', { name: 'Apply changes' }).click();
    await expect(panel.getByRole('status')).toContainText(
      'Applied changes to /home/tester/evals/evals.json',
    );
    await expect(staged).toHaveCount(0);
  });

  test('a staged plan can be discarded', async ({ page, daemon }) => {
    daemon.on('POST', '/apply-plan', {
      json: { planId: 'plan-2', stagingPath: '/tmp/staging/plan-2', diff: {} },
    });
    daemon.on('POST', '/apply-plan/plan-2/cancel', { json: { planId: 'plan-2', cancelled: true } });
    await openLocalReview(page, daemon);

    const panel = page.getByRole('region', { name: 'Propose changes from local feedback' });
    await noteBox(page).fill('Drop this case.');
    await recordButton(page).click();
    await panel.getByRole('button', { name: 'Propose changes' }).click();

    const staged = panel.getByRole('region', { name: 'Staged change plan' });
    await staged.getByRole('button', { name: 'Discard plan' }).click();
    await expect(panel.getByRole('status')).toContainText('Discarded change plan');
    await expect(staged).toHaveCount(0);
    expect(daemon.requestsTo('POST', '/apply-plan/plan-2/cancel')).toHaveLength(1);
  });

  test('a staging failure is shown as an error', async ({ page, daemon }) => {
    daemon.on('POST', '/apply-plan', { status: 500, json: { error: 'boom' } });
    await openLocalReview(page, daemon);

    const panel = page.getByRole('region', { name: 'Propose changes from local feedback' });
    await noteBox(page).fill('Anything.');
    await recordButton(page).click();
    await panel.getByRole('button', { name: 'Propose changes' }).click();

    await expect(panel.getByRole('alert')).toContainText('apply plan failed with 500');
    await expect(panel.getByRole('region', { name: 'Staged change plan' })).toHaveCount(0);
  });

  test('with the daemon offline, localhost falls back to the import panel', async ({ page }) => {
    await openApp(page);
    await switchEnv(page, 'localhost');
    await goToSection(page, 'review');

    await expect(page.getByTestId('review-empty-state')).toBeVisible();
    await expect(page.getByTestId('review-empty-state-kicker')).toHaveText('Import run JSON');
    await loadSample(page);
    await expect(
      page.getByRole('region', { name: 'Propose changes from local feedback' }),
    ).toBeVisible();
  });
});
