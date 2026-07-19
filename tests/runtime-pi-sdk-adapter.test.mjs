import assert from "node:assert/strict";
import test from "node:test";

import { toPiSdkEvalCaseOptions } from "../dist/runtime/pi-sdk.js";

test("toPiSdkEvalCaseOptions maps eval-native input without a normalized contract", () => {
  const piOptions = toPiSdkEvalCaseOptions({
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

  assert.deepEqual(piOptions.skill.files, {
    skillName: "sample",
    skillDir: "/repo/skills/sample",
    relativeSkillDir: "skills/sample",
    skillDefinitionPath: "/repo/skills/sample/SKILL.md",
    evalDefinitionPath: "/repo/skills/sample/evals/evals.json",
  });
  assert.deepEqual(piOptions.evalCase, {
    caseId: "1",
    prompt: "Say hello.",
    skillName: "sample",
  });
  assert.equal(piOptions.workspaceDir, "/tmp/workspace");
  assert.deepEqual(piOptions.model, { provider: "mock", id: "mock-model" });
  assert.equal("contract" in piOptions.skill, false);
});

test("toPiSdkEvalCaseOptions forwards createSession without requiring it on RunPiSdkEvalCaseOptions", () => {
  const createSession = async () => ({ model: null, session: {} });
  const piOptions = toPiSdkEvalCaseOptions({
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
