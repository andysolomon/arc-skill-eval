import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { RESOLVED_ROOT, WORKSPACE_ROOT, workspaceResponse } from './fixtures/data';
import type { DaemonMock } from './fixtures/daemon';
import { createWorkspace, readText, recordArtifact, relativeTo, sha256, usesDeployedApp } from './fixtures/local';
import {
  chooseWorkspace,
  expect,
  goToSection,
  openApp,
  reloadApp,
  switchEnv,
  test,
} from './fixtures/test';

const steps = ['List behaviors', 'Write prompts', 'Attach assertions', 'Review & run'] as const;

const rail = (page: Page) => page.getByRole('complementary', { name: 'Create wizard steps' });
const stepPane = (page: Page) => page.getByRole('region', { name: 'Create wizard step' });
const preview = (page: Page) => page.getByTestId('create-live-preview');
const wizardNav = (page: Page) => page.getByLabel('Create wizard navigation');
const nextButton = (page: Page) => wizardNav(page).getByRole('button', { name: 'next →' });
const backButton = (page: Page) => wizardNav(page).getByRole('button', { name: '← back' });
const railStep = (page: Page, label: (typeof steps)[number]) =>
  rail(page).getByRole('button', { name: label });

const expectStep = async (page: Page, index: number) => {
  await expect(railStep(page, steps[index])).toHaveAttribute('aria-current', 'step');
  await expect(rail(page).locator('[aria-current="step"]')).toHaveCount(1);
  await expect(stepPane(page)).toContainText(`step 0${index + 1}`);
};

const behaviorInputs = (page: Page) =>
  stepPane(page).getByRole('textbox', { name: 'behavior description' });

const openCreate = async (page: Page) => {
  await openApp(page);
  await goToSection(page, 'create');
  await expect(page.getByTestId('create-app')).toBeVisible();
};

const fillBehaviors = async (page: Page) => {
  await stepPane(page).getByRole('textbox', { name: 'skill name' }).fill('release-please');
  await stepPane(page).getByRole('button', { name: /Add behavior/ }).click();
  await behaviorInputs(page).nth(0).fill('Configures release please');
  await stepPane(page).getByRole('button', { name: /Add behavior/ }).click();
  await behaviorInputs(page).nth(1).fill('Skips docs only changes');
};

test.describe('hosted wizard', () => {
  test('starts on step 01 with an empty draft and a live preview', async ({ page }) => {
    await openCreate(page);

    await expect(rail(page).getByRole('button')).toHaveText([
      /01\s*List behaviors/,
      /02\s*Write prompts/,
      /03\s*Attach assertions/,
      /04\s*Review & run/,
    ]);
    await expectStep(page, 0);
    await expect(stepPane(page)).toHaveAttribute('data-env', 'hosted');
    await expect(stepPane(page)).toContainText('Create on the hosted site');
    await expect(stepPane(page)).toContainText('No behaviors yet. Add one below.');
    await expect(stepPane(page).getByRole('textbox', { name: 'skill name' })).toHaveValue(
      'my-skill',
    );
    await expect(backButton(page)).toHaveCount(0);
    await expect(nextButton(page)).toBeVisible();

    await expect(preview(page)).toContainText('evals/evals.json');
    await expect(preview(page)).toContainText('"skill_name": "my-skill"');
    await expect(preview(page)).toContainText('"evals": [');
    await expect(preview(page)).not.toContainText('"id"');
  });

  test('step 01 edits behaviors and their dimensions', async ({ page }) => {
    await openCreate(page);
    await fillBehaviors(page);

    await expect(stepPane(page)).not.toContainText('No behaviors yet');
    await expect(behaviorInputs(page)).toHaveCount(2);
    await expect(preview(page)).toContainText('"skill_name": "release-please"');
    await expect(preview(page)).toContainText('"id": "configures-release-please"');
    await expect(preview(page)).toContainText('"id": "skips-docs-only-changes"');

    const outcome = stepPane(page).getByRole('button', { name: 'outcome', exact: true }).first();
    const process = stepPane(page).getByRole('button', { name: 'process', exact: true }).first();
    await expect(outcome).toHaveAttribute('aria-pressed', 'true');
    await process.click();
    await expect(process).toHaveAttribute('aria-pressed', 'true');
    await expect(outcome).toHaveAttribute('aria-pressed', 'false');

    const remove = stepPane(page).getByRole('button', { name: 'remove behavior' });
    await expect(remove).toHaveCount(2);
    await remove.first().click();
    await expect(behaviorInputs(page)).toHaveCount(1);
    await expect(behaviorInputs(page)).toHaveValue('Skips docs only changes');
    await expect(remove).toHaveCount(0);
    await expect(preview(page)).not.toContainText('configures-release-please');
  });

  test('walks all four steps and downloads evals.json', async ({ page }) => {
    await openCreate(page);
    await fillBehaviors(page);

    await nextButton(page).click();
    await expectStep(page, 1);
    await expect(backButton(page)).toBeVisible();
    const firstPrompt = stepPane(page).getByRole('textbox', {
      name: 'prompt for Configures release please',
    });
    const secondPrompt = stepPane(page).getByRole('textbox', {
      name: 'prompt for Skips docs only changes',
    });
    await firstPrompt.fill('Set up release-please for this repo.');
    await secondPrompt.fill('Fix a typo in the README.');
    const negative = stepPane(page)
      .getByRole('button', { name: 'adjacent-negative', exact: true })
      .nth(1);
    await negative.click();
    await expect(negative).toHaveAttribute('aria-pressed', 'true');
    await expect(
      stepPane(page).getByRole('button', { name: 'explicit', exact: true }).nth(1),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(preview(page)).toContainText('"prompt": "Set up release-please for this repo."');

    await nextButton(page).click();
    await expectStep(page, 2);
    await expect(stepPane(page).getByText('No checks yet. Add one below.')).toHaveCount(2);
    await stepPane(page).getByRole('button', { name: '＋ file-exists' }).nth(0).click();
    await stepPane(page)
      .getByRole('textbox', { name: 'file-exists assertion' })
      .fill('.release-please-manifest.json');
    await stepPane(page).getByRole('button', { name: '＋ judge' }).nth(0).click();
    await stepPane(page).getByRole('textbox', { name: 'judge assertion' }).fill('Opens a release PR');
    await stepPane(page).getByRole('button', { name: '＋ tool-call-forbidden' }).nth(1).click();
    await stepPane(page).getByRole('textbox', { name: 'tool-call-forbidden assertion' }).fill('Write');
    await stepPane(page).getByRole('button', { name: '＋ regex-match' }).nth(1).click();
    await expect(stepPane(page).getByRole('button', { name: 'remove assertion' })).toHaveCount(4);
    await stepPane(page).getByRole('button', { name: 'remove assertion' }).nth(3).click();
    await expect(stepPane(page).getByRole('textbox', { name: 'regex-match assertion' })).toHaveCount(0);

    await expect(preview(page)).toContainText(
      '{ "type": "file-exists", "path": ".release-please-manifest.json" }',
    );
    await expect(preview(page)).toContainText('"Opens a release PR"');
    await expect(preview(page)).toContainText('"method": "tool-call-forbidden"');

    await nextButton(page).click();
    await expectStep(page, 3);
    await expect(nextButton(page)).toHaveCount(0);
    await expect(stepPane(page).getByRole('region', { name: 'cases count' })).toContainText('2');
    await expect(stepPane(page).getByRole('region', { name: 'assertions count' })).toContainText(
      '3',
    );
    await expect(
      stepPane(page).getByRole('region', { name: 'deterministic count' }),
    ).toContainText('2');
    await expect(stepPane(page).getByRole('region', { name: 'judge count' })).toContainText('1');
    await expect(stepPane(page).getByLabel('run command')).toContainText(
      'arc-skill-eval run ./skills/release-please --compare',
    );

    const write = page.getByTestId('write-evals-json');
    await expect(write).toHaveText('download evals.json');
    const downloadEvent = page.waitForEvent('download');
    await write.click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('evals.json');
    expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toEqual({
      version: '1',
      skill_name: 'release-please',
      evals: [
        {
          id: 'configures-release-please',
          prompt: 'Set up release-please for this repo.',
          assertions: [
            { type: 'file-exists', path: '.release-please-manifest.json' },
            'Opens a release PR',
          ],
        },
        {
          id: 'skips-docs-only-changes',
          prompt: 'Fix a typo in the README.',
          assertions: [
            {
              id: 'skips-docs-only-changes-tool-call-forbidden-1',
              kind: 'behavior',
              method: 'tool-call-forbidden',
              value: 'Write',
            },
          ],
        },
      ],
    });
    await expect(write).toHaveText('✓ downloaded evals.json');

    await stepPane(page).getByRole('link', { name: /Open the run console/ }).click();
    await expect(page.getByTestId('run-app')).toBeVisible();
  });

  test('rail and back button navigate; editing after a write re-arms it', async ({ page }) => {
    await openCreate(page);
    await fillBehaviors(page);

    await railStep(page, 'Review & run').click();
    await expectStep(page, 3);
    await page.getByTestId('write-evals-json').click();
    await expect(page.getByTestId('write-evals-json')).toHaveText('✓ downloaded evals.json');

    await backButton(page).click();
    await expectStep(page, 2);
    await railStep(page, 'List behaviors').click();
    await expectStep(page, 0);
    await behaviorInputs(page).nth(0).fill('Configures release please changed');

    await railStep(page, 'Review & run').click();
    await expect(page.getByTestId('write-evals-json')).toHaveText('download evals.json');
  });

  test('the draft and current step persist across reload', async ({ page }) => {
    await openCreate(page);
    await fillBehaviors(page);
    await nextButton(page).click();
    await stepPane(page)
      .getByRole('textbox', { name: 'prompt for Configures release please' })
      .fill('Set up release-please.');
    await nextButton(page).click();
    await expectStep(page, 2);

    await reloadApp(page);
    await expect(page.getByTestId('create-app')).toBeVisible();
    await expectStep(page, 2);
    await expect(stepPane(page)).toContainText('Configures release please');
    await expect(stepPane(page)).toContainText('Skips docs only changes');
    await expect(preview(page)).toContainText('"skill_name": "release-please"');
    await expect(preview(page)).toContainText('"prompt": "Set up release-please."');
  });
});

test.describe('localhost assist (model calls mocked)', () => {
  const openLocalCreate = async (page: Page, daemon: DaemonMock) => {
    daemon.on('GET', '/workspace', { json: workspaceResponse });
    await openApp(page);
    await switchEnv(page, 'localhost');
    await chooseWorkspace(page, WORKSPACE_ROOT);
    await goToSection(page, 'create');
    await expect(stepPane(page)).toHaveAttribute('data-env', 'localhost');
  };

  const skillChip = (page: Page, skillId: string) =>
    stepPane(page).getByRole('button', { name: new RegExp(`${skillId}$`) });

  test('drafts behaviors for a skill without evals', async ({ page, daemon }) => {
    daemon.on('POST', '/generate-evals', {
      json: { behaviors: ['Creates release-please-config.json.', 'Adds the GitHub workflow'] },
    });
    await openLocalCreate(page, daemon);

    await expect(stepPane(page)).toContainText('Draft an eval suite');
    await expect(stepPane(page)).toContainText(
      'No behaviors yet. Draft them from a skill above, or add one below.',
    );
    const draft = stepPane(page).getByRole('button', { name: '✦ Draft evals' });
    await expect(draft).toBeDisabled();

    await stepPane(page).getByRole('combobox', { name: 'assist model' }).selectOption(
      'anthropic/claude-sonnet-4',
    );
    await skillChip(page, 'release-please').click();
    await expect(skillChip(page, 'release-please')).toHaveAttribute('aria-pressed', 'true');
    await expect(draft).toBeEnabled();
    await draft.click();

    await expect(stepPane(page)).toContainText('Drafted 2 behaviors from release-please');
    await expect(behaviorInputs(page)).toHaveCount(2);
    await expect(behaviorInputs(page).nth(0)).toHaveValue('Creates release-please-config.json');
    await expect(behaviorInputs(page).nth(1)).toHaveValue('Adds the GitHub workflow');
    await expect(stepPane(page).getByRole('textbox', { name: 'skill name' })).toHaveValue(
      'release-please',
    );

    const [request] = daemon.requestsTo('POST', '/generate-evals');
    expect(request.body).toEqual({
      workspaceRoot: `${RESOLVED_ROOT}/release-please`,
      behaviors: [],
      model: 'anthropic/claude-sonnet-4',
    });
  });

  test('a failed draft shows the daemon error', async ({ page, daemon }) => {
    daemon.on('POST', '/generate-evals', { status: 500, json: { error: 'SKILL.md not found' } });
    await openLocalCreate(page, daemon);

    await skillChip(page, 'release-please').click();
    await stepPane(page).getByRole('button', { name: '✦ Draft evals' }).click();
    await expect(stepPane(page).getByRole('alert')).toContainText('SKILL.md not found');
    await expect(behaviorInputs(page)).toHaveCount(0);
  });

  test('suggests behaviors, prompts and assertions with the assist model', async ({
    page,
    daemon,
  }) => {
    daemon.on('POST', '/suggest', ({ body }) => {
      const kind = (body as { kind: string }).kind;
      if (kind === 'behavior') {
        return { json: { ok: true, behavior: { text: 'Writes a changelog entry', dim: 'style' } } };
      }
      if (kind === 'prompt') {
        return { json: { ok: true, prompt: 'Add a changelog entry for this fix.' } };
      }
      if (kind === 'assertion') {
        return { json: { ok: true, assertion: { kind: 'regex-match', val: 'CHANGELOG' } } };
      }
      return { status: 400, json: { error: `unexpected kind ${kind}` } };
    });
    await openLocalCreate(page, daemon);

    await stepPane(page).getByRole('button', { name: '✦ Suggest a behavior' }).click();
    await expect(behaviorInputs(page)).toHaveCount(1);
    await expect(behaviorInputs(page)).toHaveValue('Writes a changelog entry');
    await expect(
      stepPane(page).getByRole('button', { name: 'style', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await nextButton(page).click();
    await stepPane(page).getByRole('button', { name: '✦ Suggest prompt' }).click();
    await expect(
      stepPane(page).getByRole('textbox', { name: 'prompt for Writes a changelog entry' }),
    ).toHaveValue('Add a changelog entry for this fix.');

    await nextButton(page).click();
    await stepPane(page).getByRole('button', { name: '✦ Suggest an assertion' }).click();
    await expect(stepPane(page).getByRole('textbox', { name: 'regex-match assertion' })).toHaveValue(
      'CHANGELOG',
    );
    await expect(preview(page)).toContainText('{ "type": "regex-match", "pattern": "CHANGELOG" }');

    const kinds = daemon
      .requestsTo('POST', '/suggest')
      .map((request) => (request.body as { kind: string }).kind);
    expect(kinds).toEqual(['behavior', 'prompt', 'assertion']);
    expect(daemon.requestsTo('POST', '/suggest')[0].body).toMatchObject({
      skill: 'my-skill',
      model: 'minimax/MiniMax-M3',
    });
  });
});

test.describe('localhost with the real daemon', () => {
  test.use({ mockDaemon: false });
  test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

  let workspace = '';

  test.beforeEach(async ({ page }, testInfo) => {
    workspace = await createWorkspace(testInfo);
    await openApp(page);
    await switchEnv(page, 'localhost');
    await chooseWorkspace(page, workspace);
    await goToSection(page, 'create');
    await expect(stepPane(page)).toHaveAttribute('data-env', 'localhost');
  });

  const skillChip = (page: Page, skillId: string) =>
    stepPane(page).getByRole('button', { name: new RegExp(`${skillId}$`) });

  const loadExisting = async (page: Page, skillId: string, cases: number) => {
    await skillChip(page, skillId).click();
    await stepPane(page).getByRole('button', { name: '✎ Edit existing evals' }).click();
    await expect(stepPane(page)).toContainText(`Loaded ${cases} cases from ${skillId}'s evals.json`);
  };

  const stageAndApply = async (page: Page) => {
    await railStep(page, 'Review & run').click();
    await page.getByTestId('write-evals-json').click();
    const staging = stepPane(page).getByRole('region', { name: 'staging diff' });
    await expect(staging).toBeVisible();
    await staging.getByRole('button', { name: 'Apply changes' }).click();
    await expect(staging).toHaveCount(0);
    return staging;
  };

  test('loads a suite and writes it back without losing a field', async ({ page }, testInfo) => {
    const evalsPath = path.join(workspace, 'skills', 'gamma', 'evals', 'evals.json');
    const before = await readText(evalsPath);
    await loadExisting(page, 'gamma', 2);
    await expect(behaviorInputs(page).nth(0)).toHaveValue('keeps every field of this case');
    await expect(preview(page)).toContainText('"kind": "output"');

    await railStep(page, 'Review & run').click();
    await page.getByTestId('write-evals-json').click();
    const staging = stepPane(page).getByRole('region', { name: 'staging diff' });
    await expect(staging).toContainText(evalsPath);
    await expect(staging).toContainText('"changed": false');

    await staging.getByRole('button', { name: 'Apply changes' }).click();
    await expect(stepPane(page).getByRole('status')).toContainText(`✓ wrote ${evalsPath}`);
    await expect(page.getByTestId('write-evals-json')).toHaveText('✓ wrote evals/evals.json');

    const after = await readText(evalsPath);
    expect(after).toBe(before);
    await recordArtifact(testInfo, {
      file: relativeTo(workspace, evalsPath),
      sha256Before: sha256(before),
      sha256After: sha256(after),
      identical: after === before,
    });
  });

  test('editing a loaded suite changes only the edited values', async ({ page }, testInfo) => {
    const evalsPath = path.join(workspace, 'skills', 'gamma', 'evals', 'evals.json');
    const before = JSON.parse(await readText(evalsPath)) as { evals: Array<Record<string, unknown>> };
    await loadExisting(page, 'gamma', 2);

    await railStep(page, 'Write prompts').click();
    await stepPane(page)
      .getByRole('textbox', { name: 'prompt for keeps every field of this case' })
      .fill('Summarize input.txt into out.txt in one line.');
    await railStep(page, 'Attach assertions').click();
    await stepPane(page).getByRole('textbox', { name: 'regex-match assertion' }).fill('one line');

    await stageAndApply(page);
    await expect(stepPane(page).getByRole('status')).toContainText(`✓ wrote ${evalsPath}`);

    const after = JSON.parse(await readText(evalsPath)) as { evals: Array<Record<string, unknown>> };
    const [firstBefore, secondBefore] = before.evals;
    const [firstAfter, secondAfter] = after.evals;
    const assertionsBefore = firstBefore!.assertions as Array<unknown>;
    expect(firstAfter).toEqual({
      ...firstBefore,
      prompt: 'Summarize input.txt into out.txt in one line.',
      assertions: [
        { type: 'regex-match', pattern: 'one line', flags: 'i', target: { file: 'out.txt' } },
        ...assertionsBefore.slice(1),
      ],
    });
    expect(secondAfter).toEqual(secondBefore);
    await recordArtifact(testInfo, {
      file: relativeTo(workspace, evalsPath),
      prompt: firstAfter!.prompt,
      regexAssertion: (firstAfter!.assertions as Array<unknown>)[0],
      keptFields: Object.keys(firstAfter!),
    });
  });

  test("a suite for a skill without one goes into that skill's evals folder", async ({ page }, testInfo) => {
    await skillChip(page, 'beta').click();
    await stepPane(page).getByRole('textbox', { name: 'skill name' }).fill('beta');
    await stepPane(page).getByRole('button', { name: /Add behavior/ }).click();
    await behaviorInputs(page).nth(0).fill('Greets the user');
    await railStep(page, 'Write prompts').click();
    await stepPane(page).getByRole('textbox', { name: 'prompt for Greets the user' }).fill('Say hello.');
    await railStep(page, 'Attach assertions').click();
    await stepPane(page).getByRole('button', { name: '＋ regex-match' }).nth(0).click();
    await stepPane(page).getByRole('textbox', { name: 'regex-match assertion' }).fill('hello');

    await stageAndApply(page);
    const evalsPath = path.join(workspace, 'skills', 'beta', 'evals', 'evals.json');
    await expect(stepPane(page).getByRole('status')).toContainText(`✓ wrote ${evalsPath}`);

    const written = JSON.parse(await readText(evalsPath)) as unknown;
    expect(written).toEqual({
      version: '1',
      skill_name: 'beta',
      evals: [{ id: 'greets-the-user', prompt: 'Say hello.', assertions: [{ type: 'regex-match', pattern: 'hello' }] }],
    });
    await expect(readText(path.join(workspace, 'evals.json'))).rejects.toThrow();
    await recordArtifact(testInfo, { file: relativeTo(workspace, evalsPath), written });
  });

  test('a staged write can be discarded', async ({ page }) => {
    const evalsPath = path.join(workspace, 'skills', 'gamma', 'evals', 'evals.json');
    const before = await readText(evalsPath);
    await loadExisting(page, 'gamma', 2);
    await behaviorInputs(page).nth(1).fill('a renamed case');

    await railStep(page, 'Review & run').click();
    await page.getByTestId('write-evals-json').click();
    const staging = stepPane(page).getByRole('region', { name: 'staging diff' });
    await expect(staging).toBeVisible();

    await staging.getByRole('button', { name: 'Discard changes' }).click();
    await expect(staging).toHaveCount(0);
    await expect(page.getByTestId('write-evals-json')).toHaveText('write evals/evals.json');
    expect(await readText(evalsPath)).toBe(before);
  });

  test('a write with no skill to go to is refused with the reason', async ({ page }) => {
    await stepPane(page).getByRole('textbox', { name: 'skill name' }).fill('nowhere');
    await railStep(page, 'Review & run').click();
    await page.getByTestId('write-evals-json').click();
    await expect(stepPane(page).getByRole('alert')).toContainText('has no SKILL.md');
    await expect(page.getByTestId('write-evals-json')).toHaveText('write evals/evals.json');
  });
});
