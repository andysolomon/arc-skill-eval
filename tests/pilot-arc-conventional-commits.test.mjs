import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  discoverEvalSkills,
  readEvalsJson,
} from "../dist/evals/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pilotSkillDir = path.join(repoRoot, "pilots", "arc-conventional-commits");
const pilotEvalsPath = path.join(pilotSkillDir, "evals", "evals.json");

const EXECUTION_CASES = [
  "execution-clean-repo",
  "execution-migrate-standard-version",
  "edge-monorepo-warning",
];

const TRIGGER_CASES = [
  "trigger-explicit-named",
  "trigger-implicit-release-automation",
  "trigger-implicit-version-bump",
  "trigger-negative-single-commit-message",
];

test("pilot arc-conventional-commits skill is discoverable with fixtures", async () => {
  const [skill] = await discoverEvalSkills(path.join(repoRoot, "pilots"));
  assert.ok(skill, "expected one pilot skill");
  assert.equal(path.basename(skill.skillDir), "arc-conventional-commits");
  assert.equal(skill.evalsJsonPath, pilotEvalsPath);
  await access(path.join(skill.skillDir, "SKILL.md"));
});

test("pilot arc-conventional-commits evals.json loads with expected cohort", async () => {
  const file = await readEvalsJson(pilotEvalsPath);
  assert.equal(file.skill_name, "arc-conventional-commits");
  assert.equal(file.evals.length, 7);

  const ids = file.evals.map((evalCase) => String(evalCase.id));
  for (const id of [...TRIGGER_CASES, ...EXECUTION_CASES]) {
    assert.ok(ids.includes(id), `missing case ${id}`);
  }
});

test("pilot execution cases reference committed fixture trees", async () => {
  const file = await readEvalsJson(pilotEvalsPath);

  for (const caseId of EXECUTION_CASES) {
    const evalCase = file.evals.find((entry) => entry.id === caseId);
    assert.ok(evalCase, `missing execution case ${caseId}`);
    const source = evalCase.setup?.sources?.[0]?.from;
    assert.ok(source, `${caseId} should declare a seeded fixture source`);
    await access(path.join(pilotSkillDir, "evals", source));
  }
});

test("pilot trigger case uses behavior-focused setup assertion", async () => {
  const file = await readEvalsJson(pilotEvalsPath);
  const triggerCase = file.evals.find((entry) => entry.id === "trigger-explicit-named");
  assert.ok(triggerCase, "expected trigger-explicit-named case");

  const setupAssertion = triggerCase.assertions?.[0];
  assert.equal(typeof setupAssertion, "object");
  assert.equal(setupAssertion.kind, "output");
  assert.equal(setupAssertion.method, "judge");
  assert.match(setupAssertion.prompt, /performs or starts the project-specific setup/);
  assert.match(setupAssertion.prompt, /merely gives generic advice/);
});
