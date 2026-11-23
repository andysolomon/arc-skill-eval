import path from 'node:path';
import { createWorkspace, E2E_DAEMON_URL, recordArtifact, usesDeployedApp } from './fixtures/local';
import { expect, test } from './fixtures/test';

/**
 * The daemon reads and writes files, so it answers only the web app: other
 * websites, rebound host names and paths outside the workspace the user
 * opened are refused. These requests go straight to the daemon the suite
 * starts, the way a hostile page or a stray request would.
 */

test.skip(usesDeployedApp, 'needs the local daemon the suite starts');

const APP_ORIGIN = 'http://localhost:4173';

test('refuses other websites, rebound hosts and paths outside the workspace', async ({ request }, testInfo) => {
  const workspace = await createWorkspace(testInfo);
  const alpha = path.join(workspace, 'skills', 'alpha');
  const evalsUrl = `${E2E_DAEMON_URL}/skill-evals?root=${encodeURIComponent(alpha)}`;

  const statusOf = async (url: string, headers: Record<string, string> = {}, method: 'GET' | 'OPTIONS' = 'GET') => {
    const response = await request.fetch(url, { method, headers, failOnStatusCode: false });
    return { status: response.status(), allowOrigin: response.headers()['access-control-allow-origin'] ?? null };
  };

  const results = {
    // Another website, by fetch and by preflight: refused without CORS headers.
    otherSite: await statusOf(`${E2E_DAEMON_URL}/health`, { origin: 'https://evil.example' }),
    otherSitePreflight: await statusOf(
      `${E2E_DAEMON_URL}/runs`,
      { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      'OPTIONS',
    ),
    // A cross-site request a browser sends without Origin (an image tag, for example).
    crossSiteNoOrigin: await statusOf(`${E2E_DAEMON_URL}/health`, { 'sec-fetch-site': 'cross-site' }),
    // DNS rebinding: the request reaches 127.0.0.1 under someone else's host name.
    reboundHost: await statusOf(`${E2E_DAEMON_URL}/health`, { host: 'evil.example:7358' }),
    // The web app and the production origin are answered, with their own origin echoed.
    webApp: await statusOf(`${E2E_DAEMON_URL}/health`, { origin: APP_ORIGIN }),
    production: await statusOf(`${E2E_DAEMON_URL}/health`, { origin: 'https://arc-skill-eval.vercel.app' }),
    // Before the workspace is opened, its files are out of reach.
    beforeOpening: await statusOf(evalsUrl, { origin: APP_ORIGIN }),
  };

  // Opening the workspace (what the workspace chip does) makes its files reachable.
  const opened = await request.get(`${E2E_DAEMON_URL}/workspace?root=${encodeURIComponent(workspace)}`, {
    headers: { origin: APP_ORIGIN },
  });
  expect(opened.ok()).toBe(true);
  const afterOpening = await statusOf(evalsUrl, { origin: APP_ORIGIN });
  const escape = await statusOf(
    `${E2E_DAEMON_URL}/skill-evals?root=${encodeURIComponent(path.join(workspace, '..', '..', '..'))}`,
    { origin: APP_ORIGIN },
  );
  const artifactEscape = await statusOf(
    `${E2E_DAEMON_URL}/runs/${encodeURIComponent('../..')}/artifacts/x/SKILL.md?root=${encodeURIComponent(alpha)}`,
    { origin: APP_ORIGIN },
  );
  const outsideHome = (await (
    await request.get(`${E2E_DAEMON_URL}/fs?path=${encodeURIComponent('/etc')}`, { headers: { origin: APP_ORIGIN } })
  ).json()) as { ok: boolean; error?: string };

  expect(results.otherSite).toEqual({ status: 403, allowOrigin: null });
  expect(results.otherSitePreflight).toEqual({ status: 403, allowOrigin: null });
  expect(results.crossSiteNoOrigin.status).toBe(403);
  expect(results.reboundHost.status).toBe(403);
  expect(results.webApp).toEqual({ status: 200, allowOrigin: APP_ORIGIN });
  expect(results.production).toEqual({ status: 200, allowOrigin: 'https://arc-skill-eval.vercel.app' });
  expect(results.beforeOpening.status).toBe(403);
  expect(afterOpening.status).toBe(200);
  expect(escape.status).toBe(403);
  expect(artifactEscape.status).toBe(404);
  expect(outsideHome).toMatchObject({ ok: false, error: 'outside your home folder and the workspaces you opened' });

  await recordArtifact(testInfo, {
    ...results,
    afterOpening,
    escapeWorkspace: escape,
    artifactEscape,
    listOutsideHome: outsideHome,
  });
});
