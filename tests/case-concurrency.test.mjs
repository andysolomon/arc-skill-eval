// `run --concurrency <n>` through the real CLI (`dist/bin/arc-skill-eval.js`)
// with a fake `claude` binary on PATH. Ways it could fail:
//
//   1. More than <n> cases run at once (the pool isn't bounded).
//   2. Cases still run one at a time with <n> > 1.
//   3. Results come back in completion order instead of evals.json order.
//   4. One failing case stops or skips the others.
//   5. Ctrl-C with several cases in flight leaves a harness child running or a
//      case workspace behind, or the CLI exits before cleanup finishes.
//   6. Cases keep starting after Ctrl-C.
//   7. A bad --concurrency value (0, -1, 1.5, abc) is accepted.
//   8. Without the flag, cases run in parallel (the default must stay 1).
//
// Each test writes the CLI's stdout/stderr and the fake harness's start/end
// log to test-artifacts/case-concurrency/ so a run leaves a reviewable record.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "case-concurrency");

// Logs "start"/"end" with a timestamp, then either fails after a delay that
// shrinks with the case number (so later cases finish first) or hangs.
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const prompt = process.argv.join(" ");
const caseNumber = Number((prompt.match(/Case number (\\d+)/) || [])[1] || 0);
const log = (event) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ event, caseNumber, pid: process.pid, at: Date.now() }) + "\\n");
fs.writeFileSync(path.join(process.env.FAKE_PID_DIR, String(process.pid)), "");
log("start");
if (process.env.FAKE_CLAUDE_MODE === "hang") {
  setInterval(() => {}, 1000);
} else {
  const total = Number(process.env.FAKE_CASES);
  setTimeout(() => {
    log("end");
    process.stderr.write("simulated failure\\n");
    process.exit(3);
  }, 250 + (total - caseNumber) * 250);
}
`;

async function setup(mode, caseCount) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-concurrency-"));
  const binDir = path.join(root, "bin");
  const runTmp = path.join(root, "run-tmp");
  const pidDir = path.join(root, "pids");
  const skillDir = path.join(root, "repo", "skills", "concurrency-demo");
  for (const dir of [binDir, runTmp, pidDir, path.join(skillDir, "evals")]) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path.join(binDir, "claude"), FAKE_CLAUDE, "utf8");
  await chmod(path.join(binDir, "claude"), 0o755);
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: concurrency-demo\ndescription: Case concurrency fixture skill.\n---\n",
    "utf8",
  );
  const caseIds = Array.from({ length: caseCount }, (_, index) => `case-${index + 1}`);
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "concurrency-demo",
      evals: caseIds.map((id, index) => ({
        id,
        prompt: `Case number ${index + 1}`,
        assertions: [{ type: "file-exists", path: "x.txt" }],
      })),
    }),
    "utf8",
  );
  return {
    skillDir,
    runTmp,
    pidDir,
    caseIds,
    logFile: path.join(root, "harness.log"),
    outputDir: path.join(root, "out"),
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      TMPDIR: runTmp,
      ANTHROPIC_API_KEY: "test-key-not-used",
      FAKE_CLAUDE_MODE: mode,
      FAKE_CASES: String(caseCount),
      FAKE_LOG: path.join(root, "harness.log"),
      FAKE_PID_DIR: pidDir,
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
  const done = new Promise((resolve) => child.on("close", (code) => resolve({ code, stdout, stderr })));
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pids(ctx) {
  return (await readdir(ctx.pidDir)).map(Number);
}

async function waitForPids(ctx, count, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const found = await pids(ctx);
    if (found.length >= count) return found;
    await sleep(50);
  }
  throw new Error(`expected ${count} harness processes, saw ${(await pids(ctx)).length}`);
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
  while (Date.now() < until && isAlive(pid)) await sleep(50);
  return !isAlive(pid);
}

async function readLog(ctx) {
  try {
    return (await readFile(ctx.logFile, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** Most harness processes alive at the same moment, from the start/end log. */
function maxOverlap(events) {
  let live = 0;
  let max = 0;
  for (const event of [...events].sort((a, b) => a.at - b.at || (a.event === "end" ? -1 : 1))) {
    live += event.event === "start" ? 1 : -1;
    max = Math.max(max, live);
  }
  return max;
}

async function leftoverCaseDirs(ctx) {
  return (await readdir(ctx.runTmp)).filter((name) => name.startsWith("arc-skill-eval-"));
}

async function saveArtifact(name, result, events) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, `${name}.json`),
    `${JSON.stringify({ exitCode: result.code, stdout: result.stdout, stderr: result.stderr, harnessLog: events }, null, 2)}\n`,
    "utf8",
  );
}

test("--concurrency 2 runs two cases at a time, never three, and reports them in evals.json order", async () => {
  const ctx = await setup("fail", 4);
  const result = await withDeadline(startCli(ctx, ["--concurrency", "2"]).done, 30_000, "parallel run");
  const events = await readLog(ctx);
  await saveArtifact("parallel", result, events);

  assert.equal(result.code, 1, result.stderr);
  assert.equal(maxOverlap(events), 2, "exactly two harness processes overlapped");
  const ends = events.filter((event) => event.event === "end").map((event) => event.caseNumber);
  assert.notDeepEqual(ends, [1, 2, 3, 4], "cases finished out of order, so the order check below means something");

  const errors = JSON.parse(result.stdout).skills[0].errors;
  assert.deepEqual(errors.map((error) => error.caseId), ctx.caseIds, "every case ran despite failures, listed in evals.json order");
  assert.deepEqual(await leftoverCaseDirs(ctx), []);
});

test("without --concurrency, cases run one at a time", async () => {
  const ctx = await setup("fail", 3);
  const result = await withDeadline(startCli(ctx).done, 30_000, "sequential run");
  const events = await readLog(ctx);
  await saveArtifact("default-sequential", result, events);

  assert.equal(result.code, 1, result.stderr);
  assert.equal(maxOverlap(events), 1);
  assert.deepEqual(JSON.parse(result.stdout).skills[0].errors.map((error) => error.caseId), ctx.caseIds);
});

test("Ctrl-C with three cases in flight kills every harness, removes every workspace, and starts no new case", async () => {
  const ctx = await setup("hang", 5);
  const cli = startCli(ctx, ["--concurrency", "3"]);
  const running = await waitForPids(ctx, 3, 15_000);
  await sleep(300); // a fourth case must not start while three are running
  assert.equal((await pids(ctx)).length, 3);

  cli.child.kill("SIGINT");
  const result = await withDeadline(cli.done, 20_000, "cancelled parallel run");
  const events = await readLog(ctx);
  await saveArtifact("ctrl-c-parallel", result, events);

  assert.equal(result.code, 130, result.stderr);
  const { error } = JSON.parse(result.stdout);
  assert.equal(error.kind, "cancelled");
  assert.match(error.message, /Run cancelled/);
  for (const pid of running) {
    assert.ok(await waitForExit(pid, 8_000), `harness ${pid} was killed`);
  }
  assert.deepEqual(await leftoverCaseDirs(ctx), [], "workspaces were removed before the CLI exited");
  assert.equal((await pids(ctx)).length, 3, "no case started after Ctrl-C");
});

test("--concurrency rejects values that are not a positive integer", async () => {
  const ctx = await setup("fail", 1);
  for (const value of ["0", "-1", "1.5", "abc"]) {
    const result = await withDeadline(startCli(ctx, [`--concurrency=${value}`]).done, 15_000, `--concurrency=${value}`);
    assert.equal(result.code, 1, `--concurrency=${value} should fail`);
    const { error } = JSON.parse(result.stdout);
    assert.equal(error.kind, "usage");
    assert.match(error.message, /Invalid --concurrency/);
  }
  assert.deepEqual(await readLog(ctx), [], "no case ran");
});
