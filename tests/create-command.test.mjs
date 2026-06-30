import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CliCommandError, createCommand, readEvalsJson, runCli } from "../dist/index.js";

async function createSkillFixture({ name = "demo-skill", description = "Helps write demo files." } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-create-"));
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
  return { root, skillDir };
}

test("createCommand writes a valid starter eval suite", async () => {
  const { root, skillDir } = await createSkillFixture();

  try {
    const result = await createCommand({ skillDir });

    assert.equal(result.written, true);
    assert.equal(result.dryRun, false);
    assert.equal(result.evals.skill_name, "demo-skill");
    assert.deepEqual(result.evals.evals.map((item) => item.id), [
      "trigger-explicit",
      "execution-golden-path",
      "adjacent-negative",
    ]);

    const written = await readEvalsJson(path.join(skillDir, "evals", "evals.json"));
    assert.equal(written.skill_name, "demo-skill");
    assert.equal(written.evals.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand infers deterministic file and JSON assertions", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "artifact-skill",
    description: "Writes `plan.md` and `report.json` for release planning.",
  });

  try {
    const result = await createCommand({ skillDir, dryRun: true });
    const executionCase = result.evals.evals.find((item) => item.id === "execution-golden-path");

    assert(executionCase);
    assert.match(executionCase.prompt, /`plan\.md`/);
    assert.match(executionCase.prompt, /`report\.json`/);
    assert.deepEqual(executionCase.assertions.slice(0, 3), [
      { type: "file-exists", path: "plan.md" },
      { type: "file-exists", path: "report.json" },
      { type: "json-valid", path: "report.json" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand refuses to overwrite existing evals without force", async () => {
  const { root, skillDir } = await createSkillFixture();
  const evalsDir = path.join(skillDir, "evals");

  try {
    await mkdir(evalsDir, { recursive: true });
    await writeFile(path.join(evalsDir, "evals.json"), "existing", "utf8");

    await assert.rejects(() => createCommand({ skillDir }), CliCommandError);
    assert.equal(await readFile(path.join(evalsDir, "evals.json"), "utf8"), "existing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand supports dry-run without writing files", async () => {
  const { root, skillDir } = await createSkillFixture();

  try {
    const result = await createCommand({ skillDir, dryRun: true });

    assert.equal(result.written, false);
    assert.equal(result.evals.evals.length, 3);
    await assert.rejects(() => readFile(path.join(skillDir, "evals", "evals.json")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand overwrites with force", async () => {
  const { root, skillDir } = await createSkillFixture();
  const evalsDir = path.join(skillDir, "evals");

  try {
    await mkdir(evalsDir, { recursive: true });
    await writeFile(path.join(evalsDir, "evals.json"), "existing", "utf8");

    const result = await createCommand({ skillDir, force: true });
    assert.equal(result.written, true);
    const written = JSON.parse(await readFile(path.join(evalsDir, "evals.json"), "utf8"));
    assert.equal(written.skill_name, "demo-skill");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCli handles create dry-run", async () => {
  const { root, skillDir } = await createSkillFixture();

  try {
    const result = await runCli(["create", skillDir, "--dry-run"]);

    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.skill_name, "demo-skill");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
