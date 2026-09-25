import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { emitCommand } from "../dist/cli/emit-command.js";
import { CliCommandError } from "../dist/cli/types.js";

// Absolute path to the built builder so suite fixtures resolve without node_modules.
const BUILDER = pathToFileURL(path.resolve("dist/evals/builder/index.js")).href;

function suiteSource({ dup = false } = {}) {
  const second = dup
    ? `evalCase({ id: "golden", prompt: "again", assertions: [fileExists("b.json")] }),`
    : "";
  return `import { defineSkillEval, evalCase, seeded, fileExists, toolRequired, judge } from ${JSON.stringify(BUILDER)};
export default defineSkillEval({
  skill_name: "arc-demo",
  version: "1",
  cases: [
    evalCase({
      id: "golden",
      prompt: "Set it up.",
      setup: seeded({ from: "files/clean", to: ".", mountMode: "flatten-contents" }),
      assertions: [fileExists(".releaserc.json"), toolRequired("Write"), judge("Explains itself.").soft()],
    }),
    ${second}
  ],
});
`;
}

async function makeSuiteDir({ ext = ".mjs", dup = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "arc-emit-"));
  const evalsDir = path.join(dir, "evals");
  await mkdir(evalsDir, { recursive: true });
  const suitePath = path.join(evalsDir, `evals.eval${ext}`);
  await writeFile(suitePath, suiteSource({ dup }), "utf8");
  return { dir, evalsDir, suitePath };
}

test("emit writes a validated evals.json from a suite module", async () => {
  const { evalsDir, suitePath } = await makeSuiteDir();
  const result = await emitCommand({ from: suitePath });

  assert.equal(result.wrote, true);
  assert.equal(result.check, false);
  assert.equal(result.changed, true);
  assert.equal(result.skillName, "arc-demo");
  assert.equal(result.caseCount, 1);
  assert.equal(result.outPath, path.join(evalsDir, "evals.json"));

  const written = JSON.parse(await readFile(path.join(evalsDir, "evals.json"), "utf8"));
  assert.equal(written.version, "1");
  assert.equal(written.evals[0].id, "golden");
  // Cheap script form is preserved; behavior/judge upgrade to intent objects.
  assert.deepEqual(written.evals[0].assertions[0], { type: "file-exists", path: ".releaserc.json" });
  assert.equal(written.evals[0].assertions[1].method, "tool-call-required");
  assert.equal(written.evals[0].assertions[2].mustPass, false);
});

test("emit --check reports drift when the committed JSON differs or is missing", async () => {
  const { evalsDir, suitePath } = await makeSuiteDir();

  // Missing file counts as drift.
  const missing = await emitCommand({ from: suitePath, check: true });
  assert.equal(missing.changed, true);
  assert.equal(missing.wrote, false);

  // Formatting-only differences do NOT count as drift (canonical comparison).
  await emitCommand({ from: suitePath });
  const canonical = JSON.parse(await readFile(path.join(evalsDir, "evals.json"), "utf8"));
  await writeFile(path.join(evalsDir, "evals.json"), JSON.stringify(canonical), "utf8");
  const reformatted = await emitCommand({ from: suitePath, check: true });
  assert.equal(reformatted.changed, false);

  // A real content change counts as drift.
  await writeFile(path.join(evalsDir, "evals.json"), '{"skill_name":"arc-demo","evals":[]}', "utf8");
  const drifted = await emitCommand({ from: suitePath, check: true });
  assert.equal(drifted.changed, true);
});

test("emit transpiles a TypeScript suite in-process and leaves no temp files", async () => {
  const { evalsDir, suitePath } = await makeSuiteDir({ ext: ".ts" });
  const result = await emitCommand({ from: suitePath });

  assert.equal(result.skillName, "arc-demo");
  const written = JSON.parse(await readFile(path.join(evalsDir, "evals.json"), "utf8"));
  assert.equal(written.evals[0].id, "golden");

  const leftovers = (await readdir(evalsDir)).filter((name) => name.includes("arc-emit"));
  assert.deepEqual(leftovers, []);
});

test("emit resolves a skill directory to evals/evals.eval.ts -> evals/evals.json", async () => {
  const { dir, evalsDir } = await makeSuiteDir({ ext: ".ts" });
  const result = await emitCommand({ skillDir: dir });

  assert.equal(result.fromPath, path.join(evalsDir, "evals.eval.ts"));
  assert.equal(result.outPath, path.join(evalsDir, "evals.json"));
});

test("emit surfaces suite validation errors (duplicate case ids) as a command error", async () => {
  const { suitePath } = await makeSuiteDir({ dup: true });
  await assert.rejects(() => emitCommand({ from: suitePath }), CliCommandError);
});
