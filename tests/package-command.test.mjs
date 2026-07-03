import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { packageCommand } from "../dist/cli/package-command.js";
import { parseCliArgs } from "../dist/cli/argv.js";
import { CliCommandError, CliUsageError } from "../dist/cli/types.js";

const execFileAsync = promisify(execFile);

const SKILL_MD = `---
name: demo-pack
description: Packages demo things.
---

# Demo pack

Does demo packaging.
`;

const VALID_EVALS = {
  skill_name: "demo-pack",
  evals: [
    {
      id: 1,
      prompt: "Use demo-pack to echo the word 'ready'.",
      assertions: [
        "The response contains the word 'ready'",
        { type: "regex-match", pattern: "\\bready\\b", flags: "i" },
      ],
    },
  ],
};

async function makeSkillDir({ evalsJson = VALID_EVALS } = {}) {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-package-skill-"));
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL_MD, "utf8");
  await mkdir(path.join(skillDir, "evals", "files"), { recursive: true });
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    typeof evalsJson === "string" ? evalsJson : `${JSON.stringify(evalsJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(skillDir, "evals", "files", "fixture.txt"), "fixture contents\n", "utf8");
  await mkdir(path.join(skillDir, "evals-runs"), { recursive: true });
  await writeFile(path.join(skillDir, "evals-runs", "junk.txt"), "must be excluded\n", "utf8");
  await writeFile(path.join(skillDir, ".hidden"), "dot files are excluded\n", "utf8");
  await writeFile(path.join(skillDir, "stale.skill.tgz"), "prior artifact must be excluded\n", "utf8");
  return skillDir;
}

async function makeOutputDir() {
  return mkdtemp(path.join(tmpdir(), "arc-package-out-"));
}

const exists = (p) => access(p).then(() => true, () => false);

test("package creates a tgz containing the skill files plus manifest.json and excludes evals-runs", async () => {
  const skillDir = await makeSkillDir();
  const output = path.join(await makeOutputDir(), "demo-pack.skill.tgz");

  const result = await packageCommand({ skillDir, output });

  assert.equal(result.skillName, "demo-pack");
  assert.equal(result.outputPath, output);
  assert.ok(await exists(output));

  const { stdout } = await execFileAsync("tar", ["-tzf", output]);
  const listed = stdout.split("\n").map((line) => line.trim().replace(/\/$/, "")).filter(Boolean);
  assert.ok(listed.includes("demo-pack/SKILL.md"));
  assert.ok(listed.includes("demo-pack/evals/evals.json"));
  assert.ok(listed.includes("demo-pack/evals/files/fixture.txt"));
  assert.ok(listed.includes("demo-pack/manifest.json"));
  assert.ok(!listed.some((entry) => entry.includes("evals-runs")));
  assert.ok(!listed.some((entry) => entry.includes(".hidden")));
  assert.ok(!listed.some((entry) => entry.includes("stale.skill.tgz")));
});

test("manifest records name, sorted files, and sha256 hashes that match the packaged contents", async () => {
  const skillDir = await makeSkillDir();
  const outputDir = await makeOutputDir();
  const output = path.join(outputDir, "demo-pack.skill.tgz");

  const result = await packageCommand({ skillDir, output });

  await execFileAsync("tar", ["-xzf", output, "-C", outputDir]);
  const manifest = JSON.parse(await readFile(path.join(outputDir, "demo-pack", "manifest.json"), "utf8"));

  assert.equal(manifest.name, "demo-pack");
  assert.equal(manifest.description, "Packages demo things.");
  assert.equal(typeof manifest.arc_skill_eval_version, "string");
  assert.ok(!Number.isNaN(Date.parse(manifest.created_at)));
  assert.deepEqual(manifest.files, result.manifest.files);

  const paths = manifest.files.map((entry) => entry.path);
  assert.deepEqual(paths, [...paths].sort());
  assert.deepEqual(paths, ["SKILL.md", "evals/evals.json", "evals/files/fixture.txt"]);

  for (const entry of manifest.files) {
    const contents = await readFile(path.join(outputDir, "demo-pack", entry.path));
    assert.equal(entry.sha256, createHash("sha256").update(contents).digest("hex"), `sha256 mismatch for ${entry.path}`);
    assert.equal(entry.bytes, contents.byteLength, `byte count mismatch for ${entry.path}`);
  }

  assert.equal(result.fileCount, manifest.files.length);
  assert.equal(result.totalBytes, manifest.files.reduce((sum, entry) => sum + entry.bytes, 0));
});

test("packaging the same skill twice is deterministic apart from created_at", async () => {
  const skillDir = await makeSkillDir();
  const outputDir = await makeOutputDir();

  const first = await packageCommand({ skillDir, output: path.join(outputDir, "first.skill.tgz") });
  const second = await packageCommand({ skillDir, output: path.join(outputDir, "second.skill.tgz") });

  assert.deepEqual(first.manifest.files, second.manifest.files);
  assert.equal(first.manifest.name, second.manifest.name);
  assert.equal(first.manifest.arc_skill_eval_version, second.manifest.arc_skill_eval_version);
});

test("invalid evals.json rejects with a CliCommandError and writes no artifact", async () => {
  const skillDir = await makeSkillDir({ evalsJson: "{ not valid json" });
  const output = path.join(await makeOutputDir(), "demo-pack.skill.tgz");

  await assert.rejects(
    () => packageCommand({ skillDir, output }),
    (error) => error instanceof CliCommandError && /Invalid JSON/.test(error.message),
  );
  assert.ok(!(await exists(output)));
});

test("missing SKILL.md rejects and writes no artifact", async () => {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-package-noskill-"));
  const output = path.join(await makeOutputDir(), "demo-pack.skill.tgz");

  await assert.rejects(
    () => packageCommand({ skillDir, output }),
    (error) => error instanceof CliCommandError && /Could not read SKILL\.md/.test(error.message),
  );
  assert.ok(!(await exists(output)));
});

test("refuses to overwrite an existing artifact without --force, and overwrites with it", async () => {
  const skillDir = await makeSkillDir();
  const output = path.join(await makeOutputDir(), "demo-pack.skill.tgz");
  await writeFile(output, "pre-existing artifact\n", "utf8");

  await assert.rejects(
    () => packageCommand({ skillDir, output }),
    (error) => error instanceof CliCommandError && /Refusing to overwrite/.test(error.message) && /--force/.test(error.message),
  );
  assert.equal(await readFile(output, "utf8"), "pre-existing artifact\n");

  const result = await packageCommand({ skillDir, output, force: true });
  assert.equal(result.outputPath, output);
  const { stdout } = await execFileAsync("tar", ["-tzf", output]);
  assert.ok(stdout.includes("demo-pack/manifest.json"));
});

test("parseCliArgs parses the package command flags and rejects unknown flags", () => {
  assert.deepEqual(parseCliArgs(["package", "./my-skill"]), {
    command: "package",
    skillDir: "./my-skill",
    output: undefined,
    force: false,
  });

  assert.deepEqual(parseCliArgs(["package", "./my-skill", "--output", "dist/my.skill.tgz", "--force"]), {
    command: "package",
    skillDir: "./my-skill",
    output: "dist/my.skill.tgz",
    force: true,
  });

  assert.deepEqual(parseCliArgs(["package", "--output=out.skill.tgz", "./my-skill"]), {
    command: "package",
    skillDir: "./my-skill",
    output: "out.skill.tgz",
    force: false,
  });

  assert.throws(() => parseCliArgs(["package"]), CliUsageError);
  assert.throws(() => parseCliArgs(["package", "a", "b"]), /Only one <skill-dir> positional argument is allowed/);
  assert.throws(() => parseCliArgs(["package", "./my-skill", "--nope"]), /Unknown flag: --nope/);
  assert.throws(() => parseCliArgs(["package", "./my-skill", "--output"]), /Flag --output requires a value/);
});
