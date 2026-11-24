import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { improveCommand } from "../dist/index.js";

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
