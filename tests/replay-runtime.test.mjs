import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEvalsCommand } from "../dist/index.js";
import { createReplayRuntime, createReplayRuntimeFromFile, validateReplayFixture } from "../dist/runtime/replay.js";

// W-000045: the replay runtime drives the full grade-and-artifact pipeline
// with no model and no network — proving the AgentRuntime seam is real.

const exists = (p) => access(p).then(() => true, () => false);

async function createSkillFixture(evals) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "arc-replay-rt-"));
  const skillDir = path.join(repoRoot, "skills", "replayed");
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: replayed\ndescription: Replay-runtime fixture skill.\n---\n",
    "utf8",
  );
  await writeFile(path.join(evalsDir, "evals.json"), JSON.stringify({ skill_name: "replayed", evals }), "utf8");
  return { repoRoot, skillDir };
}

test("validateReplayFixture names offending fields", () => {
  assert.throws(() => validateReplayFixture({ files: {} }), /`assistantText` must be a non-empty string/);
  assert.throws(
    () => validateReplayFixture({ assistantText: "ok", files: { "../escape.txt": "x" } }),
    /files\["\.\.\/escape\.txt"\] must be workspace-relative/,
  );
  assert.throws(() => validateReplayFixture({ assistantText: "ok", files: { "a.txt": 5 } }), /files\["a\.txt"\] must be a string/);
  assert.deepEqual(validateReplayFixture({ assistantText: "ok" }), { assistantText: "ok" });
});

test("replay runtime runs a case end-to-end provider-free with full artifacts and passing grades", async () => {
  const { skillDir } = await createSkillFixture([
    {
      id: "replayed-case",
      prompt: "Produce the report.",
      expected_output: "report.md and data.json exist",
      setup: { kind: "empty" },
      assertions: [
        { type: "file-exists", path: "out/report.md" },
        { type: "regex-match", pattern: "quarterly totals", target: { file: "out/report.md" } },
        { type: "json-valid", path: "out/data.json" },
        { type: "regex-match", pattern: "wrote the report", target: "assistant-text" },
      ],
    },
  ]);

  const runtime = createReplayRuntime({
    assistantText: "I wrote the report with quarterly totals.",
    files: {
      "out/report.md": "# Report\n\nThe quarterly totals are up.\n",
      "out/data.json": JSON.stringify({ q: 4 }),
    },
    usage: { inputTokens: 10, outputTokens: 20 },
  });

  const result = await runEvalsCommand({ input: skillDir, runtime });

  assert.equal(result.summary.totalCases, 1);
  assert.equal(result.summary.passedCases, 1);
  assert.equal(result.summary.failedAssertions, 0);

  const caseArtifacts = result.skills[0].cases[0];
  assert.equal(caseArtifacts.grading.summary.passed, 4);

  // Artifact set on disk: find the eval-<id> dir under evals-runs.
  const { readdir } = await import("node:fs/promises");
  const runsRoot = path.join(skillDir, "evals-runs");
  const runId = (await readdir(runsRoot)).at(-1);
  const evalDir = path.join(runsRoot, runId, "eval-replayed-case");
  for (const artifact of ["assistant.md", "grading.json", "timing.json", "trace.json", "tool-summary.json", "context-manifest.json"]) {
    assert.ok(await exists(path.join(evalDir, artifact)), `${artifact} exists`);
  }

  const trace = JSON.parse(await readFile(path.join(evalDir, "trace.json"), "utf8"));
  assert.equal(trace.identity.runtime, "replay", "trace identity records the replay runtime");
  const timing = JSON.parse(await readFile(path.join(evalDir, "timing.json"), "utf8"));
  assert.equal(timing.total_tokens, 30);
  assert.match(await readFile(path.join(evalDir, "assistant.md"), "utf8"), /wrote the report/);
});

test("replay runtime loads from a fixture file and grades failures honestly", async () => {
  const { skillDir } = await createSkillFixture([
    {
      id: "missing-file-case",
      prompt: "Produce something.",
      expected_output: "a file that will not be produced",
      setup: { kind: "empty" },
      assertions: [{ type: "file-exists", path: "never-written.txt" }],
    },
  ]);

  const fixturePath = path.join(tmpdir(), `replay-fixture-${Date.now()}.json`);
  await writeFile(fixturePath, JSON.stringify({ assistantText: "Done, allegedly." }), "utf8");
  const runtime = await createReplayRuntimeFromFile(fixturePath);

  const result = await runEvalsCommand({ input: skillDir, runtime });
  assert.equal(result.summary.failedCases, 1);
  assert.equal(result.skills[0].cases[0].grading.summary.failed, 1);
});
