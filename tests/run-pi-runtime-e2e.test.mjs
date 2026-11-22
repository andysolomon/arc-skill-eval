// End-to-end `arc-skill-eval run` against the bundled Pi SDK, with no real
// provider: an eval-owned --agent-dir registers a custom OpenAI-compatible
// provider in models.json that points at a local fake server.
//
// Failure modes this file guards (issue #238), written before the code:
//   1. The bundled Pi SDK can't create a session or stream a reply at all
//      (API drift after a dependency bump), so every case errors.
//   2. A model the bundled catalog doesn't know fans out into one identical
//      error per case instead of one up-front diagnosis that names a fix.
//   3. Missing credentials are discovered per case, after work started.
//   4. The preflight blocks valid runs: a model registered only in
//      models.json, with its key in an environment variable, must pass.
//   5. A provider that rejects the model for every case is reported as N
//      identical [ERROR] lines, and the run doesn't exit non-zero.
//   6. A Pi CLI on PATH whose major version differs from the bundled SDK
//      goes unmentioned, so "works in pi, fails here" is a mystery.
//
// Each run leaves its evals-runs/ artifacts (grading.json, trace.json) in a
// temp skill dir; the passing run asserts they exist and agree. Set
// KEEP_E2E=1 to keep the temp dirs (arc-skill-eval-pi-e2e-*) for inspection.

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

const PROVIDER = "fake-llm";
const KEY_ENV = "ARC_SKILL_EVAL_FAKE_LLM_KEY";

async function startFakeProvider() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      requests.push({ url: req.url, auth: req.headers.authorization, body: parsed });

      if (parsed.model === "fake-retired") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({
          error: { message: "The 'fake-retired' model is not supported with this account.", code: "model_not_found" },
        }));
        return;
      }

      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (payload) => res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: parsed.model, ...payload })}\n\n`);
      chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "ready" }, finish_reason: null }] });
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      chunk({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } });
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function createFixture(baseUrl) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-pi-e2e-"));
  const agentDir = path.join(root, "agent");
  const skillDir = path.join(root, "skills", "echo-ready");
  await mkdir(agentDir, { recursive: true });
  await mkdir(path.join(skillDir, "evals"), { recursive: true });

  const model = (id) => ({ id, contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
  await writeFile(path.join(agentDir, "models.json"), JSON.stringify({
    providers: {
      [PROVIDER]: {
        baseUrl,
        api: "openai-completions",
        apiKey: `$${KEY_ENV}`,
        authHeader: true,
        models: [model("fake-1"), model("fake-retired")],
      },
    },
  }, null, 2));
  await writeFile(path.join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: PROVIDER, defaultModel: "fake-1" }));

  await writeFile(path.join(skillDir, "SKILL.md"), [
    "---",
    "name: echo-ready",
    "description: Reply with the single word ready.",
    "---",
    "",
    "Reply with the word `ready` and nothing else.",
    "",
  ].join("\n"));
  await writeFile(path.join(skillDir, "evals", "evals.json"), JSON.stringify({
    skill_name: "echo-ready",
    evals: [
      { id: "first", prompt: "Are you ready?", assertions: [{ type: "regex-match", pattern: "\\bready\\b" }] },
      { id: "second", prompt: "Say you are ready.", assertions: [{ type: "regex-match", pattern: "\\bready\\b" }] },
    ],
  }, null, 2));

  return { root, agentDir, skillDir };
}

async function withFixture(run) {
  const provider = await startFakeProvider();
  const fixture = await createFixture(provider.baseUrl);
  const previousKey = process.env[KEY_ENV];
  const previousPath = process.env.PATH;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env[KEY_ENV] = "fake-secret";
  // The fixture's agent dir doubles as the "personal" Pi dir for runs
  // without --agent-dir, which is how most people run.
  process.env.PI_CODING_AGENT_DIR = fixture.agentDir;
  try {
    await run({ ...fixture, provider });
  } finally {
    if (previousKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = previousKey;
    process.env.PATH = previousPath;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await provider.close();
    if (!process.env.KEEP_E2E) await rm(fixture.root, { recursive: true, force: true });
  }
}

function runArgs({ skillDir, agentDir }, ...extra) {
  return ["run", skillDir, "--agent-dir", agentDir, ...extra];
}

/** No --agent-dir: models, settings, and auth come from the default Pi agent dir. */
function defaultDirRunArgs({ skillDir }, ...extra) {
  return ["run", skillDir, ...extra];
}

async function listRunDirs(skillDir) {
  try {
    return await readdir(path.join(skillDir, "evals-runs"));
  } catch {
    return [];
  }
}

test("run executes every case through the bundled Pi SDK against a models.json provider", async () => {
  await withFixture(async (fixture) => {
    const result = await runCli(runArgs(fixture, "--model", `${PROVIDER}/fake-1`, "--json"));

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout).summary;
    assert.equal(summary.passedCases, 2);
    assert.equal(summary.failedCases, 0);
    assert.equal(summary.passedAssertions, 2);

    const prompts = fixture.provider.requests.map((request) => JSON.stringify(request.body.messages));
    assert.ok(prompts.some((messages) => messages.includes("Are you ready?")));
    assert.ok(prompts.some((messages) => messages.includes("Say you are ready.")));
    assert.ok(fixture.provider.requests.every((request) => request.auth === "Bearer fake-secret"));

    // Repeatable artifact: graded results and traces on disk.
    const [runId] = await listRunDirs(fixture.skillDir);
    const caseDir = path.join(fixture.skillDir, "evals-runs", runId, "eval-first");
    const grading = JSON.parse(await readFile(path.join(caseDir, "grading.json"), "utf8"));
    assert.equal(grading.summary.passed, 1);
    const trace = JSON.parse(await readFile(path.join(caseDir, "trace.json"), "utf8"));
    assert.match(trace.observations.assistantText, /ready/);
  });
});

test("run rejects an unknown model once, up front, and names the models Pi knows", async () => {
  await withFixture(async (fixture) => {
    const result = await runCli(defaultDirRunArgs(fixture, "--model", `${PROVIDER}/fake-2`));

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Unable to resolve Pi model fake-llm\/fake-2/);
    assert.match(result.stderr, /fake-1/);
    assert.match(result.stderr, /models\.json/);
    assert.equal(result.stderr.match(/Unable to resolve/g).length, 1);
    assert.equal(fixture.provider.requests.length, 0);
    assert.deepEqual(await listRunDirs(fixture.skillDir), []);
  });
});

test("run reports missing provider credentials once, before any case runs", async () => {
  await withFixture(async (fixture) => {
    delete process.env[KEY_ENV];
    const result = await runCli(defaultDirRunArgs(fixture, "--model", `${PROVIDER}/fake-1`));

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /no credentials/i);
    assert.match(result.stderr, /fake-llm/);
    assert.equal(fixture.provider.requests.length, 0);
    assert.deepEqual(await listRunDirs(fixture.skillDir), []);
  });
});

test("run collapses identical per-case provider errors into one diagnosis and exits non-zero", async () => {
  await withFixture(async (fixture) => {
    const result = await runCli(defaultDirRunArgs(fixture, "--model", `${PROVIDER}/fake-retired`));

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout.match(/not supported with this account/g)?.length, 1, result.stdout);
    assert.match(result.stdout, /\[ERROR\] first, second/);
    assert.match(result.stdout, /All 2 cases errored before producing output/);
    assert.match(result.stdout, /--model/);
  });
});

test("run warns when the Pi CLI on PATH is a different major version than the bundled SDK", async () => {
  await withFixture(async (fixture) => {
    const binDir = path.join(fixture.root, "bin");
    await mkdir(binDir);
    const fakePi = path.join(binDir, "pi");
    await writeFile(fakePi, "#!/bin/sh\necho 0.73.1\n");
    await chmod(fakePi, 0o755);
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;

    const result = await runCli(runArgs(fixture, "--model", `${PROVIDER}/fake-1`));

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /Pi CLI 0\.73\.1/);
    assert.match(result.stderr, /bundled Pi SDK 1\./);
  });
});

test("run stays quiet about versions when no Pi CLI is on PATH", async () => {
  await withFixture(async (fixture) => {
    const emptyBin = path.join(fixture.root, "empty-bin");
    await mkdir(emptyBin);
    process.env.PATH = `${emptyBin}${path.delimiter}${path.dirname(process.execPath)}`;

    const result = await runCli(runArgs(fixture, "--model", `${PROVIDER}/fake-1`));

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stderr, /Pi CLI/);
  });
});
