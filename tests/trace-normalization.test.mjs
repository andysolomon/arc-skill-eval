import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePiCliJsonCaseRunResult,
} from "../dist/index.js";

const source = {
  kind: "local",
  input: ".",
  repositoryRoot: process.cwd(),
  displayName: "arc-skill-eval",
  resolvedRef: null,
  git: null,
};

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
