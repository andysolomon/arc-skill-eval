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
// Added later, so these are checked against what the real SDK emits:
//   7. Tool calls the model makes (a curl in bash, a write, a failing read)
//      never reach grading or tool-summary.json.
//   8. timing.json names the default model instead of the one --model asked
//      for, or drops the provider's token counts.
//   9. A case that asks for "sandbox": "just-bash" runs unsandboxed when
//      --sandbox is not passed, so the agent writes to the host.
//
// Each run leaves its evals-runs/ artifacts (grading.json, trace.json) in a
// temp skill dir; the passing run asserts they exist and agree. Set
// KEEP_E2E=1 to keep the temp dirs (arc-skill-eval-pi-e2e-*) for inspection.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

const PROVIDER = "fake-llm";
const KEY_ENV = "ARC_SKILL_EVAL_FAKE_LLM_KEY";

const ready = { text: "ready", usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } };

function defaultReply(body) {
  if (body.model === "fake-retired") {
    return {
      status: 400,
      error: { message: "The 'fake-retired' model is not supported with this account.", code: "model_not_found" },
    };
  }
  return ready;
}

/** `reply(body, { index, origin })` returns `{ status, error }`, `{ text, usage }` or `{ toolCalls }`. */
async function startFakeProvider(reply = defaultReply) {
  const requests = [];
  let origin;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok\n");
        return;
      }
      const parsed = body ? JSON.parse(body) : {};
      requests.push({ url: req.url, auth: req.headers.authorization, body: parsed });
      const step = reply(parsed, { index: requests.length - 1, origin });

      if (step.status) {
        res.writeHead(step.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: step.error }));
        return;
      }

      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (payload) => res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: parsed.model, ...payload })}\n\n`);
      if (step.toolCalls) {
        const toolCalls = step.toolCalls.map(({ name, args }, index) => ({
          index,
          id: `call_${index + 1}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        }));
        chunk({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: toolCalls }, finish_reason: null }] });
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      } else {
        chunk({ choices: [{ index: 0, delta: { role: "assistant", content: step.text }, finish_reason: null }] });
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      chunk({ choices: [], usage: step.usage ?? ready.usage });
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  origin = `http://127.0.0.1:${port}`;
  return { baseUrl: `${origin}/v1`, origin, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** First turn calls `toolCalls`, every later turn answers `text`. */
function toolsThen(toolCalls, text = "done") {
  return (body, context) =>
    body.messages?.some((message) => message.role === "tool") ? { text } : { toolCalls: toolCalls(context) };
}

const DEFAULT_EVALS = [
  { id: "first", prompt: "Are you ready?", assertions: [{ type: "regex-match", pattern: "\\bready\\b" }] },
  { id: "second", prompt: "Say you are ready.", assertions: [{ type: "regex-match", pattern: "\\bready\\b" }] },
];

async function createFixture(baseUrl, { evals = DEFAULT_EVALS, models = [] } = {}) {
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
        models: [model("fake-1"), model("fake-retired"), ...models.map((extra) => ({ ...model(extra.id), ...extra }))],
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
  await writeFile(path.join(skillDir, "evals", "evals.json"), JSON.stringify({ skill_name: "echo-ready", evals }, null, 2));

  return { root, agentDir, skillDir };
}

async function withFixture(run, { reply, ...fixtureOptions } = {}) {
  const provider = await startFakeProvider(reply);
  const fixture = await createFixture(provider.baseUrl, fixtureOptions);
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

async function caseDir(skillDir, caseId) {
  const [runId] = await listRunDirs(skillDir);
  return path.join(skillDir, "evals-runs", runId, `eval-${caseId}`);
}

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

test("tool calls the model makes are graded and counted in tool-summary.json", async () => {
  await withFixture(async (fixture) => {
    const result = await runCli(runArgs(fixture, "--model", `${PROVIDER}/fake-1`, "--json"));
    assert.equal(fixture.provider.requests.length, 2, result.stderr || result.stdout);

    const dir = await caseDir(fixture.skillDir, "tools");
    const grading = await readJson(path.join(dir, "grading.json"));
    assert.deepEqual(
      grading.assertion_results.map(({ passed }) => passed),
      [true, false, false],
      JSON.stringify(grading.assertion_results, null, 2),
    );
    assert.match(grading.assertion_results[1].evidence, /curl -s/);
    assert.match(grading.assertion_results[2].evidence, /127\.0\.0\.1/);

    const host = new URL(fixture.provider.origin).host;
    const summary = await readJson(path.join(dir, "tool-summary.json"));
    assert.equal(summary.tool_call_count, 3);
    assert.equal(summary.tool_result_count, 3);
    assert.equal(summary.tool_error_count, 1);
    assert.deepEqual(summary.tool_calls_by_name, { bash: 1, read: 1, write: 1 });
    assert.equal(summary.bash_command_count, 1);
    assert.deepEqual(summary.written_files, ["notes.md"]);
    assert.deepEqual(summary.external_calls, [{ system: "http", operation: "curl", target: host }]);
  }, {
    evals: [{
      id: "tools",
      prompt: "Fetch the page, save notes, then read missing.txt.",
      assertions: [
        { id: "wrote", kind: "behavior", method: "tool-call-required", value: "write" },
        { id: "no-curl", kind: "behavior", method: "command-forbidden", value: "curl" },
        { id: "no-local-http", kind: "behavior", method: "external-call-forbidden", value: "127.0.0.1" },
      ],
    }],
    reply: toolsThen(({ origin }) => [
      { name: "bash", args: { command: `curl -s --max-time 5 ${origin}/page` } },
      { name: "write", args: { path: "notes.md", content: "notes\n" } },
      { name: "read", args: { path: "missing.txt" } },
    ]),
  });
});

test("timing.json records the model --model asked for and the provider's token counts", async () => {
  await withFixture(async (fixture) => {
    const result = await runCli(runArgs(fixture, "--model", `${PROVIDER}/fake-alt`, "--json"));
    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.ok(fixture.provider.requests.every((request) => request.body.model === "fake-alt"));

    const dir = await caseDir(fixture.skillDir, "first");
    const timing = await readJson(path.join(dir, "timing.json"));
    assert.equal(timing.model.provider, PROVIDER);
    assert.equal(timing.model.id, "fake-alt");
    assert.equal(timing.context_window_tokens, 64000);
    assert.equal(timing.token_usage.input_tokens, 37);
    assert.equal(timing.token_usage.output_tokens, 5);
    assert.equal(timing.total_tokens, 42);
    assert.equal(await readFile(path.join(dir, "assistant.md"), "utf8"), "ready\n");

    const manifest = await readJson(path.join(dir, "context-manifest.json"));
    assert.equal(manifest.mode, "isolated");
    assert.deepEqual(manifest.attached_skills.map(({ name, role }) => ({ name, role })), [{ name: "echo-ready", role: "target" }]);
  }, {
    evals: [DEFAULT_EVALS[0]],
    models: [{ id: "fake-alt", contextWindow: 64000 }],
    reply: () => ({ text: "ready", usage: { prompt_tokens: 37, completion_tokens: 5, total_tokens: 42 } }),
  });
});

test("a case that asks for the just-bash sandbox gets it without --sandbox", async () => {
  const probe = `arc-sandbox-probe-${process.pid}-${Date.now()}.txt`;
  try {
    await withFixture(async (fixture) => {
      const result = await runCli(runArgs(fixture, "--model", `${PROVIDER}/fake-1`, "--json"));
      assert.equal(result.exitCode, 0, result.stderr || result.stdout);
      assert.equal(JSON.parse(result.stdout).summary.passedAssertions, 1);
      assert.equal(existsSync(path.join("/tmp", probe)), false, "the write reached the host's /tmp");
    }, {
      evals: [{
        id: "sandboxed",
        prompt: "Write the probe file.",
        sandbox: "just-bash",
        assertions: [{ type: "file-exists", path: `tmp/${probe}` }],
      }],
      reply: toolsThen(() => [{ name: "write", args: { path: `/tmp/${probe}`, content: "inside\n" } }]),
    });
  } finally {
    await rm(path.join("/tmp", probe), { force: true });
  }
});
