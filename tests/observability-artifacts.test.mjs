import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIsolatedContextManifest,
  buildToolSummary,
  enrichContextManifestWithTrace,
} from "../dist/index.js";

function createTrace({ telemetryEntries = [], toolCalls = [], toolResults = [], skillReads = [] } = {}) {
  return {
    identity: {
      runtime: "pi-sdk",
      source: { kind: "local", input: ".", repositoryRoot: ".", displayName: "repo", resolvedRef: null, git: null },
      skill: { name: "target", relativeSkillDir: ".", profile: "repo-mutation", targetTier: 1 },
      case: { caseId: "case", kind: "execution", lane: "execution-deterministic", prompt: "prompt" },
      model: null,
    },
    timing: { startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000 },
    observations: {
      assistantText: "done",
      toolCalls,
      toolResults,
      bashCommands: ["gh pr view"],
      touchedFiles: [
        { toolCallId: "write-1", toolName: "write", path: "out.md", absolutePath: "/tmp/out.md" },
        { toolCallId: "edit-1", toolName: "edit", path: "package.json", absolutePath: "/tmp/package.json" },
      ],
      writtenFiles: ["out.md"],
      editedFiles: ["package.json"],
      skillReads,
      externalCalls: [{ toolCallId: "bash-1", system: "github-cli", operation: "pr" }],
    },
    raw: { sessionId: "session", sessionFile: undefined, messages: [], runtimeEvents: [], telemetryEntries },
  };
}

test("observability artifacts summarize tool, skill, and MCP activity", () => {
  const context = buildIsolatedContextManifest({
    targetSkillName: "target",
    targetSkillPath: "/skills/target/SKILL.md",
    attachTargetSkill: true,
  });
  const enriched = enrichContextManifestWithTrace(context, createTrace({
    telemetryEntries: [{
      sequence: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      kind: "run-start",
      skillName: "target",
      caseId: "case",
      lane: "execution-deterministic",
      sessionId: "session",
      data: {
        kind: "execution",
        relativeSkillDir: ".",
        activeTools: ["read", "bash", "mcp__linear__create_issue"],
        allTools: [
          { name: "read", source: "builtin", sourcePath: "builtin" },
          { name: "mcp__linear__create_issue", source: "linear-mcp", sourcePath: "/tools/mcp/linear" },
        ],
      },
    }],
  }));

  assert.deepEqual(enriched.active_tools, ["read", "bash", "mcp__linear__create_issue"]);
  assert.equal(enriched.mcp_tools.length, 1);
  assert.equal(enriched.mcp_tools[0].name, "mcp__linear__create_issue");

  const summary = buildToolSummary(createTrace({
    toolCalls: [
      { toolCallId: "read-1", toolName: "read", inputSummary: "SKILL.md" },
      { toolCallId: "mcp-1", toolName: "mcp__linear__create_issue", inputSummary: "{}" },
    ],
    toolResults: [
      { toolCallId: "read-1", toolName: "read", isError: false },
      { toolCallId: "mcp-1", toolName: "mcp__linear__create_issue", isError: true },
    ],
    skillReads: [{ toolCallId: "read-1", path: "SKILL.md", absolutePath: "/skills/target/SKILL.md", skillName: "target" }],
  }), enriched);

  assert.equal(summary.tool_call_count, 2);
  assert.equal(summary.tool_error_count, 1);
  assert.deepEqual(summary.tool_calls_by_name, { mcp__linear__create_issue: 1, read: 1 });
  assert.equal(summary.skill_read_count, 1);
  assert.deepEqual(summary.skill_reads_by_name, { target: 1 });
  assert.equal(summary.mcp_tool_call_count, 1);
  assert.deepEqual(summary.mcp_tool_calls_by_name, { mcp__linear__create_issue: 1 });
  assert.deepEqual(summary.written_files, ["out.md"]);
  assert.deepEqual(summary.edited_files, ["package.json"]);
  assert.equal(summary.external_call_count, 1);
});
