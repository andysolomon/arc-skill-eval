import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseCliArgs } from "../dist/index.js";
import { bundledCommand } from "../dist/cli/bundled-command.js";
import { resolveBundledSkillPath } from "../dist/cli/package-root.js";

const execFileAsync = promisify(execFile);

test("parseCliArgs accepts bundled list", () => {
  const parsed = parseCliArgs(["bundled"]);

  assert.deepEqual(parsed, {
    command: "bundled",
    skillName: undefined,
    json: false,
  });
});

test("parseCliArgs accepts bundled skill name", () => {
  const parsed = parseCliArgs(["bundled", "hello-world"]);

  assert.deepEqual(parsed, {
    command: "bundled",
    skillName: "hello-world",
    json: false,
  });
});

test("parseCliArgs accepts bundled --json", () => {
  const parsed = parseCliArgs(["bundled", "--json"]);

  assert.deepEqual(parsed, {
    command: "bundled",
    skillName: undefined,
    json: true,
  });
});

test("bundledCommand resolves hello-world and arc-creating-evals", async () => {
  const hello = await bundledCommand({ skillName: "hello-world" });
  assert.equal(hello.entries.length, 1);
  assert.match(hello.entries[0].path, /skills[\\/]hello-world$/);

  const creating = await bundledCommand({ skillName: "arc-creating-evals" });
  assert.equal(creating.entries.length, 1);
  assert.match(creating.entries[0].path, /skills[\\/]arc-creating-evals$/);
});

test("resolveBundledSkillPath rejects invalid names", () => {
  assert.throws(() => resolveBundledSkillPath("../escape"), /Invalid bundled skill name/);
  assert.throws(() => resolveBundledSkillPath("missing-skill"), /Bundled skill not found/);
});

test("npm pack includes dist and excludes tests and docs-site", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { stdout, stderr } = await execFileAsync("npm", ["pack", "--dry-run"], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${stdout}\n${stderr}`;
  const tarballLines = output.split("\n").filter((line) => line.startsWith("npm notice ") && !line.includes("Tarball"));

  assert.ok(
    tarballLines.some((line) => line.includes("dist/bin/arc-skill-eval.js")),
    "expected dist/bin/arc-skill-eval.js in npm pack output",
  );
  assert.ok(
    !tarballLines.some((line) => /npm notice \S*tests\//.test(line)),
    "tests/ should not appear in npm pack tarball",
  );
  assert.ok(
    !tarballLines.some((line) => /npm notice \S*docs-site\//.test(line)),
    "docs-site/ should not appear in npm pack tarball",
  );
  assert.ok(
    !tarballLines.some((line) => /npm notice \S*evals-runs\//.test(line)),
    "evals-runs/ should not appear in npm pack tarball",
  );
});
