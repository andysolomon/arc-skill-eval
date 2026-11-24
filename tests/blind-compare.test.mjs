// `run --compare` through the real CLI (`dist/bin/arc-skill-eval.js`) with a
// fake `claude` binary on PATH. The fake records what it can see and writes one
// file always and one file only when the skill is staged.
//
// Blinding: the agent under test should not be able to tell it is being
// tested, or read the suite that grades it. Ways that could fail:
//
//   1. The agent's working directory is named after the tool or the word eval.
//   2. The staged skill carries `evals/` (the answers) or `evals-runs/`.
//   3. The filter drops files the skill needs, or a nested folder that only
//      happens to be called `evals`.
//   4. An `--extra-skill` is staged unfiltered.
//   5. The renamed workspace is no longer removed after the run.
//   6. The staged skill is copied into outputs/ with what the agent wrote.
//
// Per-assertion comparison: a pass with the skill means little if the same
// assertion passes without it. Ways that could fail:
//
//   7. An assertion that passes both ways is not marked.
//   8. An assertion only the skill passes is marked as telling nothing.
//   9. An assertion that fails both ways is counted as passing both ways.
//  10. The plain-text report says nothing about it.
//
// Each test writes the CLI's output and the fake harness's log to
// test-artifacts/blind-compare/.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "blind-compare");

const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const skillsRoot = path.join(cwd, ".claude", "skills");
const staged = fs.existsSync(skillsRoot)
  ? fs.readdirSync(skillsRoot, { recursive: true }).map((entry) => String(entry).split(path.sep).join("/")).sort()
  : [];
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cwd, staged }) + "\\n");
fs.writeFileSync(path.join(cwd, "always.txt"), "written every time\\n");
if (staged.includes("blind-demo/SKILL.md")) {
  fs.writeFileSync(path.join(cwd, "earned.txt"), "written only with the skill\\n");
}
process.stdout.write(JSON.stringify({ type: "result", result: "done", session_id: "fake" }) + "\\n");
`;

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "arc-blind-"));
  const runTmp = path.join(root, "run-tmp");
  const skillDir = path.join(root, "repo", "skills", "blind-demo");
  const extraDir = path.join(root, "repo", "skills", "other");
  await mkdir(runTmp, { recursive: true });
  await write(path.join(root, "bin", "claude"), FAKE_CLAUDE);
  await chmod(path.join(root, "bin", "claude"), 0o755);

  await write(path.join(skillDir, "SKILL.md"), "---\nname: blind-demo\ndescription: Blinding fixture skill.\n---\n");
  await write(path.join(skillDir, "references", "guide.md"), "# Guide\n");
  await write(path.join(skillDir, "references", "evals", "notes.md"), "# A nested folder the skill owns\n");
  await write(path.join(skillDir, "evals-runs", "old", "benchmark.json"), "{}\n");
  await write(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "blind-demo",
      evals: [
        {
          id: "writes-files",
          prompt: "Write the files.",
          assertions: [
            { type: "file-exists", path: "always.txt" },
            { type: "file-exists", path: "earned.txt" },
            { type: "file-exists", path: "never.txt" },
            { type: "regex-match", pattern: "^done$", target: "assistant-text" },
          ],
        },
      ],
    }),
  );

  await write(path.join(extraDir, "SKILL.md"), "---\nname: other\ndescription: A distractor skill.\n---\n");
  await write(path.join(extraDir, "evals", "evals.json"), JSON.stringify({ skill_name: "other", evals: [] }));

  return {
    root,
    runTmp,
    skillDir,
    extraDir,
    logFile: path.join(root, "harness.log"),
    env: {
      ...process.env,
      PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`,
      TMPDIR: runTmp,
      ANTHROPIC_API_KEY: "test-key-not-used",
      FAKE_LOG: path.join(root, "harness.log"),
    },
  };
}

function runCli(ctx, name, extraArgs) {
  const args = [
    cliPath,
    "run",
    ctx.skillDir,
    "--runtime",
    "claude-code",
    "--compare",
    "--extra-skill",
    ctx.extraDir,
    "--output-dir",
    path.join(ctx.root, `out-${name}`),
    ...extraArgs,
  ];
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env: ctx.env }, async (error, stdout, stderr) => {
      const result = { code: error ? error.code : 0, stdout, stderr };
      await mkdir(artifactDir, { recursive: true });
      await writeFile(path.join(artifactDir, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
      resolve(result);
    });
  });
}

async function readLog(ctx, name) {
  const text = await readFile(ctx.logFile, "utf8");
  await writeFile(path.join(artifactDir, `${name}.harness.log`), text, "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line));
}

test("the agent cannot see that it is being tested, or the suite that grades it", async () => {
  const ctx = await setup();
  const result = await runCli(ctx, "blinding", ["--json"]);
  assert.equal(result.code, 1, result.stderr);

  const calls = await readLog(ctx, "blinding");
  assert.equal(calls.length, 2, "one harness call per variant");

  for (const call of calls) {
    const visible = path.relative(ctx.runTmp, call.cwd);
    assert.doesNotMatch(visible, /eval|test|judge|bench|rubric|score|arc-skill/i, `working directory gives the test away: ${visible}`);
    for (const entry of call.staged) {
      assert.doesNotMatch(entry, /^[^/]+\/evals(-runs)?(\/|$)/, `staged skill carries ${entry}`);
    }
    assert.ok(call.staged.includes("other/SKILL.md"), "the extra skill is staged");
  }

  const withSkill = calls.find((call) => call.staged.includes("blind-demo/SKILL.md"));
  assert.ok(withSkill, "the skill is staged in one variant");
  assert.ok(withSkill.staged.includes("blind-demo/references/guide.md"));
  assert.ok(withSkill.staged.includes("blind-demo/references/evals/notes.md"), "a nested evals folder is the skill's own");

  assert.deepEqual(await readdir(ctx.runTmp), [], "every workspace was removed");

  const [skill] = JSON.parse(result.stdout).skills;
  for (const variant of ["with_skill", "without_skill"]) {
    const variantDir = path.join(skill.outputDir, "eval-writes-files", variant);
    const grading = JSON.parse(await readFile(path.join(variantDir, "grading.json"), "utf8"));
    const answer = grading.assertion_results.find((assertion) => assertion.text.startsWith("regex-match"));
    assert.equal(answer.passed, true, `${variant}: ${answer.evidence}`);

    const outputs = (await readdir(path.join(variantDir, "outputs"), { recursive: true })).map((entry) => entry.split(path.sep).join("/"));
    assert.ok(outputs.includes("always.txt"), `${variant} outputs/ holds what the agent wrote`);
    assert.ok(!outputs.some((entry) => entry.startsWith(".claude/skills")), `${variant} outputs/ carries the staged skill`);
  }
});

test("benchmark.json says which assertions pass without the skill too", async () => {
  const ctx = await setup();
  const result = await runCli(ctx, "per-assertion", ["--json"]);
  assert.equal(result.code, 1, result.stderr);

  const [skill] = JSON.parse(result.stdout).skills;
  const benchmark = JSON.parse(await readFile(skill.benchmarkPath, "utf8"));

  assert.deepEqual(
    benchmark.cases[0].assertions.map(({ text, with_skill, without_skill, discriminates }) => ({
      text,
      with_skill,
      without_skill,
      discriminates,
    })),
    [
      { text: "file-exists: always.txt", with_skill: true, without_skill: true, discriminates: false },
      { text: "file-exists: earned.txt", with_skill: true, without_skill: false, discriminates: true },
      { text: "file-exists: never.txt", with_skill: false, without_skill: false, discriminates: false },
      { text: "regex-match: /^done$/ in assistant-text", with_skill: true, without_skill: true, discriminates: false },
    ],
  );
  assert.equal(benchmark.summary.assertions_passing_in_both, 2);

  const text = await runCli(ctx, "per-assertion-text", []);
  assert.match(text.stdout, /2 of 4 assertions passed without the skill too/);
});
