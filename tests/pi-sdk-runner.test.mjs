import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  collectPiSdkRunnableCases,
  normalizeSkillEvalContract,
  runPiSdkCase,
} from "../dist/index.js";

const source = {
  kind: "local",
  input: ".",
  repositoryRoot: process.cwd(),
  displayName: "arc-skill-eval",
  resolvedRef: null,
  git: null,
};

const skillFiles = {
  skillName: "alpha",
  skillDir: path.join(process.cwd(), "tests/fixtures/valid-skill-repo/skills/alpha"),
  relativeSkillDir: "skills/alpha",
  skillDefinitionPath: path.join(process.cwd(), "tests/fixtures/valid-skill-repo/skills/alpha/SKILL.md"),
  evalDefinitionPath: path.join(process.cwd(), "tests/fixtures/valid-skill-repo/skills/alpha/skill.eval.ts"),
};

// A provider failure (e.g. quota exhaustion) does not reject session.prompt —
// it only leaves a terminal assistant message with stopReason "error". The
// runner must surface that as a case error instead of grading an empty
// response (which reads as an honest 0/N assertion failure).
function stubSessionFactory(messages) {
  return async (options) => ({
    model: options.requestedModel ?? null,
    session: {
      sessionId: "session-err",
      sessionFile: "/tmp/session-err.jsonl",
      messages,
      subscribe() { return () => {}; },
      async prompt() {},
      dispose() {},
    },
  });
}

function simpleAlphaCase() {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    routing: { explicit: [{ id: "routing-explicit-001", prompt: "Use alpha explicitly." }], implicitPositive: [], adjacentNegative: [] },
  });
  const [caseDefinition] = collectPiSdkRunnableCases(contract);
  return { skill: { files: skillFiles, contract }, caseDefinition };
}

test("runPiSdkCase surfaces a terminal provider error as a case error", async () => {
  const { skill, caseDefinition } = simpleAlphaCase();
  await assert.rejects(
    runPiSdkCase({
      source,
      skill,
      caseDefinition,
      workspaceDir: process.cwd(),
      createSession: stubSessionFactory([
        { role: "assistant", content: [], stopReason: "error", errorMessage: "400 You're out of extra usage." },
      ]),
    }),
    (error) => {
      assert.equal(error.name, "PiSdkCaseRunError");
      assert.match(error.message, /returned an error instead of output/);
      assert.match(error.message, /out of extra usage/);
      return true;
    },
  );
});

test("runPiSdkCase does not flag a mid-session provider error the agent recovered from", async () => {
  const { skill, caseDefinition } = simpleAlphaCase();
  const result = await runPiSdkCase({
    source,
    skill,
    caseDefinition,
    workspaceDir: process.cwd(),
    createSession: stubSessionFactory([
      { role: "assistant", content: [], stopReason: "error", errorMessage: "overloaded, retrying" },
      { role: "assistant", content: "recovered and done" },
    ]),
  });
  assert.deepEqual(result.session.messages.at(-1), { role: "assistant", content: "recovered and done" });
});
