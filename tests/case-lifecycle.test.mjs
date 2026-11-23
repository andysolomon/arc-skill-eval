// Case lifecycle through the real CLI (`dist/bin/arc-skill-eval.js run`)
// with a fake `claude` binary on PATH. Unit tests with injected invokers
// can't see these failures, because they live in process handling and temp-dir
// cleanup:
//
//   1. A hung harness is never killed, so `run` hangs forever.
//   2. A timed-out or cancelled case leaves its child process running.
//   3. A failed, timed-out or cancelled case leaves its temp
//      workspace (with staged `.claude/skills`) in the temp dir.
//   4. A timeout is recorded with the wrong message, or aborts the whole run
//      instead of failing just that case.
//   5. Ctrl-C exits with the wrong code or skips cleanup.
//
// Each test writes the CLI's stdout/stderr to test-artifacts/case-lifecycle/
// so a run leaves a reviewable record.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "case-lifecycle");

const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.FAKE_CLAUDE_PID_FILE, String(process.pid));
const mode = process.env.FAKE_CLAUDE_MODE;
if (mode === "fail") {
  process.stderr.write("simulated harness crash\\n");
  process.exit(3);
}
if (mode === "hang") {
  setInterval(() => {}, 1000);
}
`;

async function setup(mode) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-lifecycle-"));
  const binDir = path.join(root, "bin");
  const runTmp = path.join(root, "run-tmp");
  const skillDir = path.join(root, "repo", "skills", "lifecycle-demo");
  await mkdir(binDir, { recursive: true });
  await mkdir(runTmp, { recursive: true });
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(binDir, "claude"), FAKE_CLAUDE, "utf8");
  await chmod(path.join(binDir, "claude"), 0o755);
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: lifecycle-demo\ndescription: Case lifecycle fixture skill.\n---\n",
    "utf8",
  );
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "lifecycle-demo",
      evals: [
        { id: "first", prompt: "Do the thing", files: [], assertions: [{ type: "file-exists", path: "x.txt" }] },
        { id: "second", prompt: "Do it again", files: [], assertions: [{ type: "file-exists", path: "y.txt" }] },
      ],
    }),
    "utf8",
  );
  return {
    root,
    skillDir,
    runTmp,
    pidFile: path.join(root, "claude.pid"),
    outputDir: path.join(root, "out"),
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      TMPDIR: runTmp,
      ANTHROPIC_API_KEY: "test-key-not-used",
      FAKE_CLAUDE_MODE: mode,
      FAKE_CLAUDE_PID_FILE: path.join(root, "claude.pid"),
    },
  };
}

function startCli(ctx, extraArgs = []) {
  const child = spawn(
    process.execPath,
    [cliPath, "run", ctx.skillDir, "--runtime", "claude-code", "--output-dir", ctx.outputDir, "--json", ...extraArgs],
    { env: ctx.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const done = new Promise((resolve) => {
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  return { child, done };
}

async function withDeadline(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForFile(file, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      return await readFile(file, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`timed out waiting for ${file}`);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && isAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isAlive(pid);
}

async function leftoverCaseDirs(ctx) {
  // The CLI's temp dir is ours alone, so anything left in it is a leak.
  return await readdir(ctx.runTmp);
}

async function saveArtifact(name, result) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, `${name}.json`),
    `${JSON.stringify({ exitCode: result.code, stdout: result.stdout, stderr: result.stderr }, null, 2)}\n`,
    "utf8",
  );
}

test("--case-timeout kills a hung harness, fails only that case, and removes its workspace", async () => {
  const ctx = await setup("hang");
  const result = await withDeadline(startCli(ctx, ["--case-timeout", "1"]).done, 30_000, "timed-out run");
  await saveArtifact("timeout", result);

  assert.equal(result.code, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  const errors = report.skills[0].errors;
  assert.deepEqual(
    errors.map((error) => error.caseId),
    ["first", "second"],
    "both cases ran; the first timeout did not abort the run",
  );
  for (const error of errors) {
    assert.match(error.message, /timed out after 1s; the agent was stopped/);
  }

  const lastPid = Number(await readFile(ctx.pidFile, "utf8"));
  assert.ok(await waitForExit(lastPid, 8_000), "fake claude child was killed");
  assert.deepEqual(await leftoverCaseDirs(ctx), []);
});

test("Ctrl-C cancels the run with exit 130, kills the harness, and cleans up", async () => {
  const ctx = await setup("hang");
  const cli = startCli(ctx);
  const pid = Number(await waitForFile(ctx.pidFile, 15_000));
  cli.child.kill("SIGINT");
  const result = await withDeadline(cli.done, 15_000, "cancelled run");
  await saveArtifact("ctrl-c", result);

  assert.equal(result.code, 130, result.stderr);
  const { error } = JSON.parse(result.stdout);
  assert.equal(error.kind, "cancelled");
  assert.match(error.message, /Run cancelled/);
  assert.ok(await waitForExit(pid, 8_000), "fake claude child was killed");
  assert.deepEqual(await leftoverCaseDirs(ctx), []);
});

test("a harness that exits non-zero is recorded per case and leaves no workspace behind", async () => {
  const ctx = await setup("fail");
  const result = await withDeadline(startCli(ctx).done, 30_000, "failing run");
  await saveArtifact("harness-exit", result);

  assert.equal(result.code, 1, result.stderr);
  const errors = JSON.parse(result.stdout).skills[0].errors;
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /Claude Code run failed for case first \(exit 3\)\. stderr: simulated harness crash/);
  assert.deepEqual(await leftoverCaseDirs(ctx), []);
});
