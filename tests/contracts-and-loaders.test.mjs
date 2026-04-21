import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import {
  loadAndValidateLocalRepo,
  normalizeSkillEvalContract,
  validateAndNormalizeSkillEvalContract,
} from "../dist/index.js";

const fixturesRoot = path.resolve("tests/fixtures");

test("normalizeSkillEvalContract applies defaults for optional sections", () => {
  const normalized = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 0,
    routing: {
      explicit: [],
      implicitPositive: [],
      adjacentNegative: [],
    },
  });

  assert.deepEqual(normalized.enforcement, { tier: "warn", score: "warn" });
  assert.deepEqual(normalized.routing.hardNegative, []);
  assert.deepEqual(normalized.execution, []);
  assert.deepEqual(normalized.cliParity, []);
  assert.deepEqual(normalized.liveSmoke, []);
  assert.deepEqual(normalized.rubric, { enabled: false, prompts: [] });
  assert.deepEqual(normalized.overrides, {
    weights: {},
    expectedSignals: [],
    forbiddenSignals: [],
  });
});

test("validateAndNormalizeSkillEvalContract returns normalized contract for valid input", () => {
  const result = validateAndNormalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 0,
    routing: {
      explicit: [],
      implicitPositive: [],
      adjacentNegative: [],
    },
  });

  assert.equal(result.ok, true);

  if (!result.ok) {
    throw new Error("Expected valid normalized contract result.");
  }

  assert.equal(result.value.skill, "alpha");
  assert.deepEqual(result.value.execution, []);
  assert.deepEqual(result.value.routing.hardNegative, []);
});

test("loadAndValidateLocalRepo loads valid fixture repo and preserves sibling imports", async () => {
  const tempRepo = await copyFixtureRepo("valid-skill-repo");

  try {
    const result = await loadAndValidateLocalRepo(tempRepo);

    assert.equal(result.validSkills.length, 1);
    assert.equal(result.invalidSkills.length, 0);
    assert.equal(result.validSkills[0].contract.skill, "alpha");
    assert.equal(result.validSkills[0].contract.routing.explicit[0].id, "routing-explicit-001");
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
});

test("loadAndValidateLocalRepo reports invalid fixture repo diagnostics", async () => {
  const tempRepo = await copyFixtureRepo("invalid-skill-repo");

  try {
    const result = await loadAndValidateLocalRepo(tempRepo);

    assert.equal(result.validSkills.length, 0);
    assert.equal(result.invalidSkills.length, 1);
    assert.equal(result.invalidSkills[0].files.skillName, "beta");
    assert.equal(result.invalidSkills[0].issues[0].code, "skill.required");
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
});

async function copyFixtureRepo(fixtureName) {
  const sourceDir = path.join(fixturesRoot, fixtureName);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-test-"));
  const targetDir = path.join(tempRoot, fixtureName);
  await cp(sourceDir, targetDir, { recursive: true });
  return targetDir;
}
