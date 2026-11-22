import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../dist/index.js";

// `install-skills` copies the bundled agent-facing skills into the folders each
// harness discovers skills from. Ways it can break, written before the
// implementation (AGENTS.md):
//
//  1. It overwrites a skill the user has edited in place, losing their work.
//  2. --force copies over an old install and leaves stale files behind, so the
//     harness loads a mix of old and new instructions.
//  3. It copies the skill's evals/ tree. arc-creating-evals ships fixture
//     SKILL.md files under evals/files/, and harnesses that scan recursively
//     would register those demo skills as real ones.
//  4. An unknown --harness or --skill is ignored and the command "succeeds"
//     having installed nothing useful.
//  5. A typo in --target silently creates a new directory tree somewhere else.
//  6. A harness with no Claude-style folder (codex, pi, …) gets nothing, or one
//     folder is written twice when two harnesses share it.

async function withTarget(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-install-skills-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function exists(p) {
  return stat(p).then(() => true, () => false);
}

async function listTree(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    out.push(rel);
    if (entry.isDirectory()) out.push(...(await listTree(path.join(dir, entry.name), rel)));
  }
  return out;
}

test("installs into .agents/skills and .claude/skills by default, without evals/", async () => {
  await withTarget(async (root) => {
    const result = await runCli(["install-skills", "--target", root, "--json"]);
    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    const body = JSON.parse(result.stdout);

    for (const dir of [".agents/skills", ".claude/skills"]) {
      for (const skill of ["arc-creating-evals", "arc-running-evals"]) {
        const skillDir = path.join(root, dir, skill);
        assert.ok(await exists(path.join(skillDir, "SKILL.md")), `${dir}/${skill}/SKILL.md`);
        const tree = await listTree(skillDir);
        assert.ok(!tree.some((p) => p === "evals" || p.startsWith(`evals${path.sep}`)), `${dir}/${skill} must not contain evals/`);
      }
    }
    assert.ok(body.installed.every((entry) => path.isAbsolute(entry.path)));
  });
});

test("--harness picks the folders that harness reads, without duplicates", async () => {
  await withTarget(async (root) => {
    const result = await runCli(["install-skills", "--target", root, "--harness", "codex", "--harness", "pi", "--skill", "arc-running-evals", "--json"]);
    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    const body = JSON.parse(result.stdout);
    assert.deepEqual(body.installed.map((entry) => path.relative(root, entry.path)), [path.join(".agents", "skills", "arc-running-evals")]);
    assert.ok(!(await exists(path.join(root, ".claude"))));
  });
});

test("an existing install is skipped unless --force, and --force removes stale files", async () => {
  await withTarget(async (root) => {
    const args = ["install-skills", "--target", root, "--harness", "claude-code", "--skill", "arc-running-evals", "--json"];
    assert.equal((await runCli(args)).exitCode, 0);

    const skillDir = path.join(root, ".claude", "skills", "arc-running-evals");
    await writeFile(path.join(skillDir, "SKILL.md"), "user edit\n", "utf8");
    await writeFile(path.join(skillDir, "stale.md"), "old\n", "utf8");

    const again = JSON.parse((await runCli(args)).stdout);
    assert.equal(again.installed.length, 0);
    assert.equal(again.skipped.length, 1);
    assert.equal(await readFile(path.join(skillDir, "SKILL.md"), "utf8"), "user edit\n");

    const forced = await runCli([...args, "--force"]);
    assert.equal(forced.exitCode, 0);
    assert.notEqual(await readFile(path.join(skillDir, "SKILL.md"), "utf8"), "user edit\n");
    assert.ok(!(await exists(path.join(skillDir, "stale.md"))));
  });
});

test("unknown harness, unknown skill, and missing target fail without writing", async () => {
  await withTarget(async (root) => {
    const harness = await runCli(["install-skills", "--target", root, "--harness", "vim"]);
    assert.equal(harness.exitCode, 1);
    assert.match(harness.stderr, /claude-code/);

    const skill = await runCli(["install-skills", "--target", root, "--skill", "nope"]);
    assert.equal(skill.exitCode, 1);

    const missing = path.join(root, "typo", "project");
    const target = await runCli(["install-skills", "--target", missing]);
    assert.equal(target.exitCode, 1);
    assert.ok(!(await exists(path.join(root, "typo"))));

    assert.deepEqual(await readdir(root), []);
  });
});

test("an existing non-skill directory is not overwritten", async () => {
  await withTarget(async (root) => {
    await mkdir(path.join(root, ".agents", "skills", "arc-running-evals"), { recursive: true });
    const result = JSON.parse((await runCli(["install-skills", "--target", root, "--harness", "codex", "--skill", "arc-running-evals", "--json"])).stdout);
    assert.equal(result.skipped.length, 1);
  });
});
