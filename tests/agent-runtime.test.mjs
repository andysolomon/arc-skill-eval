import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { runEvalCase } from "../dist/evals/run-case.js";
import { piSdkRuntime } from "../dist/pi/sdk-eval-case.js";

// W-000044: run-case executes cases through an injected AgentRuntime; the
// runtime's id flows into trace identity instead of a hardcoded literal.

async function makeSkill() {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-runtime-skill-"));
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: rt-demo\ndescription: Runtime seam demo.\n---\n", "utf8");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  const evalsJsonPath = path.join(skillDir, "evals", "evals.json");
  await writeFile(evalsJsonPath, JSON.stringify({ version: "1", skill_name: "rt-demo", evals: [] }), "utf8");
  return {
    skill: {
      skillDir,
      relativeSkillDir: ".",
      skillDefinitionPath: path.join(skillDir, "SKILL.md"),
      evalsJsonPath,
    },
    evalsDir: path.join(skillDir, "evals"),
  };
}

/** Minimal RuntimeCaseResult satisfying everything run-case consumes. */
function stubResult(options) {
  return {
    source: options.source,
    skill: {
      name: options.skill.name,
      relativeSkillDir: options.skill.relativeSkillDir,
      profile: "repo-mutation",
      targetTier: 1,
    },
    caseDefinition: {
      kind: "execution",
      lane: "execution-deterministic",
      caseId: options.case.caseId,
      prompt: options.case.prompt,
      skillName: options.case.skillName,
      definition: {
        id: options.case.caseId,
        prompt: options.case.prompt,
      },
    },
    workspaceDir: options.workspaceDir,
    agentDir: "/tmp/stub-agent",
    sessionDir: "/tmp/stub-sessions",
    fixture: null,
    model: { provider: "stub", id: "stub-model" },
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    session: {
      sessionId: "stub-session",
      sessionFile: "/tmp/stub.jsonl",
      assistantText: "stubbed answer",
      messages: [{ role: "assistant", content: "stubbed answer" }],
      events: [],
    },
    usage: {
      model: { provider: "stub", id: "stub-model" },
      thinkingLevel: null,
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 3,
      estimatedCostUsd: 0,
      contextWindowTokens: null,
      contextWindowUsedPercent: null,
    },
    contextManifest: {
      mode: "isolated",
      agent_dir: "/tmp/stub-agent",
      attached_skills: [],
      active_tools: [],
      available_tools: [],
      mcp_servers: [],
      ambient: {},
    },
    telemetry: null,
    cleanup: async () => {},
  };
}

test("runEvalCase records the injected runtime's id in trace identity", async () => {
  const { skill, evalsDir } = await makeSkill();
  let sawWorkspace = null;
  const stubRuntime = {
    id: "pi-cli-json", // any non-default member of the EvalTraceRuntime union
    runCase: async (options) => {
      sawWorkspace = options.workspaceDir;
      return stubResult(options);
    },
  };

  const result = await runEvalCase({
    skill,
    case: { id: "case-1", prompt: "Do the thing.", assertions: ["done"] },
    evalsDir,
    runtime: stubRuntime,
  });

  assert.equal(result.trace.identity.runtime, "pi-cli-json", "identity comes from the runtime object");
  assert.equal(result.assistantText, "stubbed answer");
  assert.equal(result.timing.total_tokens, 3);
  assert.equal(sawWorkspace, result.workspaceDir, "runtime receives the prepared workspace");
  await result.cleanup();
});

test("the default runtime is the Pi SDK adapter with id pi-sdk", async () => {
  assert.equal(piSdkRuntime.id, "pi-sdk");
  const { skill, evalsDir } = await makeSkill();
  // Route the default runtime through a stub session factory (no API calls) —
  // proving the adapter passes createSession through to runPiSdkCase.
  const result = await runEvalCase({
    skill,
    case: { id: "case-2", prompt: "Say hi.", assertions: ["hi"] },
    evalsDir,
    createSession: async (options) => ({
      model: options.requestedModel ?? null,
      session: {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        messages: [{ role: "assistant", content: "hi" }],
        subscribe() { return () => {}; },
        async prompt() {},
        dispose() {},
      },
    }),
  });
  assert.equal(result.trace.identity.runtime, "pi-sdk");
  await result.cleanup();
});
