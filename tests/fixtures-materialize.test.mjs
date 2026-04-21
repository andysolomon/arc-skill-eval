import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  FIXTURE_GIT_USER_EMAIL,
  FIXTURE_GIT_USER_NAME,
  FixtureMaterializationError,
  materializeFixture,
  resolveFixtureSourcePath,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);

test("materializeFixture resolves relative sources, copies contents, applies git state, and returns structured cleanup", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-materialize-"));
  const fixtureSourceDir = path.join(tempRoot, "skills/alpha/fixtures/basic");
  const skillFiles = {
    skillName: "alpha",
    skillDir: path.join(tempRoot, "skills/alpha"),
    relativeSkillDir: "skills/alpha",
    skillDefinitionPath: path.join(tempRoot, "skills/alpha/SKILL.md"),
    evalDefinitionPath: path.join(tempRoot, "skills/alpha/skill.eval.ts"),
  };

  await mkdir(fixtureSourceDir, { recursive: true });
  await writeFile(path.join(skillFiles.skillDir, "SKILL.md"), "# Alpha\n", "utf8");
  await writeFile(path.join(skillFiles.skillDir, "skill.eval.ts"), "export default {};\n", "utf8");
  await writeFile(path.join(fixtureSourceDir, "README.md"), "fixture readme\n", "utf8");

  const fixture = {
    kind: "repo",
    source: "./fixtures/basic",
    env: { GREETING: "hello" },
    setup: createNodeStdoutCommand("process.stdout.write(process.env.GREETING ?? '')"),
    teardown: createNodeStdoutCommand("process.stdout.write(process.env.GREETING ?? '')"),
    git: {
      enabled: true,
      defaultBranch: "main",
      currentBranch: "feature/test",
      commits: [
        {
          message: "seed fixture",
          files: {
            "tracked.txt": "tracked\n",
          },
          tags: ["v1.0.0"],
        },
      ],
      dirtyFiles: {
        "dirty.txt": "dirty\n",
      },
      stagedFiles: ["dirty.txt"],
      remotes: [{ name: "origin", url: "https://example.com/repo.git" }],
    },
  };

  try {
    assert.equal(resolveFixtureSourcePath({ skillFiles, fixture }), fixtureSourceDir);

    const materialized = await materializeFixture({ skillFiles, fixture });

    assert.equal(materialized.sourcePath, fixtureSourceDir);
    assert.equal(materialized.env.GREETING, "hello");
    assert.equal(materialized.setup?.stdout, "hello");
    assert.equal(materialized.git?.defaultBranch, "main");
    assert.equal(materialized.git?.currentBranch, "feature/test");
    assert.equal(materialized.git?.commitCount, 1);
    assert.deepEqual(materialized.git?.remoteNames, ["origin"]);
    assert.deepEqual(materialized.git?.tagNames, ["v1.0.0"]);

    await access(path.join(materialized.workspaceDir, "README.md"), fsConstants.F_OK);
    await access(path.join(materialized.workspaceDir, "tracked.txt"), fsConstants.F_OK);

    assert.equal(await git(materialized.workspaceDir, ["rev-parse", "--abbrev-ref", "HEAD"]), "feature/test");
    assert.equal(await git(materialized.workspaceDir, ["remote", "get-url", "origin"]), "https://example.com/repo.git");
    assert.equal(await git(materialized.workspaceDir, ["tag", "--list"]), "v1.0.0");
    assert.match(await git(materialized.workspaceDir, ["status", "--short"]), /A\s+dirty.txt/u);
    assert.equal(
      await git(materialized.workspaceDir, ["log", "-1", "--format=%an <%ae>"]),
      `${FIXTURE_GIT_USER_NAME} <${FIXTURE_GIT_USER_EMAIL}>`,
    );

    const cleanup = await materialized.cleanup();

    assert.equal(cleanup.workspaceRemoved, true);
    assert.equal(cleanup.teardown?.stdout, "hello");
    await assert.rejects(() => access(materialized.workspaceDir, fsConstants.F_OK));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("materializeFixture surfaces setup failures with hook artifacts and a cleanup handle", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-materialize-fail-"));
  const fixtureSourceDir = path.join(tempRoot, "skills/alpha/fixtures/basic");
  const skillFiles = {
    skillName: "alpha",
    skillDir: path.join(tempRoot, "skills/alpha"),
    relativeSkillDir: "skills/alpha",
    skillDefinitionPath: path.join(tempRoot, "skills/alpha/SKILL.md"),
    evalDefinitionPath: path.join(tempRoot, "skills/alpha/skill.eval.ts"),
  };

  await mkdir(fixtureSourceDir, { recursive: true });
  await writeFile(path.join(skillFiles.skillDir, "SKILL.md"), "# Alpha\n", "utf8");
  await writeFile(path.join(skillFiles.skillDir, "skill.eval.ts"), "export default {};\n", "utf8");
  await writeFile(path.join(fixtureSourceDir, "README.md"), "fixture readme\n", "utf8");

  try {
    let caughtError;

    try {
      await materializeFixture({
        skillFiles,
        fixture: {
          kind: "docs",
          source: "./fixtures/basic",
          setup: createNodeStdoutCommand("process.stderr.write('boom'); process.exit(7)"),
        },
      });
    } catch (error) {
      caughtError = error;
    }

    assert.ok(caughtError instanceof FixtureMaterializationError);
    assert.equal(caughtError.hookResult?.phase, "setup");
    assert.equal(caughtError.hookResult?.exitCode, 7);
    assert.equal(caughtError.hookResult?.stderr, "boom");
    assert.ok(caughtError.fixture);

    const cleanup = await caughtError.fixture.cleanup();

    assert.equal(cleanup.workspaceRemoved, true);
    assert.equal(cleanup.teardown, null);
    await assert.rejects(() => access(caughtError.fixture.workspaceDir, fsConstants.F_OK));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function git(cwd, args) {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout.trim();
}

function createNodeStdoutCommand(script) {
  return `${quoteForShell(process.execPath)} -e ${quoteForShell(script)}`;
}

function quoteForShell(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
