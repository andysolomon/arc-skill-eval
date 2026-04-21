import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  collectPiSdkRunnableCases,
  createPiSdkRunEnvironment,
  normalizeSkillEvalContract,
  runPiSdkCase,
  runValidatedSkillViaPiSdk,
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

test("collectPiSdkRunnableCases flattens routing, execution, and live-smoke lanes only", () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    routing: {
      explicit: [{ id: "routing-explicit-001", prompt: "Use alpha explicitly." }],
      implicitPositive: [{ id: "routing-implicit-001", prompt: "Plan this work item." }],
      adjacentNegative: [{ id: "routing-negative-001", prompt: "Implement this now." }],
      hardNegative: [{ id: "routing-hard-negative-001", prompt: "Use a different skill." }],
    },
    execution: [{ id: "execution-001", prompt: "Run the deterministic case." }],
    cliParity: [{ id: "cli-parity-001", prompt: "This should stay out of the SDK runner." }],
    liveSmoke: [{ id: "live-smoke-001", prompt: "Run the live smoke case.", envRequired: ["API_TOKEN"] }],
  });

  const cases = collectPiSdkRunnableCases(contract);

  assert.deepEqual(
    cases.map((caseDefinition) => ({ id: caseDefinition.caseId, lane: caseDefinition.lane })),
    [
      { id: "routing-explicit-001", lane: "routing-explicit" },
      { id: "routing-implicit-001", lane: "routing-implicit-positive" },
      { id: "routing-negative-001", lane: "routing-adjacent-negative" },
      { id: "routing-hard-negative-001", lane: "routing-hard-negative" },
      { id: "execution-001", lane: "execution-deterministic" },
      { id: "live-smoke-001", lane: "live-smoke" },
    ],
  );
});

test("createPiSdkRunEnvironment creates temp agent state and cleanup removes it", async () => {
  const environment = await createPiSdkRunEnvironment({
    workspaceDir: process.cwd(),
  });

  await access(environment.agentDir, fsConstants.F_OK);
  await access(environment.sessionDir, fsConstants.F_OK);

  await environment.cleanup();

  await assert.rejects(() => access(environment.agentDir, fsConstants.F_OK));
});

test("runPiSdkCase captures prompt output, events, and session artifacts from injected session factory", async () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    model: {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
      thinking: "minimal",
    },
    routing: {
      explicit: [{ id: "routing-explicit-001", prompt: "Use alpha explicitly." }],
      implicitPositive: [],
      adjacentNegative: [],
    },
  });
  const skill = { files: skillFiles, contract };
  const [caseDefinition] = collectPiSdkRunnableCases(contract);
  let disposed = false;
  let receivedOptions;
  let subscribed = false;

  const result = await runPiSdkCase({
    source,
    skill,
    caseDefinition,
    workspaceDir: process.cwd(),
    createSession: async (options) => {
      receivedOptions = options;
      return {
        model: options.requestedModel ?? null,
        session: {
          sessionId: "session-123",
          sessionFile: "/tmp/session-123.jsonl",
          messages: [{ role: "assistant", content: "done" }],
          subscribe(listener) {
            subscribed = true;
            this.listener = listener;
            return () => {
              subscribed = false;
            };
          },
          async prompt(text) {
            assert.equal(text, "Use alpha explicitly.");
            this.listener({
              type: "message_update",
              assistantMessageEvent: {
                type: "text_delta",
                delta: "done",
              },
            });
          },
          dispose() {
            disposed = true;
          },
        },
      };
    },
  });

  assert.equal(receivedOptions.workspaceDir, process.cwd());
  assert.equal(receivedOptions.skillFiles.skillName, "alpha");
  assert.equal(receivedOptions.skill.contract.skill, "alpha");
  assert.equal(receivedOptions.caseDefinition.caseId, "routing-explicit-001");
  assert.deepEqual(receivedOptions.requestedModel, {
    provider: "anthropic",
    id: "claude-sonnet-4-5",
    thinking: "minimal",
  });
  assert.equal(result.session.assistantText, "done");
  assert.deepEqual(result.session.messages, [{ role: "assistant", content: "done" }]);
  assert.equal(result.session.events.length, 1);
  assert.deepEqual(result.telemetry, {
    entries: [],
    toolCalls: [],
    toolResults: [],
    skillReads: [],
    bashCommands: [],
    touchedFiles: [],
    externalCalls: [],
  });
  assert.equal(disposed, true);
  assert.equal(subscribed, false);
});

test("runValidatedSkillViaPiSdk reuses the environment and filters selected case ids", async () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    routing: {
      explicit: [{ id: "routing-explicit-001", prompt: "Use alpha explicitly." }],
      implicitPositive: [],
      adjacentNegative: [],
    },
    execution: [{ id: "execution-001", prompt: "Run the deterministic case." }],
  });
  const skill = { files: skillFiles, contract };
  const environment = await createPiSdkRunEnvironment({ workspaceDir: process.cwd() });
  const prompts = [];

  try {
    const result = await runValidatedSkillViaPiSdk({
      source,
      skill,
      environment,
      selectedCaseIds: ["execution-001"],
      createSession: async () => ({
        model: null,
        session: {
          sessionId: `session-${prompts.length + 1}`,
          sessionFile: undefined,
          messages: [],
          subscribe() {
            return () => {};
          },
          async prompt(text) {
            prompts.push(text);
          },
          dispose() {},
        },
      }),
    });

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].caseDefinition.caseId, "execution-001");
    assert.deepEqual(prompts, ["Run the deterministic case."]);
    assert.equal(result.agentDir, environment.agentDir);
    assert.equal(result.sessionDir, environment.sessionDir);
  } finally {
    await environment.cleanup();
  }
});
