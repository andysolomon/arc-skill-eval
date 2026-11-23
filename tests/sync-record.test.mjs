// The sync record, through the real CLI with a fake `claude` binary on PATH.
//
// `run --stamp` writes `evals/sync.json`: the hashes of the skill's files and
// of the suite, taken when the whole suite last passed. `audit` compares them
// with what is on disk, so a suite that passed against an older SKILL.md is
// reported instead of trusted. Ways this could fail:
//
//   1. A failing run is stamped, so a broken suite looks confirmed.
//   2. A partial run (`--case`) is stamped as if the whole suite passed.
//   3. A changed SKILL.md or reference file goes unreported.
//   4. A changed evals.json or fixture goes unreported.
//   5. Audit reports a change when nothing changed: run output under
//      evals-runs/, or sync.json itself, leaked into the hash.
//   6. A corrupt sync.json crashes the audit.
//
// Each step writes the CLI's output to test-artifacts/sync-record/.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "sync-record");

// Writes out.txt unless told to fail; the suite asserts on out.txt.
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
if (process.env.FAKE_CLAUDE_MODE !== "no-output") {
  fs.writeFileSync(path.join(process.cwd(), "out.txt"), "done\\n");
}
process.stdout.write(JSON.stringify({ type: "result", result: "done", session_id: "fake" }) + "\\n");
`;

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "arc-sync-"));
  const skillDir = path.join(root, "repo", "skills", "sync-demo");
  await mkdir(path.join(root, "run-tmp"), { recursive: true });
  await write(path.join(root, "bin", "claude"), FAKE_CLAUDE);
  await chmod(path.join(root, "bin", "claude"), 0o755);
  await write(path.join(skillDir, "SKILL.md"), "---\nname: sync-demo\ndescription: Sync record fixture skill.\n---\n");
  await write(path.join(skillDir, "references", "guide.md"), "# Guide\n");
  await write(path.join(skillDir, "evals", "files", "repo", "seed.txt"), "seed\n");
  await write(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "sync-demo",
      evals: [
        { id: "first", prompt: "Write out.txt.", assertions: [{ type: "file-exists", path: "out.txt" }] },
        { id: "second", prompt: "Write out.txt again.", assertions: [{ type: "file-exists", path: "out.txt" }] },
      ],
    }),
  );
  return { root, skillDir, syncPath: path.join(skillDir, "evals", "sync.json") };
}

let step = 0;
function cli(ctx, label, args, mode = "ok") {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      {
        env: {
          ...process.env,
          PATH: `${path.join(ctx.root, "bin")}${path.delimiter}${process.env.PATH}`,
          TMPDIR: path.join(ctx.root, "run-tmp"),
          ANTHROPIC_API_KEY: "test-key-not-used",
          FAKE_CLAUDE_MODE: mode,
        },
      },
      async (error, stdout, stderr) => {
        const result = { code: error ? error.code : 0, stdout, stderr };
        await mkdir(artifactDir, { recursive: true });
        step += 1;
        await writeFile(
          path.join(artifactDir, `${String(step).padStart(2, "0")}-${label}.json`),
          `${JSON.stringify({ args: args.slice(0, 1).concat(args.slice(2)), ...result }, null, 2)}\n`,
          "utf8",
        );
        resolve(result);
      },
    );
  });
}

const runArgs = (ctx, ...extra) => ["run", ctx.skillDir, "--runtime", "claude-code", "--json", ...extra];

async function syncFindings(ctx, label) {
  const result = await cli(ctx, label, ["audit", ctx.skillDir, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout).skills[0].findings.filter((finding) => finding.category === "eval-sync");
}

test("--stamp records only a full passing run", async () => {
  const ctx = await setup();

  const failing = await cli(ctx, "stamp-failing-run", runArgs(ctx, "--stamp"), "no-output");
  assert.equal(failing.code, 1, failing.stderr);
  assert.equal(existsSync(ctx.syncPath), false, "a failing run must not be stamped");
  assert.equal(JSON.parse(failing.stdout).skills[0].sync.stamped, false);

  const partial = await cli(ctx, "stamp-partial-run", runArgs(ctx, "--stamp", "--case", "first"));
  assert.equal(partial.code, 0, partial.stderr);
  assert.equal(existsSync(ctx.syncPath), false, "a partial run must not be stamped");
  assert.match(JSON.parse(partial.stdout).skills[0].sync.reason, /--case/);

  const passing = await cli(ctx, "stamp-passing-run", runArgs(ctx, "--stamp"));
  assert.equal(passing.code, 0, passing.stderr);
  const { sync, outputDir } = JSON.parse(passing.stdout).skills[0];
  assert.equal(sync.stamped, true);
  assert.equal(sync.path, ctx.syncPath);

  const record = JSON.parse(await readFile(ctx.syncPath, "utf8"));
  assert.equal(record.run_id, path.basename(outputDir));
  assert.deepEqual(Object.keys(record.skill).sort(), ["SKILL.md", "references/guide.md"]);
  assert.deepEqual(Object.keys(record.suite).sort(), ["evals.json", "files/repo/seed.txt"]);
});

test("audit reports a skill or suite that changed after the stamp, and nothing else", async () => {
  const ctx = await setup();

  const before = await syncFindings(ctx, "audit-unstamped");
  assert.equal(before.length, 1);
  assert.equal(before[0].severity, "info");
  assert.match(before[0].message, /--stamp/);

  await cli(ctx, "stamp", runArgs(ctx, "--stamp"));
  // A later run writes evals-runs/ inside the skill directory.
  await cli(ctx, "later-run", runArgs(ctx));
  assert.deepEqual(await syncFindings(ctx, "audit-in-sync"), []);

  const guide = path.join(ctx.skillDir, "references", "guide.md");
  await writeFile(guide, "# Guide\n\nA new rule.\n", "utf8");
  await write(path.join(ctx.skillDir, "references", "extra.md"), "# Extra\n");
  const skillChanged = await syncFindings(ctx, "audit-skill-changed");
  assert.equal(skillChanged.length, 1, JSON.stringify(skillChanged, null, 2));
  assert.equal(skillChanged[0].severity, "warn");
  assert.match(skillChanged[0].message, /references\/guide\.md/);
  assert.match(skillChanged[0].message, /references\/extra\.md/);
  assert.doesNotMatch(skillChanged[0].message, /SKILL\.md/);

  await cli(ctx, "restamp", runArgs(ctx, "--stamp"));
  assert.deepEqual(await syncFindings(ctx, "audit-restamped"), []);

  await writeFile(path.join(ctx.skillDir, "evals", "files", "repo", "seed.txt"), "a different seed\n", "utf8");
  const suiteChanged = await syncFindings(ctx, "audit-suite-changed");
  assert.equal(suiteChanged.length, 1, JSON.stringify(suiteChanged, null, 2));
  assert.equal(suiteChanged[0].severity, "warn");
  assert.match(suiteChanged[0].message, /files\/repo\/seed\.txt/);

  await writeFile(ctx.syncPath, "{ not json", "utf8");
  const corrupt = await syncFindings(ctx, "audit-corrupt-record");
  assert.equal(corrupt.length, 1);
  assert.equal(corrupt[0].severity, "warn");
  assert.match(corrupt[0].message, /sync\.json/);
});
