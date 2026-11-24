import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { createWorkspace, readText, recordArtifact, relativeTo, runSuite, sha256, usesDeployedApp } from './fixtures/local';
import {
  acceptNextDialog,
  chooseWorkspace,
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

  test('imported runs survive switching sections and a reload', async ({ page }) => {
    await openReview(page);
    await loadSample(page);

    await goToSection(page, 'learn');
    await goToSection(page, 'review');
    await expect(page.getByTestId('review-app')).toBeVisible();
    await expect(summary(page)).toContainText('1/2 passed');

    await reloadApp(page);
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
    await expect(notes.first()).toContainText('case-pass');

    await reloadApp(page);
    await expect(page.getByTestId('review-app')).toBeVisible();
    await expect(notes).toHaveCount(2);

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

test.describe('localhost with the real daemon', () => {
  test.use({ mockDaemon: false });
  test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

  let workspace = '';
  let alpha = '';
  let runDir = '';

  test.beforeEach(async ({ page, request }, testInfo) => {
    workspace = await createWorkspace(testInfo);
    alpha = path.join(workspace, 'skills', 'alpha');
    await runSuite(request, workspace, alpha);
    const [runName] = await readdir(path.join(alpha, 'evals-runs'));
    runDir = path.join(alpha, 'evals-runs', runName!);

    await openApp(page);
    await switchEnv(page, 'localhost');
    await chooseWorkspace(page, workspace);
    await goToSection(page, 'review');
    await expect(page.getByTestId('review-app')).toBeVisible();
  });

  const panel = (page: Page) => page.getByRole('region', { name: 'Propose changes from local feedback' });

  const noteOnFailingCase = async (page: Page, note: string) => {
    await summary(page).getByRole('button', { name: 'select case eval-writes-a-report' }).click();
    await noteBox(page).fill(note);
    await recordButton(page).click();
  };

  test('reviews the runs the daemon reads from disk', async ({ page }) => {
    await expect(page.getByTestId('review-empty-state-kicker')).toHaveCount(0);
    await expect(page.getByTestId('reviewing-skill-alpha')).toHaveAttribute('aria-pressed', 'true');
    await expect(
      runsRail(page).getByRole('button', { name: `select run ${path.basename(runDir)}` }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toContainText('1/2 passed');
  });

  test('applies feedback with improve --apply', async ({ page }, testInfo) => {
    const evalsPath = path.join(alpha, 'evals', 'evals.json');
    const untouched = await readText(evalsPath);
    const propose = panel(page).getByRole('button', { name: 'Propose changes' });
    await expect(propose).toBeDisabled();

    await noteOnFailingCase(page, 'The prompt is ambiguous about the file name.');
    await expect(propose).toBeEnabled();
    await propose.click();

    const plan = panel(page).getByLabel('Proposed change plan');
    await expect(plan).toContainText('+ The prompt is ambiguous about the file name.');
    await expect(plan).toContainText('- eval-writes-a-report: Write the weekly report to report.md.');
    const staged = panel(page).getByRole('region', { name: 'Staged change plan' });
    await expect(staged).toContainText('arc-skill-eval improve --apply');
    await expect(staged).toContainText('"kind": "prompt"');
    await expect(staged).toContainText('"changed": true');
    expect(await readText(evalsPath)).toBe(untouched);

    await staged.getByRole('button', { name: 'Apply changes' }).click();
    await expect(panel(page).getByRole('status')).toContainText(`Applied changes to ${evalsPath}`);
    await expect(staged).toHaveCount(0);

    const suite = JSON.parse(await readText(evalsPath)) as {
      evals: Array<{ id: string; metadata?: { tags?: string[]; improvement_suggestions?: Array<{ kind: string }> } }>;
    };
    const report = suite.evals.find((evalCase) => evalCase.id === 'writes-a-report');
    const greets = suite.evals.find((evalCase) => evalCase.id === 'greets-the-user');
    expect(report?.metadata?.tags).toContain('needs-eval-improvement');
    expect(report?.metadata?.improvement_suggestions?.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['prompt', 'assertions']),
    );
    expect(greets?.metadata).toBeUndefined();
    const feedback = JSON.parse(await readText(path.join(runDir, 'web-feedback.json'))) as {
      cases: Array<{ case_id: string; notes: string }>;
    };
    expect(feedback.cases).toEqual([
      expect.objectContaining({ case_id: 'writes-a-report', notes: 'The prompt is ambiguous about the file name.' }),
    ]);

    await recordArtifact(testInfo, {
      file: relativeTo(workspace, evalsPath),
      sha256Before: sha256(untouched),
      sha256After: sha256(await readText(evalsPath)),
      writesAReport: report?.metadata,
      feedbackFile: relativeTo(workspace, path.join(runDir, 'web-feedback.json')).replace(path.basename(runDir), '<run>'),
    });
  });

  test('a staged plan can be discarded', async ({ page }) => {
    const evalsPath = path.join(alpha, 'evals', 'evals.json');
    const before = await readText(evalsPath);
    await noteOnFailingCase(page, 'The prompt is unclear.');
    await panel(page).getByRole('button', { name: 'Propose changes' }).click();

    const staged = panel(page).getByRole('region', { name: 'Staged change plan' });
    await staged.getByRole('button', { name: 'Discard plan' }).click();
    await expect(panel(page).getByRole('status')).toContainText('Discarded change plan');
    await expect(staged).toHaveCount(0);
    expect(await readText(evalsPath)).toBe(before);
  });

  test('a staging failure shows the daemon reason', async ({ page }) => {
    await noteOnFailingCase(page, 'Anything.');
    await rm(path.join(alpha, 'evals', 'evals.json'));
    await panel(page).getByRole('button', { name: 'Propose changes' }).click();

    await expect(panel(page).getByRole('alert')).toContainText('This skill has no evals/evals.json to improve.');
    await expect(panel(page).getByRole('region', { name: 'Staged change plan' })).toHaveCount(0);
  });
});

test.describe('localhost, daemon offline', () => {
  test('falls back to the import panel', async ({ page }) => {
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
