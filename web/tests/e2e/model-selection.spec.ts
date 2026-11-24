import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createWorkspace, E2E_DAEMON_URL, recordArtifact, usesDeployedApp } from './fixtures/local';
import { expect, test } from './fixtures/test';

/**
 * The web app sends model choices as `provider/model[:thinking]` strings and
 * the daemon parses them with the library's parser. These requests go to the
 * daemon the suite starts, whose replay runtime reports the model it was
 * asked to run in each case's timing.json.
 */

test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

const findTiming = async (dir: string): Promise<string> => {
  const entries = await readdir(dir, { recursive: true });
  const match = entries.find((entry) => path.basename(entry) === 'timing.json');
  if (!match) throw new Error(`no timing.json under ${dir}`);
  return path.join(dir, match);
};

test('a model with a thinking suffix reaches the runtime as provider, id and thinking level', async ({
  request,
}, testInfo) => {
  const workspace = await createWorkspace(testInfo);
  const alpha = path.join(workspace, 'skills', 'alpha');
  expect((await request.get(`${E2E_DAEMON_URL}/workspace?root=${encodeURIComponent(workspace)}`)).ok()).toBe(true);

  const runWith = async (model: string) => {
    const response = await request.post(`${E2E_DAEMON_URL}/runs`, {
      data: { workspaceRoot: alpha, case: 'greets-the-user', model },
    });
    expect(response.status()).toBe(201);
    const { runId } = (await response.json()) as { runId: string };
    await expect
      .poll(
        async () => ((await (await request.get(`${E2E_DAEMON_URL}/runs/${runId}`)).json()) as { status: string }).status,
        { timeout: 20_000 },
      )
      .toBe('completed');
    const state = (await (await request.get(`${E2E_DAEMON_URL}/runs/${runId}`)).json()) as {
      summary: { artifactPath: string };
    };
    const timing = JSON.parse(await readFile(await findTiming(state.summary.artifactPath), 'utf8')) as {
      model: unknown;
      thinking_level: unknown;
    };
    return { sent: model, model: timing.model, thinking_level: timing.thinking_level };
  };

  const thinking = await runWith('anthropic/claude-opus-4:high');
  const colonTag = await runWith('ollama/qwen3.5:cloud:medium');

  expect(thinking).toEqual({
    sent: 'anthropic/claude-opus-4:high',
    model: { provider: 'anthropic', id: 'claude-opus-4' },
    thinking_level: 'high',
  });
  expect(colonTag).toEqual({
    sent: 'ollama/qwen3.5:cloud:medium',
    model: { provider: 'ollama', id: 'qwen3.5:cloud' },
    thinking_level: 'medium',
  });

  await recordArtifact(testInfo, { runs: [thinking, colonTag] });
});

test('a malformed model is refused with 400 and the accepted form', async ({ request }, testInfo) => {
  const workspace = await createWorkspace(testInfo);
  const alpha = path.join(workspace, 'skills', 'alpha');
  expect((await request.get(`${E2E_DAEMON_URL}/workspace?root=${encodeURIComponent(workspace)}`)).ok()).toBe(true);

  const post = async (route: string, data: Record<string, unknown>) => {
    const response = await request.post(`${E2E_DAEMON_URL}${route}`, { data, failOnStatusCode: false });
    return { route, status: response.status(), error: ((await response.json()) as { error?: string }).error };
  };

  const results = [
    await post('/runs', { workspaceRoot: alpha, case: 'greets-the-user', model: 'claude-opus-4' }),
    await post('/suggest', { kind: 'behavior', skill: 'alpha', model: 'anthropic/' }),
    await post('/generate-evals', { workspaceRoot: alpha, model: 'anthropic/:high' }),
  ];

  expect(results).toEqual([
    {
      route: '/runs',
      status: 400,
      error: 'Invalid model: claude-opus-4. Expected provider/model or provider/model:thinking.',
    },
    {
      route: '/suggest',
      status: 400,
      error: 'Invalid model: anthropic/. Expected provider/model or provider/model:thinking.',
    },
    {
      route: '/generate-evals',
      status: 400,
      error: 'Invalid model: anthropic/:high. Expected provider/model or provider/model:thinking.',
    },
  ]);

  await recordArtifact(testInfo, { refused: results });
});
