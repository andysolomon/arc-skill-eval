import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { loadJson, loadJsonl, DatasetLoadError } from "../dist/evals/builder/loaders.js";
import { emitCommand } from "../dist/cli/emit-command.js";

const BUILDER = pathToFileURL(path.resolve("dist/evals/builder/index.js")).href;
const LOADERS = pathToFileURL(path.resolve("dist/evals/builder/loaders.js")).href;

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), "arc-loaders-"));
}

test("loadJson reads an array from an absolute path", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "rows.json");
  await writeFile(file, JSON.stringify([{ id: "a" }, { id: "b" }]), "utf8");

  const rows = await loadJson(file);
  assert.deepEqual(rows, [{ id: "a" }, { id: "b" }]);
});

test("loadJson resolves relative paths against opts.base (import.meta.url style)", async () => {
  const dir = await tempDir();
  await writeFile(path.join(dir, "data.json"), JSON.stringify([{ id: "x" }]), "utf8");
  const suiteUrl = pathToFileURL(path.join(dir, "evals.eval.ts")).href;

  const rows = await loadJson("./data.json", { base: suiteUrl });
  assert.deepEqual(rows, [{ id: "x" }]);
});

test("loadJson resolves relative paths against the cwd by default", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "cwd-rows.json");
  await writeFile(file, JSON.stringify([{ id: "c" }]), "utf8");

  // Path relative to the current working directory resolves to the same file.
  const relative = path.relative(process.cwd(), file);
  const rows = await loadJson(relative);
  assert.deepEqual(rows, [{ id: "c" }]);
});

test("loadJson throws DatasetLoadError for a missing file", async () => {
  const dir = await tempDir();
  await assert.rejects(() => loadJson(path.join(dir, "nope.json")), DatasetLoadError);
});

test("loadJson throws DatasetLoadError for malformed JSON", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "bad.json");
  await writeFile(file, "{ not json", "utf8");
  await assert.rejects(() => loadJson(file), DatasetLoadError);
});

test("loadJsonl parses one row per line and skips blank lines", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "rows.jsonl");
  await writeFile(file, '{"id":"a"}\n\n{"id":"b"}\n', "utf8");

  const rows = await loadJsonl(file);
  assert.deepEqual(rows, [{ id: "a" }, { id: "b" }]);
});

test("loadJsonl names the offending line on a parse error", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "rows.jsonl");
  await writeFile(file, '{"id":"a"}\n{ broken\n{"id":"c"}\n', "utf8");

  await assert.rejects(
    () => loadJsonl(file),
    (error) => error instanceof DatasetLoadError && /line 2/.test(error.message),
  );
});

test("emit fans a dataset out into one case per row", async () => {
  const dir = await tempDir();
  const evalsDir = path.join(dir, "evals");
  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    path.join(evalsDir, "triggers.json"),
    JSON.stringify([
      { id: "explicit", prompt: "Use arc-conventional-commits.", needle: "conventionalcommits" },
      { id: "implicit", prompt: "Set up commit-driven releases.", needle: "semantic-release" },
      { id: "adjacent", prompt: "Summarize this commit.", needle: "no setup" },
    ]),
    "utf8",
  );
  await writeFile(
    path.join(evalsDir, "evals.eval.ts"),
    `import { defineSkillEval, evalCase, judge } from ${JSON.stringify(BUILDER)};
import { loadJson } from ${JSON.stringify(LOADERS)};
const rows = await loadJson("./triggers.json", { base: import.meta.url });
export default defineSkillEval({
  skill_name: "arc-conventional-commits",
  cases: rows.map((row) => evalCase({ id: row.id, prompt: row.prompt, assertions: [judge("Addresses: " + row.needle).soft()] })),
});
`,
    "utf8",
  );

  const result = await emitCommand({ skillDir: dir });
  assert.equal(result.caseCount, 3);

  const written = JSON.parse(await readFile(path.join(evalsDir, "evals.json"), "utf8"));
  assert.deepEqual(
    written.evals.map((c) => c.id),
    ["explicit", "implicit", "adjacent"],
  );
  assert.equal(written.evals[0].assertions[0].mustPass, false);
});
