import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SessionManager } from "@mariozechner/pi-coding-agent";

import { PI_SESSION_TELEMETRY_CUSTOM_TYPE, loadPiSessionTelemetry } from "../dist/index.js";

test("loadPiSessionTelemetry reads custom telemetry entries and builds summary views", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-telemetry-project-"));
  const sessionDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-telemetry-sessions-"));

  try {
    const sessionManager = SessionManager.create(projectDir, sessionDir);
    const sessionFile = sessionManager.getSessionFile();

    if (!sessionFile) {
      throw new Error("Expected persisted session file for telemetry test.");
    }

    sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "seed" }],
      api: "test",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 2,
      timestamp: new Date().toISOString(),
      kind: "tool-call",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        toolCallId: "call-1",
        toolName: "read",
        inputSummary: "skills/alpha/SKILL.md",
      },
    });
    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 1,
      timestamp: new Date().toISOString(),
      kind: "run-start",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        kind: "execution",
        relativeSkillDir: "skills/alpha",
      },
    });
    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 3,
      timestamp: new Date().toISOString(),
      kind: "skill-read",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        toolCallId: "call-1",
        path: "skills/alpha/SKILL.md",
        absolutePath: path.join(projectDir, "skills/alpha/SKILL.md"),
        skillName: "alpha",
      },
    });
    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 4,
      timestamp: new Date().toISOString(),
      kind: "bash-command",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        toolCallId: "call-2",
        command: "curl https://api.github.com/repos/andysolomon/arc-skill-eval",
      },
    });
    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 5,
      timestamp: new Date().toISOString(),
      kind: "external-call",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        toolCallId: "call-2",
        system: "http",
        operation: "curl",
        target: "api.github.com",
      },
    });
    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 6,
      timestamp: new Date().toISOString(),
      kind: "file-touch",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        toolCallId: "call-3",
        toolName: "write",
        path: "out.txt",
        absolutePath: path.join(projectDir, "out.txt"),
      },
    });
    sessionManager.appendCustomEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, {
      sequence: 7,
      timestamp: new Date().toISOString(),
      kind: "tool-result",
      skillName: "alpha",
      caseId: "execution-001",
      lane: "execution-deterministic",
      sessionId: sessionManager.getSessionId(),
      data: {
        toolCallId: "call-3",
        toolName: "write",
        isError: false,
      },
    });

    const telemetry = await loadPiSessionTelemetry(sessionFile);

    assert.deepEqual(
      telemetry.entries.map((entry) => entry.sequence),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(telemetry.toolCalls.length, 1);
    assert.equal(telemetry.toolCalls[0].toolName, "read");
    assert.equal(telemetry.skillReads[0].skillName, "alpha");
    assert.deepEqual(telemetry.bashCommands, ["curl https://api.github.com/repos/andysolomon/arc-skill-eval"]);
    assert.equal(telemetry.externalCalls[0].target, "api.github.com");
    assert.equal(telemetry.touchedFiles[0].toolName, "write");
    assert.equal(telemetry.toolResults[0].toolCallId, "call-3");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  }
});
