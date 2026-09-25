import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { loadJsonl } from "../dist/evals/builder/loaders.js";
import { emitCommand } from "../dist/cli/emit-command.js";

const BUILDER = pathToFileURL(path.resolve("dist/evals/builder/index.js")).href;
const LOADERS = pathToFileURL(path.resolve("dist/evals/builder/loaders.js")).href;

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), "arc-loaders-"));
}

test("loadJsonl parses one row per line and skips blank lines", async () => {
  const dir = await tempDir();
  const file = path.join(dir, "rows.jsonl");
  await writeFile(file, '{"id":"a"}\n\n{"id":"b"}\n', "utf8");

  const rows = await loadJsonl(file);
  assert.deepEqual(rows, [{ id: "a" }, { id: "b" }]);
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
