import assert from "node:assert/strict";
import test from "node:test";

import { toPiSdkCaseOptions } from "../dist/runtime/pi-sdk.js";

// W-000051: Pi adapter owns standard-to-Pi translation; neutral input has
// no contract/profile/tier/kind/lane.

test("toPiSdkCaseOptions synthesizes compatibility metadata at the Pi adapter", () => {
  const piOptions = toPiSdkCaseOptions({
    source: {
      kind: "local",
      input: "/repo",
      repositoryRoot: "/repo",
      displayName: "repo",
      resolvedRef: null,
      git: null,
    },
    skill: {
      name: "sample",
      skillDir: "/repo/skills/sample",
      relativeSkillDir: "skills/sample",
      skillDefinitionPath: "/repo/skills/sample/SKILL.md",
      evalDefinitionPath: "/repo/skills/sample/evals/evals.json",
    },
    case: {
      caseId: "1",
      prompt: "Say hello.",
      skillName: "sample",
    },
    workspaceDir: "/tmp/workspace",
    model: { provider: "mock", id: "mock-model" },
  });

  assert.equal(piOptions.skill.contract.skill, "sample");
  assert.equal(piOptions.skill.contract.profile, "repo-mutation");
  assert.equal(piOptions.skill.contract.targetTier, 1);
  assert.deepEqual(piOptions.skill.contract.routing.explicit, []);
  assert.deepEqual(piOptions.skill.contract.routing.implicitPositive, []);
  assert.deepEqual(piOptions.skill.contract.routing.adjacentNegative, []);
  assert.deepEqual(piOptions.skill.contract.execution, []);
  assert.deepEqual(piOptions.skill.contract.cliParity, []);
  assert.deepEqual(piOptions.skill.contract.liveSmoke, []);

  assert.equal(piOptions.caseDefinition.kind, "execution");
  assert.equal(piOptions.caseDefinition.lane, "execution-deterministic");
  assert.equal(piOptions.caseDefinition.caseId, "1");
  assert.equal(piOptions.caseDefinition.prompt, "Say hello.");
  assert.equal(piOptions.caseDefinition.skillName, "sample");
  assert.equal(piOptions.workspaceDir, "/tmp/workspace");
  assert.deepEqual(piOptions.model, { provider: "mock", id: "mock-model" });
});

test("toPiSdkCaseOptions forwards createSession without requiring it on RunPiSdkCaseOptions", () => {
  const createSession = async () => ({ model: null, session: {} });
  const piOptions = toPiSdkCaseOptions({
    source: {
      kind: "local",
      input: "/repo",
      repositoryRoot: "/repo",
      displayName: "repo",
      resolvedRef: null,
      git: null,
    },
    skill: {
      name: "sample",
      skillDir: "/repo/skills/sample",
      relativeSkillDir: "skills/sample",
      skillDefinitionPath: "/repo/skills/sample/SKILL.md",
      evalDefinitionPath: "/repo/skills/sample/evals/evals.json",
    },
    case: { caseId: "2", prompt: "ping", skillName: "sample" },
    workspaceDir: "/tmp/ws",
    createSession,
  });

  assert.equal(piOptions.createSession, createSession);
});
