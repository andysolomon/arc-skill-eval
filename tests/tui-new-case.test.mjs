import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  appendEvalCase,
  toEvalsJsonAssertion,
  validateAuthoredAssertion,
  ASSERTION_BUDGET,
} from "../dist/tui/new-case.js";

async function makeSkillDir() {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-new-case-"));
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({ skill_name: "demo-skill", evals: [] }, null, 2) + "\n",
    "utf8",
  );
  return skillDir;
}

async function readEvals(skillDir) {
  return JSON.parse(await readFile(path.join(skillDir, "evals", "evals.json"), "utf8"));
}

test("toEvalsJsonAssertion maps each authored type to the loader shape", () => {
  assert.deepEqual(
    toEvalsJsonAssertion({ type: "file-exists", path: " out/report.md " }),
    { type: "file-exists", path: "out/report.md" },
  );
  assert.deepEqual(
    toEvalsJsonAssertion({ type: "json-valid", path: "config.json" }),
    { type: "json-valid", path: "config.json" },
  );
  assert.deepEqual(
    toEvalsJsonAssertion({ type: "regex-match", pattern: "foo\\d+", flags: "mi", target: "assistant-text" }),
    { type: "regex-match", pattern: "foo\\d+", flags: "mi", target: "assistant-text" },
  );
  assert.deepEqual(
    toEvalsJsonAssertion({ type: "regex-match", pattern: "bar", target: { file: " a.txt " } }),
    { type: "regex-match", pattern: "bar", target: { file: "a.txt" } },
  );
  // Judge assertions become plain strings — the LLM-judged form in evals.json.
  assert.equal(
    toEvalsJsonAssertion({ type: "judge", text: " The response names the preset. " }),
    "The response names the preset.",
  );
});

test("validateAuthoredAssertion flags each unusable shape", () => {
  assert.equal(validateAuthoredAssertion({ type: "file-exists", path: "a" }), null);
  assert.match(validateAuthoredAssertion({ type: "file-exists", path: "  " }), /path is required/);
  assert.match(validateAuthoredAssertion({ type: "json-valid", path: "" }), /path is required/);
  assert.match(
    validateAuthoredAssertion({ type: "regex-match", pattern: "", target: "assistant-text" }),
    /pattern is required/,
  );
  assert.match(
    validateAuthoredAssertion({ type: "regex-match", pattern: "(", target: "assistant-text" }),
    /invalid regex/,
  );
  assert.match(
    validateAuthoredAssertion({ type: "regex-match", pattern: "ok", target: { file: " " } }),
    /target file is required/,
  );
  assert.match(validateAuthoredAssertion({ type: "judge", text: "" }), /assertion text is required/);
  assert.equal(validateAuthoredAssertion({ type: "judge", text: "Names the preset." }), null);
});

test("appendEvalCase writes authored assertions and no TODO placeholder", async () => {
  const skillDir = await makeSkillDir();
  const res = await appendEvalCase({
    skillDir,
    id: "golden-path",
    prompt: "Set up the thing",
    expected: "The thing is set up",
    assertions: [
      { type: "file-exists", path: "out/setup.md" },
      { type: "judge", text: "The assistant starts repository-specific setup." },
    ],
  });
  assert.equal(res.caseId, "golden-path");
  assert.equal(res.total, 1);
  assert.equal(res.assertionCount, 2);

  const doc = await readEvals(skillDir);
  const written = doc.evals[0];
  assert.deepEqual(written.assertions, [
    { type: "file-exists", path: "out/setup.md" },
    "The assistant starts repository-specific setup.",
  ]);
  assert.ok(
    !JSON.stringify(written.assertions).includes("TODO"),
    "authored assertions must not carry the TODO placeholder",
  );
});

test("appendEvalCase keeps the failing-until-authored placeholder when zero assertions", async () => {
  const skillDir = await makeSkillDir();
  const res = await appendEvalCase({
    skillDir,
    id: "bare-case",
    prompt: "Do the thing",
    expected: "Thing done",
    assertions: [],
  });
  assert.equal(res.assertionCount, 0);

  const doc = await readEvals(skillDir);
  assert.deepEqual(doc.evals[0].assertions, [
    { type: "file-exists", path: "TODO/path-the-skill-should-create" },
  ]);
});

test("appendEvalCase rejects an invalid authored assertion before writing", async () => {
  const skillDir = await makeSkillDir();
  await assert.rejects(
    appendEvalCase({
      skillDir,
      id: "bad-regex",
      prompt: "p",
      expected: "e",
      assertions: [{ type: "regex-match", pattern: "", target: "assistant-text" }],
    }),
    /invalid regex-match assertion: pattern is required/,
  );
  // Nothing was written — the file still has zero cases.
  const doc = await readEvals(skillDir);
  assert.equal(doc.evals.length, 0);
});

test("assertion budget matches the arc-creating-evals guidance (2–5 per case)", () => {
  assert.deepEqual({ ...ASSERTION_BUDGET }, { min: 2, max: 5 });
});
