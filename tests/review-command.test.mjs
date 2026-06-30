import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CliCommandError, reviewCommand, runCli } from "../dist/index.js";

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createSingleRunFixture() {
  const runDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-review-"));
  const caseDir = path.join(runDir, "eval-default-world");
  await mkdir(caseDir, { recursive: true });
  await writeFile(path.join(caseDir, "assistant.md"), "Created `greeting.txt`.", "utf8");
  await writeJson(path.join(caseDir, "grading.json"), {
    case_id: "default-world",
    assertion_results: [{ text: "file-exists: greeting.txt", passed: true, evidence: "Found file" }],
    summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 },
  });
  await writeJson(path.join(caseDir, "timing.json"), { duration_ms: 123 });
  await writeJson(path.join(caseDir, "tool-summary.json"), { summary: { tool_call_count: 2 } });
  return runDir;
}

async function createCompareRunFixture() {
  const runDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-review-"));
  const caseDir = path.join(runDir, "eval-golden-path");
  for (const variant of ["with_skill", "without_skill"]) {
    const variantDir = path.join(caseDir, variant);
    await mkdir(variantDir, { recursive: true });
    await writeFile(path.join(variantDir, "assistant.md"), `${variant} output`, "utf8");
    await writeJson(path.join(variantDir, "grading.json"), {
      case_id: "golden-path",
      assertion_results: [{ text: "passes", passed: variant === "with_skill", evidence: variant }],
      summary: { passed: variant === "with_skill" ? 1 : 0, failed: variant === "with_skill" ? 0 : 1, total: 1, pass_rate: variant === "with_skill" ? 1 : 0 },
    });
  }
  await writeJson(path.join(runDir, "benchmark.json"), {
    summary: { with_skill_pass_rate: 1, without_skill_pass_rate: 0, delta: 1 },
    cases: [{ case_id: "golden-path", delta: 1 }],
  });
  return runDir;
}

test("reviewCommand writes static report and feedback skeleton for a normal run", async () => {
  const runDir = await createSingleRunFixture();

  try {
    const result = await reviewCommand({ runDir });

    assert.equal(result.caseCount, 1);
    assert.equal(result.compare, false);
    const html = await readFile(path.join(runDir, "review.html"), "utf8");
    assert.match(html, /Skeval review/);
    assert.match(html, /default-world/);
    assert.match(html, /Created `greeting.txt`/);

    const feedback = JSON.parse(await readFile(path.join(runDir, "feedback.json"), "utf8"));
    assert.equal(feedback.schema_version, "1");
    assert.equal(feedback.cases[0].case_id, "default-world");
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("reviewCommand renders compare runs side-by-side", async () => {
  const runDir = await createCompareRunFixture();

  try {
    const result = await reviewCommand({ runDir });

    assert.equal(result.compare, true);
    const html = await readFile(path.join(runDir, "review.html"), "utf8");
    assert.match(html, /with_skill/);
    assert.match(html, /without_skill/);
    assert.match(html, /delta \+100%/);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("reviewCommand refuses to overwrite without force", async () => {
  const runDir = await createSingleRunFixture();

  try {
    await writeFile(path.join(runDir, "review.html"), "existing", "utf8");
    await assert.rejects(() => reviewCommand({ runDir }), CliCommandError);
    assert.equal(await readFile(path.join(runDir, "review.html"), "utf8"), "existing");
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("runCli handles review", async () => {
  const runDir = await createSingleRunFixture();

  try {
    const result = await runCli(["review", runDir]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Created review for 1 case/);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
