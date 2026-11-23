// `run --trials <n>` through the real CLI with a fake `claude` binary on PATH.
//
// One run per case cannot tell a real effect from luck. `--trials` repeats
// every case and reports what held across the repeats. Ways it could fail:
//
//   1. Each case still runs once, or the wrong number of times.
//   2. A later trial overwrites the first trial's artifacts.
//   3. A failure in a later trial does not fail the run.
//   4. An assertion that passes only sometimes is not reported as flaky, or a
//      steady one is.
//   5. A delta smaller than its run-to-run spread is reported as real, or a
//      steady delta is reported as noise.
//   6. A bad value (0, 1.5, abc) is accepted.
//   7. Without the flag, the run writes trial output.
//   8. `--stamp` records a suite that failed in a later trial.
//   9. A trial leaves its workspace behind.
//
// Each test writes the CLI's output to test-artifacts/run-trials/.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "run-trials");

// Always writes always.txt. With the skill staged it also writes earned.txt,
// except on its second with-skill call when FAKE_CLAUDE_MODE is "flaky".
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const withSkill = fs.existsSync(path.join(cwd, ".claude", "skills", "trials-demo", "SKILL.md"));
const counter = process.env.FAKE_COUNTER + (withSkill ? ".with" : ".without");
const call = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
fs.writeFileSync(counter, String(call));
fs.writeFileSync(path.join(cwd, "always.txt"), "call " + call + "\\n");
if (withSkill && !(process.env.FAKE_CLAUDE_MODE === "flaky" && call === 2)) {
  fs.writeFileSync(path.join(cwd, "earned.txt"), "call " + call + "\\n");
}
process.stdout.write(JSON.stringify({ type: "result", result: "call " + call, session_id: "fake" }) + "\\n");
`;

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "arc-trials-"));
  const skillDir = path.join(root, "repo", "skills", "trials-demo");
  await mkdir(path.join(root, "run-tmp"), { recursive: true });
  await write(path.join(root, "bin", "claude"), FAKE_CLAUDE);
  await chmod(path.join(root, "bin", "claude"), 0o755);
  await write(path.join(skillDir, "SKILL.md"), "---\nname: trials-demo\ndescription: Trials fixture skill.\n---\n");
  await write(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "trials-demo",
      evals: [
        {
          id: "writes-files",
          prompt: "Write the files.",
          assertions: [
            { type: "file-exists", path: "always.txt" },
            { type: "file-exists", path: "earned.txt" },
          ],
        },
      ],
    }),
  );
  return { root, skillDir, runTmp: path.join(root, "run-tmp") };
}

function cli(ctx, label, mode, extraArgs) {
  const args = [cliPath, "run", ctx.skillDir, "--runtime", "claude-code", "--output-dir", path.join(ctx.root, `out-${label}`), ...extraArgs];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      {
        env: {
          ...process.env,
          PATH: `${path.join(ctx.root, "bin")}${path.delimiter}${process.env.PATH}`,
          TMPDIR: ctx.runTmp,
          ANTHROPIC_API_KEY: "test-key-not-used",
          FAKE_CLAUDE_MODE: mode,
          FAKE_COUNTER: path.join(ctx.root, `counter-${label}`),
        },
      },
      async (error, stdout, stderr) => {
        const result = { code: error ? error.code : 0, stdout, stderr };
        await mkdir(artifactDir, { recursive: true });
        await writeFile(path.join(artifactDir, `${label}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
        resolve(result);
      },
    );
  });
}

const callCount = async (ctx, label, variant) => Number(await readFile(path.join(ctx.root, `counter-${label}.${variant}`), "utf8"));

test("--trials repeats every case, keeps each trial's artifacts, and fails on a flaky assertion", async () => {
  const ctx = await setup();
  const result = await cli(ctx, "flaky", "flaky", ["--compare", "--trials", "3", "--stamp", "--json"]);

  assert.equal(result.code, 1, "a failure in trial 2 fails the run");
  assert.equal(await callCount(ctx, "flaky", "with"), 3);
  assert.equal(await callCount(ctx, "flaky", "without"), 3);

  const report = JSON.parse(result.stdout);
  const [skill] = report.skills;
  assert.equal(report.summary.failedTrials, 1);
  assert.equal(skill.sync.stamped, false, "a suite that failed in a later trial is not stamped");

  // Trial 1 stays where a single run puts it; later trials sit beside it.
  const firstTrial = path.join(skill.outputDir, "eval-writes-files", "with_skill", "outputs", "always.txt");
  assert.equal(await readFile(firstTrial, "utf8"), "call 1\n");
  const secondTrial = path.join(skill.outputDir, "trial-2", "eval-writes-files", "with_skill", "outputs");
  assert.equal(await readFile(path.join(secondTrial, "always.txt"), "utf8"), "call 2\n");
  assert.equal(existsSync(path.join(secondTrial, "earned.txt")), false);

  const trials = JSON.parse(await readFile(skill.trialsPath, "utf8"));
  assert.equal(trials.trials, 3);
  assert.deepEqual(
    trials.cases[0].assertions.map(({ text, passed_trials, graded_trials, flaky }) => ({ text, passed_trials, graded_trials, flaky })),
    [
      { text: "file-exists: always.txt", passed_trials: 3, graded_trials: 3, flaky: false },
      { text: "file-exists: earned.txt", passed_trials: 2, graded_trials: 3, flaky: true },
    ],
  );
  // With the skill: 2/2, 1/2, 2/2. Without: 1/2 every time.
  assert.deepEqual(trials.delta.per_trial, [0.5, 0, 0.5]);
  assert.equal(trials.delta.median, 0.5);
  assert.equal(trials.delta.spread, 0.5);
  assert.equal(trials.delta.measurable, false, "a gap no larger than its spread is not a measured difference");

  assert.deepEqual(await readdir(ctx.runTmp), []);
});

test("a delta that holds in every trial is reported as measurable", async () => {
  const ctx = await setup();
  const result = await cli(ctx, "steady", "steady", ["--compare", "--trials", "3"]);

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Across 3 trials: median delta \+50\.0%, range \+50\.0% to \+50\.0%/);
  assert.match(result.stdout, /larger than the run-to-run spread/);
  assert.doesNotMatch(result.stdout, /FLAKY/);
});

test("without --trials nothing about the run changes, and bad values are refused", async () => {
  const ctx = await setup();
  const single = await cli(ctx, "single", "steady", ["--json"]);
  assert.equal(single.code, 0, single.stderr);
  const [skill] = JSON.parse(single.stdout).skills;
  assert.equal(await callCount(ctx, "single", "with"), 1);
  assert.equal(skill.trialsPath, undefined);
  assert.deepEqual((await readdir(skill.outputDir)).sort(), ["eval-writes-files"]);

  for (const bad of ["0", "1.5", "abc"]) {
    const refused = await cli(ctx, `bad-${bad}`, "steady", ["--trials", bad, "--json"]);
    assert.equal(refused.code, 1);
    assert.equal(JSON.parse(refused.stdout).error.kind, "usage", `--trials ${bad}`);
  }
});
