import assert from "node:assert/strict";
import test from "node:test";

import {
  compareEvalTraceParity,
  normalizePiCliJsonCaseRunResult,
  normalizePiSdkCaseRunResult,
  normalizePiSdkSkillRunResult,
} from "../dist/index.js";

const source = {
  kind: "local",
  input: ".",
  repositoryRoot: process.cwd(),
  displayName: "arc-skill-eval",
  resolvedRef: null,
  git: null,
};

function createCaseRunResult(overrides = {}) {
  return {
    source,
    skill: {
      name: "alpha",
      relativeSkillDir: "skills/alpha",
      profile: "planning",
      targetTier: 1,
    },
    caseDefinition: {
      caseId: "execution-001",
      kind: "execution",
      lane: "execution-deterministic",
      prompt: "Run the deterministic case.",
      skillName: "alpha",
      definition: { id: "execution-001", prompt: "Run the deterministic case." },
    },
    workspaceDir: process.cwd(),
    agentDir: "/tmp/agent",
    sessionDir: "/tmp/sessions",
    model: {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
    },
    startedAt: "2026-04-21T18:00:00.000Z",
    finishedAt: "2026-04-21T18:00:02.500Z",
    durationMs: 2500,
    session: {
      sessionId: "session-123",
      sessionFile: "/tmp/sessions/session-123.jsonl",
      assistantText: "DONE",
      messages: [{ role: "assistant", content: "DONE" }],
      events: [{ type: "message_update" }],
    },
    telemetry: {
      entries: [
        {
          sequence: 1,
          timestamp: "2026-04-21T18:00:00.100Z",
          kind: "tool-call",
          skillName: "alpha",
          caseId: "execution-001",
          lane: "execution-deterministic",
          sessionId: "session-123",
          data: {
            toolCallId: "call-read",
            toolName: "read",
            inputSummary: "skills/alpha/SKILL.md",
          },
        },
        {
          sequence: 2,
          timestamp: "2026-04-21T18:00:00.200Z",
          kind: "bash-command",
          skillName: "alpha",
          caseId: "execution-001",
          lane: "execution-deterministic",
          sessionId: "session-123",
          data: {
            toolCallId: "call-bash",
            command: "pwd",
          },
        },
        {
          sequence: 3,
          timestamp: "2026-04-21T18:00:01.000Z",
          kind: "file-touch",
          skillName: "alpha",
          caseId: "execution-001",
          lane: "execution-deterministic",
          sessionId: "session-123",
          data: {
            toolCallId: "call-write",
            toolName: "write",
            path: "output.txt",
            absolutePath: "/tmp/workspace/output.txt",
          },
        },
        {
          sequence: 4,
          timestamp: "2026-04-21T18:00:01.200Z",
          kind: "file-touch",
          skillName: "alpha",
          caseId: "execution-001",
          lane: "execution-deterministic",
          sessionId: "session-123",
          data: {
            toolCallId: "call-edit",
            toolName: "edit",
            path: "README.md",
            absolutePath: "/tmp/workspace/README.md",
          },
        },
      ],
      toolCalls: [
        {
          toolCallId: "call-read",
          toolName: "read",
          inputSummary: "skills/alpha/SKILL.md",
        },
      ],
      toolResults: [
        {
          toolCallId: "call-write",
          toolName: "write",
          isError: false,
        },
      ],
      skillReads: [
        {
          toolCallId: "call-read",
          path: "skills/alpha/SKILL.md",
          absolutePath: "/tmp/workspace/skills/alpha/SKILL.md",
          skillName: "alpha",
        },
      ],
      bashCommands: ["pwd"],
      touchedFiles: [
        {
          toolCallId: "call-write",
          toolName: "write",
          path: "output.txt",
          absolutePath: "/tmp/workspace/output.txt",
        },
        {
          toolCallId: "call-edit",
          toolName: "edit",
          path: "README.md",
          absolutePath: "/tmp/workspace/README.md",
        },
      ],
      externalCalls: [
        {
          toolCallId: "call-bash",
          system: "http",
          operation: "curl",
          target: "api.github.com",
        },
      ],
    },
    cleanup: async () => {},
    ...overrides,
  };
}

test("normalizePiSdkCaseRunResult produces a scorer-facing canonical trace with raw artifacts attached", () => {
  const trace = normalizePiSdkCaseRunResult(createCaseRunResult());

  assert.equal(trace.identity.runtime, "pi-sdk");
  assert.equal(trace.identity.skill.name, "alpha");
  assert.equal(trace.identity.case.caseId, "execution-001");
  assert.equal(trace.identity.case.lane, "execution-deterministic");
  assert.deepEqual(trace.identity.model, {
    provider: "openai-codex",
    id: "gpt-5.4-mini",
  });
  assert.equal(trace.timing.durationMs, 2500);
  assert.equal(trace.observations.assistantText, "DONE");
  assert.deepEqual(trace.observations.bashCommands, ["pwd"]);
  assert.deepEqual(trace.observations.writtenFiles, ["output.txt"]);
  assert.deepEqual(trace.observations.editedFiles, ["README.md"]);
  assert.equal(trace.observations.skillReads[0].path, "skills/alpha/SKILL.md");
  assert.equal(trace.observations.externalCalls[0].target, "api.github.com");
  assert.equal(trace.raw.sessionId, "session-123");
  assert.equal(trace.raw.runtimeEvents.length, 1);
  assert.equal(trace.raw.telemetryEntries.length, 4);
});

test("normalizePiSdkCaseRunResult falls back to empty observations when telemetry is missing", () => {
  const trace = normalizePiSdkCaseRunResult(createCaseRunResult({ telemetry: null }));

  assert.deepEqual(trace.observations.toolCalls, []);
  assert.deepEqual(trace.observations.toolResults, []);
  assert.deepEqual(trace.observations.bashCommands, []);
  assert.deepEqual(trace.observations.touchedFiles, []);
  assert.deepEqual(trace.observations.writtenFiles, []);
  assert.deepEqual(trace.observations.editedFiles, []);
  assert.deepEqual(trace.raw.telemetryEntries, []);
});

test("normalizePiCliJsonCaseRunResult derives canonical observations from CLI JSON events", () => {
  const trace = normalizePiCliJsonCaseRunResult({
    source,
    skill: {
      name: "alpha",
      relativeSkillDir: "skills/alpha",
      profile: "planning",
      targetTier: 1,
    },
    caseDefinition: {
      caseId: "cli-parity-001",
      kind: "cli-parity",
      lane: "cli-parity",
      prompt: "Plan the work.",
      skillName: "alpha",
      definition: { id: "cli-parity-001", prompt: "Plan the work." },
    },
    workspaceDir: "/tmp/workspace",
    fixture: null,
    model: {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
    },
    startedAt: "2026-04-21T18:00:00.000Z",
    finishedAt: "2026-04-21T18:00:02.500Z",
    durationMs: 2500,
    session: {
      sessionId: "cli-session-123",
      sessionFile: undefined,
      assistantText: "DONE",
      messages: [{ role: "assistant", content: [{ type: "text", text: "DONE" }] }],
      events: [
        {
          type: "tool_execution_start",
          toolCallId: "call-read",
          toolName: "read",
          args: { path: "skills/alpha/SKILL.md" },
        },
        {
          type: "tool_execution_start",
          toolCallId: "call-bash",
          toolName: "bash",
          args: { command: "curl https://api.github.com/repos/example/repo" },
        },
        {
          type: "tool_execution_start",
          toolCallId: "call-write",
          toolName: "write",
          args: { path: "output.txt" },
        },
        {
          type: "tool_execution_end",
          toolCallId: "call-write",
          toolName: "write",
          result: { content: [] },
          isError: false,
        },
      ],
      stderr: "",
      exitCode: 0,
    },
    cleanup: async () => ({ fixture: null }),
  });

  assert.equal(trace.identity.runtime, "pi-cli-json");
  assert.equal(trace.identity.case.kind, "cli-parity");
  assert.equal(trace.observations.toolCalls.length, 3);
  assert.deepEqual(trace.observations.writtenFiles, ["output.txt"]);
  assert.equal(trace.observations.skillReads[0].skillName, "alpha");
  assert.equal(trace.observations.externalCalls[0].target, "api.github.com");
  assert.equal(trace.raw.runtimeEvents.length, 4);
  assert.deepEqual(trace.raw.telemetryEntries, []);
});

test("compareEvalTraceParity flags two empty traces as an explicit mismatch", () => {
  const sdkTrace = {
    identity: {
      runtime: "pi-sdk",
      source,
      skill: {
        name: "alpha",
        relativeSkillDir: "skills/alpha",
        profile: "planning",
        targetTier: 1,
      },
      case: {
        caseId: "cli-parity-empty",
        kind: "cli-parity",
        lane: "cli-parity",
        prompt: "This run returned nothing.",
      },
      model: null,
    },
    timing: {
      startedAt: "2026-04-22T03:00:00.000Z",
      finishedAt: "2026-04-22T03:00:00.500Z",
      durationMs: 500,
    },
    observations: {
      assistantText: "",
      toolCalls: [],
      toolResults: [],
      bashCommands: [],
      touchedFiles: [],
      writtenFiles: [],
      editedFiles: [],
      skillReads: [],
      externalCalls: [],
    },
    raw: {
      sessionId: "sdk-empty",
      sessionFile: undefined,
      messages: [],
      runtimeEvents: [],
      telemetryEntries: [],
    },
  };
  const cliTrace = {
    ...sdkTrace,
    identity: { ...sdkTrace.identity, runtime: "pi-cli-json" },
    raw: { ...sdkTrace.raw, sessionId: "cli-empty" },
  };

  const result = compareEvalTraceParity({ sdkTrace, cliTrace });

  assert.equal(result.matched, false);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].path, "_both_empty");
  assert.match(
    result.mismatches[0].message,
    /Both SDK and CLI runtimes produced empty observations/u,
  );
});

test("compareEvalTraceParity compares semantic projections rather than runtime metadata", () => {
  const sdkTrace = normalizePiSdkCaseRunResult(createCaseRunResult({
    caseDefinition: {
      caseId: "cli-parity-001",
      kind: "cli-parity",
      lane: "cli-parity",
      prompt: "Plan the work.",
      skillName: "alpha",
      definition: { id: "cli-parity-001", prompt: "Plan the work." },
    },
  }));
  const cliTrace = {
    ...sdkTrace,
    identity: {
      ...sdkTrace.identity,
      runtime: "pi-cli-json",
    },
    raw: {
      ...sdkTrace.raw,
      sessionId: "cli-session",
      runtimeEvents: [{ type: "message_update" }],
      telemetryEntries: [],
    },
  };

  const matched = compareEvalTraceParity({ sdkTrace, cliTrace });
  assert.equal(matched.matched, true);

  const mismatched = compareEvalTraceParity({
    sdkTrace,
    cliTrace: {
      ...cliTrace,
      observations: {
        ...cliTrace.observations,
        assistantText: "DIFFERENT",
      },
    },
  });

  assert.equal(mismatched.matched, false);
  assert.equal(mismatched.mismatches[0].path, "observations.assistantText");
});

test("normalizePiSdkSkillRunResult maps each case result into a canonical trace", () => {
  const first = createCaseRunResult();
  const second = createCaseRunResult({
    caseDefinition: {
      caseId: "routing-explicit-001",
      kind: "routing",
      lane: "routing-explicit",
      prompt: "Use alpha explicitly.",
      skillName: "alpha",
      definition: { id: "routing-explicit-001", prompt: "Use alpha explicitly." },
    },
  });

  const traces = normalizePiSdkSkillRunResult({
    source,
    skill: {
      files: {
        skillName: "alpha",
        skillDir: "/tmp/skills/alpha",
        relativeSkillDir: "skills/alpha",
        skillDefinitionPath: "/tmp/skills/alpha/SKILL.md",
        evalDefinitionPath: "/tmp/skills/alpha/skill.eval.ts",
      },
      contract: {
        skill: "alpha",
        profile: "planning",
        targetTier: 1,
        enforcement: { tier: "warn", score: "warn" },
        routing: { explicit: [], implicitPositive: [], adjacentNegative: [], hardNegative: [] },
        overrides: { weights: {}, expectedSignals: [], forbiddenSignals: [] },
        execution: [],
        cliParity: [],
        liveSmoke: [],
        rubric: { enabled: false, prompts: [] },
      },
    },
    workspaceDir: process.cwd(),
    agentDir: "/tmp/agent",
    sessionDir: "/tmp/sessions",
    results: [first, second],
    cleanup: async () => {},
  });

  assert.deepEqual(
    traces.map((trace) => trace.identity.case.caseId),
    ["execution-001", "routing-explicit-001"],
  );
  assert.deepEqual(
    traces.map((trace) => trace.identity.case.kind),
    ["execution", "routing"],
  );
});
