import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { runCli } from "../dist/index.js";

// The --json contract exists so a coding agent in any harness can drive the
// CLI from its shell tool and parse stdout. Ways it can break, written before
// the implementation (AGENTS.md):
//
//  1. Human-readable text leaks onto stdout in JSON mode ("Wrote …", notes),
//     so JSON.parse fails and the agent has nothing to act on.
//  2. Errors in JSON mode go only to stderr as prose, so the agent cannot
//     tell "bad flag" from "file missing" from "crash" without scraping text.
//  3. `emit --check --json` reports drift on stderr with empty stdout, so the
//     agent sees exit 1 but no structured verdict.
//  4. Paths in JSON are relative to the CLI's cwd, which the agent may not
//     share; they must be absolute.
//  5. Conflicting modes (--json with --summary or --interactive) silently
//     pick one and print the wrong format.
//  6. Interactive commands (browse, create --interactive) hang or crash with
//     a raw-mode stack trace when run without a terminal, which is how every
//     agent shell tool runs them. They must fail fast with a clear message,
//     before any model call is made.
//  7. Adding --json changes the default (non-JSON) output that existing
//     scripts already parse.
//
// (1) is checked by parsing stdout for every command below. (4) is checked on
// the commands that report paths.

const BUILDER = pathToFileURL(path.resolve("dist/evals/builder/index.js")).href;

async function makeSkill(root, name = "demo-skill") {
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: Writes demo files.\n---\n\n# ${name}\n`, "utf8");
  return skillDir;
}

async function withTmp(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-json-contract-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    assert.fail(`stdout is not JSON (exit ${result.exitCode}):\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

test("usage errors in JSON mode are a structured error object on stdout", async () => {
  const result = await runCli(["review", "--bogus", "--json"]);
  assert.equal(result.exitCode, 1);
  const body = parseJson(result);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.error.kind, "usage");
  assert.match(body.error.message, /--bogus/);
});

test("command errors in JSON mode are a structured error object on stdout", async () => {
  await withTmp(async (root) => {
    const result = await runCli(["review", path.join(root, "missing-run"), "--json"]);
    assert.equal(result.exitCode, 1);
    const body = parseJson(result);
    assert.equal(body.error.kind, "command");
  });
});

test("create --dry-run --json returns the full result with an absolute target path; plain --dry-run is unchanged", async () => {
  await withTmp(async (root) => {
    const skillDir = await makeSkill(root);

    const json = await runCli(["create", skillDir, "--dry-run", "--json"]);
    assert.equal(json.exitCode, 0);
    const body = parseJson(json);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.dryRun, true);
    assert.equal(body.evals.skill_name, "demo-skill");
    assert.ok(path.isAbsolute(body.evalsJsonPath));

    const legacy = await runCli(["create", skillDir, "--dry-run"]);
    assert.equal(parseJson(legacy).skill_name, "demo-skill");
  });
});

test("--json conflicts with --summary and --interactive", async () => {
  await withTmp(async (root) => {
    const skillDir = await makeSkill(root);
    for (const extra of [["--dry-run", "--summary"], ["--guided", "--interactive"]]) {
      const result = await runCli(["create", skillDir, ...extra, "--json"]);
      assert.equal(result.exitCode, 1, extra.join(" "));
      assert.equal(parseJson(result).error.kind, "usage");
    }
  });
});

test("emit --check --json reports drift as a JSON verdict with exit 1, and up-to-date with exit 0", async () => {
  await withTmp(async (root) => {
    const evalsDir = path.join(root, "evals");
    await mkdir(evalsDir, { recursive: true });
    await writeFile(
      path.join(evalsDir, "evals.eval.mjs"),
      `import { defineSkillEval, evalCase, fileExists } from ${JSON.stringify(BUILDER)};
export default defineSkillEval({ skill_name: "arc-demo", version: "1", cases: [evalCase({ id: "a", prompt: "p", assertions: [fileExists("x.txt")] })] });
`,
      "utf8",
    );
    await writeFile(path.join(evalsDir, "evals.json"), "{}\n", "utf8");

    const drift = await runCli(["emit", "--from", path.join(evalsDir, "evals.eval.mjs"), "--check", "--json"]);
    assert.equal(drift.exitCode, 1);
    const driftBody = parseJson(drift);
    assert.equal(driftBody.check, true);
    assert.equal(driftBody.changed, true);
    assert.ok(path.isAbsolute(driftBody.outPath));

    const wrote = await runCli(["emit", "--from", path.join(evalsDir, "evals.eval.mjs"), "--json"]);
    assert.equal(wrote.exitCode, 0);
    assert.equal(parseJson(wrote).caseCount, 1);

    const clean = await runCli(["emit", "--from", path.join(evalsDir, "evals.eval.mjs"), "--check", "--json"]);
    assert.equal(clean.exitCode, 0);
    assert.equal(parseJson(clean).changed, false);
  });
});

test("review --json reports absolute report and feedback paths", async () => {
  await withTmp(async (root) => {
    const caseDir = path.join(root, "run", "eval-a");
    await mkdir(caseDir, { recursive: true });
    await writeFile(path.join(caseDir, "assistant.md"), "done", "utf8");
    await writeFile(
      path.join(caseDir, "grading.json"),
      JSON.stringify({ case_id: "a", assertion_results: [], summary: { passed: 0, failed: 0, total: 0, pass_rate: 0 } }),
      "utf8",
    );

    const result = await runCli(["review", path.join(root, "run"), "--json"]);
    assert.equal(result.exitCode, 0);
    const body = parseJson(result);
    assert.equal(body.caseCount, 1);
    assert.ok(path.isAbsolute(body.feedbackPath));
    await readFile(body.feedbackPath, "utf8");
  });
});

test("init-runtime and package --json print only JSON", async () => {
  await withTmp(async (root) => {
    const init = await runCli(["init-runtime", path.join(root, "agent"), "--provider", "ollama", "--model", "m", "--json"]);
    assert.equal(init.exitCode, 0);
    assert.ok(path.isAbsolute(parseJson(init).modelsPath));

    const skillDir = await makeSkill(root);
    assert.equal((await runCli(["create", skillDir])).exitCode, 0);
    const pkg =await runCli(["package", skillDir, "--output", path.join(root, "demo.skill.tgz"), "--json"]);
    assert.equal(pkg.exitCode, 0, pkg.stderr);
    assert.equal(parseJson(pkg).skillName, "demo-skill");
  });
});

test("interactive commands fail fast without a terminal instead of hanging", async () => {
  // node --test runs files with piped stdio, so there is no TTY here — the
  // same situation as an agent's shell tool.
  assert.ok(!(process.stdin.isTTY && process.stdout.isTTY), "test must run without a TTY");
  await withTmp(async (root) => {
    const skillDir = await makeSkill(root);
    const create = await runCli(["create", skillDir, "--guided", "--interactive"]);
    assert.equal(create.exitCode, 1);
    assert.match(create.stderr, /terminal/i);

    const browse = await runCli(["browse", root]);
    assert.equal(browse.exitCode, 1);
    assert.match(browse.stderr, /terminal/i);
  });
});
