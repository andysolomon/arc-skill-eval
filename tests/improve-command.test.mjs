import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { improveCommand, readEvalsJson, runCli } from "../dist/index.js";

async function createImproveFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-improve-"));
  const skillDir = path.join(root, "demo-skill");
  const evalsDir = path.join(skillDir, "evals");
  const runDir = path.join(skillDir, "evals-runs", "run-1");
  await mkdir(evalsDir, { recursive: true });
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(evalsDir, "evals.json"), `${JSON.stringify({
    version: "1",
    skill_name: "demo-skill",
    evals: [
      {
        id: "golden-path",
        prompt: "Do the task.",
        expected_output: "A useful result.",
        assertions: [
          { id: "useful", kind: "output", method: "judge", prompt: "The response is useful." },
        ],
      },
    ],
  }, null, 2)}\n`, "utf8");
  const feedbackPath = path.join(runDir, "feedback.json");
  await writeFile(feedbackPath, `${JSON.stringify({
    schema_version: "1",
    run_dir: runDir,
    compare: false,
    cases: [
      {
        case_id: "golden-path",
        status: "needs-review",
        notes: "Prompt is ambiguous and the judge assertion failed; add a deterministic assertion if possible.",
        variants: [
          { name: "run", grading_summary: { passed: 1, failed: 1, total: 2 }, feedback: "Consider fixture input coverage." },
        ],
      },
    ],
  }, null, 2)}\n`, "utf8");
  return { root, skillDir, feedbackPath };
}

test("improveCommand proposes changes from feedback without writing by default", async () => {
  const { root, skillDir, feedbackPath } = await createImproveFixture();
  try {
    const before = await readFile(path.join(skillDir, "evals", "evals.json"), "utf8");
    const result = await improveCommand({ feedbackPath, dryRun: true });

    assert.equal(result.applied, false);
    assert.equal(result.dryRun, true);
    assert.equal(result.suggestions.some((item) => item.kind === "prompt"), true);
    assert.equal(result.suggestions.some((item) => item.kind === "assertions"), true);
    assert.equal(result.suggestions.some((item) => item.kind === "fixtures"), true);
    assert.equal(await readFile(path.join(skillDir, "evals", "evals.json"), "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("improveCommand applies validated improvement metadata", async () => {
  const { root, skillDir, feedbackPath } = await createImproveFixture();
  try {
    const result = await improveCommand({ feedbackPath, apply: true });

    assert.equal(result.applied, true);
    const updated = await readEvalsJson(path.join(skillDir, "evals", "evals.json"));
    const metadata = updated.evals[0].metadata;
    assert(metadata);
    assert.deepEqual(metadata.tags, ["needs-eval-improvement"]);
    assert.equal(Array.isArray(metadata.improvement_suggestions), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCli handles improve summary", async () => {
  const { root, skillDir, feedbackPath } = await createImproveFixture();
  try {
    const result = await runCli(["improve", "--from-feedback", feedbackPath, "--dry-run", "--summary"]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Proposed \d+ eval improvement suggestions?/);
    assert.match(result.stdout, /No files changed/);
    const updated = JSON.parse(await readFile(path.join(skillDir, "evals", "evals.json"), "utf8"));
    assert.equal(updated.evals[0].metadata, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
