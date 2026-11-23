// Blinding under the default Pi runtime, end to end: the real CLI and the
// bundled Pi SDK, with a local fake provider in place of a model. The fake
// reads the skill path out of the prompt Pi sends, lists that folder, then
// asks Pi to read the SKILL.md there, as a model would.
//
// Pi tells the model where each skill lives so it can read it. Ways the
// agent could still learn it is being tested, or reach the suite:
//
//   1. The path is the skill's real directory, with evals/ and evals-runs/
//      sitting beside SKILL.md.
//   2. The path sits under a folder named after the tool or the word eval.
//   3. The copy loses files the skill bundles, or SKILL.md cannot be read.
//   4. A read of the copied SKILL.md no longer counts as reading the skill.
//   5. An --extra-skill keeps its real path.
//   6. context-manifest.json points at the deleted copy, not the real file.
//   7. The copy is left behind after the run.
//
// The run's JSON result and what the fake saw are written to
// test-artifacts/pi-blinding/.

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(repoRoot, "test-artifacts", "pi-blinding");
const PROVIDER = "fake-llm";
const KEY_ENV = "ARC_SKILL_EVAL_FAKE_LLM_KEY";

/** Every `<dir>/<name>/SKILL.md` path mentioned anywhere in the request. */
function skillPathsIn(body) {
  const text = JSON.stringify(body).replaceAll("\\\\", "\\");
  return [...new Set(text.match(/\/[^\s"'<>\\]*\/SKILL\.md/g) ?? [])];
}

async function startFakeProvider() {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const skillPaths = skillPathsIn({ messages: body.messages?.filter((message) => message.role !== "tool") });
      const alreadyRead = body.messages?.some((message) => message.role === "tool");
      seen.push({
        skillPaths,
        // What sits beside each SKILL.md at the moment the model is told about it.
        folders: Object.fromEntries(skillPaths.map((skillPath) => {
          const dir = path.dirname(skillPath);
          return [skillPath, existsSync(dir) ? readdirSync(dir).sort() : null];
        })),
      });

      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (payload) => res.write(`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: body.model, ...payload })}\n\n`);
      const target = skillPaths.find((skillPath) => skillPath.endsWith("/blind-pi/SKILL.md"));
      if (target && !alreadyRead) {
        chunk({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read", arguments: JSON.stringify({ path: target }) } }] }, finish_reason: null }] });
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      } else {
        chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "ready" }, finish_reason: null }] });
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      chunk({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } });
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}/v1`, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function createFixture(baseUrl) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-pi-blind-"));
  const agentDir = path.join(root, "agent");
  const skillDir = path.join(root, "repo", "skills", "blind-pi");
  const extraDir = path.join(root, "repo", "skills", "other");
  const runTmp = path.join(root, "run-tmp");
  await mkdir(runTmp, { recursive: true });

  const model = { id: "fake-1", contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  await write(path.join(agentDir, "models.json"), JSON.stringify({
    providers: { [PROVIDER]: { baseUrl, api: "openai-completions", apiKey: `$${KEY_ENV}`, authHeader: true, models: [model] } },
  }));
  await write(path.join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: PROVIDER, defaultModel: "fake-1" }));

  await write(path.join(skillDir, "SKILL.md"), "---\nname: blind-pi\ndescription: Reply with the single word ready.\n---\n\nReply with the word `ready`.\n");
  await write(path.join(skillDir, "references", "guide.md"), "# Guide\n");
  await write(path.join(skillDir, "evals-runs", "old", "benchmark.json"), "{}\n");
  await write(path.join(skillDir, "evals", "evals.json"), JSON.stringify({
    skill_name: "blind-pi",
    evals: [{
      id: "reads-skill",
      prompt: "Are you ready?",
      assertions: [
        { type: "regex-match", pattern: "\\bready\\b" },
        { id: "read-skill", kind: "behavior", method: "skill-read-required", value: "blind-pi" },
      ],
    }],
  }));
  await write(path.join(extraDir, "SKILL.md"), "---\nname: other\ndescription: A distractor skill.\n---\n\nIgnore me.\n");
  await write(path.join(extraDir, "evals", "evals.json"), JSON.stringify({ skill_name: "other", evals: [] }));

  return { root, agentDir, skillDir, extraDir, runTmp };
}

test("under Pi, the agent is handed a copy of the skill without its suite", async () => {
  const provider = await startFakeProvider();
  const fixture = await createFixture(provider.baseUrl);
  const saved = { key: process.env[KEY_ENV], tmp: process.env.TMPDIR };
  process.env[KEY_ENV] = "fake-secret";
  process.env.TMPDIR = fixture.runTmp;

  let result;
  try {
    result = await runCli([
      "run", fixture.skillDir,
      "--agent-dir", fixture.agentDir,
      "--model", `${PROVIDER}/fake-1`,
      "--extra-skill", fixture.extraDir,
      "--output-dir", path.join(fixture.root, "out"),
      "--json",
    ]);
  } finally {
    for (const [name, value] of [[KEY_ENV, saved.key], ["TMPDIR", saved.tmp]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await provider.close();
  }

  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, "run.json"), `${JSON.stringify({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, null, 2)}\n`);
  await writeFile(path.join(artifactDir, "provider-saw.json"), `${JSON.stringify(provider.seen, null, 2)}\n`);

  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.passedAssertions, 2, "the read of the copied SKILL.md counted as reading the skill");

  const [first] = provider.seen;
  const target = first.skillPaths.find((skillPath) => skillPath.endsWith("/blind-pi/SKILL.md"));
  const extra = first.skillPaths.find((skillPath) => skillPath.endsWith("/other/SKILL.md"));
  assert.ok(target, `the prompt names the skill: ${JSON.stringify(first.skillPaths)}`);
  assert.ok(extra, "the prompt names the extra skill");

  for (const skillPath of [target, extra]) {
    assert.ok(!skillPath.startsWith(path.join(fixture.root, "repo")), `the model was given the real path: ${skillPath}`);
    assert.doesNotMatch(path.relative(fixture.runTmp, skillPath), /eval|test|judge|bench|rubric|score|arc-skill/i);
    assert.ok(!first.folders[skillPath].includes("evals"), `evals/ sits beside ${skillPath}`);
    assert.ok(!first.folders[skillPath].includes("evals-runs"), `evals-runs/ sits beside ${skillPath}`);
  }
  assert.deepEqual(first.folders[target], ["SKILL.md", "references"]);

  const manifest = JSON.parse(await readFile(report.skills[0].cases[0].contextManifestPath, "utf8"));
  assert.deepEqual(
    manifest.attached_skills.map((skill) => skill.path).sort(),
    [path.join(fixture.skillDir, "SKILL.md"), path.join(fixture.extraDir, "SKILL.md")].sort(),
    "artifacts name the real files, which still exist after the run",
  );

  // `run` spawns `pi --version` when a Pi CLI is on PATH (npm test puts the
  // bundled one there). That CLI turns on Node's compile cache, which Node
  // keeps in the temp dir on purpose. It is not something a case left behind.
  const leftovers = (await readdir(fixture.runTmp)).filter((name) => name !== "node-compile-cache");
  assert.deepEqual(leftovers, [], "the copies were removed");
  if (!process.env.KEEP_E2E) await rm(fixture.root, { recursive: true, force: true });
});
