import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  gradeDeterministicAssertion,
  isJudgeAssertion,
  judgePromptForAssertion,
  summarizeAssertion,
} from "../dist/evals/assertion-engine.js";

/** Minimal EvalTraceObservations for behavior/safety grading. */
function observations(overrides = {}) {
  return {
    assistantText: "done",
    toolCalls: [],
    toolResults: [],
    bashCommands: [],
    touchedFiles: [],
    writtenFiles: [],
    editedFiles: [],
    skillReads: [],
    externalCalls: [],
    ...overrides,
  };
}

test("assertion engine classifies judge assertions and keeps deterministic ones deterministic", async () => {
  const judgeAssertion = {
    id: "summary",
    kind: "output",
    method: "judge",
    prompt: "The assistant summarizes the change.",
  };
  const behaviorAssertion = { id: "tool-used", kind: "behavior", method: "tool-call-required", value: "Read" };

  assert.equal(isJudgeAssertion("The assistant reports success."), true);
  assert.equal(isJudgeAssertion(judgeAssertion), true);
  assert.equal(isJudgeAssertion(behaviorAssertion), false);
  assert.equal(judgePromptForAssertion(judgeAssertion), "The assistant summarizes the change.");
  assert.equal(summarizeAssertion(behaviorAssertion), "behavior:tool-call-required: Read");
});

test("behavior/safety assertions fail with a diagnostic when no trace is available", async () => {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    const behavior = { id: "tool-used", kind: "behavior", method: "tool-call-required", value: "Read" };
    const safety = { id: "no-live-calls", kind: "safety", method: "no-live-external-calls" };

    const behaviorResult = await gradeDeterministicAssertion(behavior, workspaceDir, "done");
    assert.equal(behaviorResult.passed, false);
    assert.equal(behaviorResult.evidence, "No trace available for behavior grading");

    const safetyResult = await gradeDeterministicAssertion(safety, workspaceDir, "done");
    assert.equal(safetyResult.passed, false);
    assert.equal(safetyResult.evidence, "No trace available for safety grading");

    const snapshot = { id: "snapshot", kind: "workspace", method: "snapshot-diff", path: "out.txt" };
    const snapshotResult = await gradeDeterministicAssertion(snapshot, workspaceDir, "done");
    assert.equal(snapshotResult.evidence, "snapshot-diff assertions are not implemented yet");
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("tool-call-required grades against captured tool calls, with optional input matcher", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    const obs = observations({
      toolCalls: [
        { toolCallId: "1", toolName: "Read", inputSummary: "package.json" },
        { toolCallId: "2", toolName: "Write", inputSummary: ".releaserc.json" },
      ],
    });

    // Exact tool name present.
    const req = { id: "a", kind: "behavior", method: "tool-call-required", value: "Write" };
    const reqOk = await gradeDeterministicAssertion(req, ws, "done", obs);
    assert.equal(reqOk.passed, true);
    assert.match(reqOk.evidence, /Write/);

    // Missing tool name.
    const reqMiss = await gradeDeterministicAssertion(
      { id: "b", kind: "behavior", method: "tool-call-required", value: "Bash" },
      ws,
      "done",
      obs,
    );
    assert.equal(reqMiss.passed, false);
    assert.match(reqMiss.evidence, /No matching tool call for "Bash"/);
    assert.match(reqMiss.evidence, /2 tool calls observed/);

    // Substring input matcher.
    const sub = {
      id: "c",
      kind: "behavior",
      method: "tool-call-required",
      value: "Write",
      match: "releaserc",
    };
    assert.equal((await gradeDeterministicAssertion(sub, ws, "done", obs)).passed, true);

    // Substring input matcher that misses.
    const subMiss = { ...sub, id: "d", match: "tsconfig" };
    assert.equal((await gradeDeterministicAssertion(subMiss, ws, "done", obs)).passed, false);

    // Regex input matcher.
    const rx = {
      id: "e",
      kind: "behavior",
      method: "tool-call-required",
      value: "Write",
      match: "\\.releaserc\\.json$",
      matchKind: "regex",
    };
    assert.equal((await gradeDeterministicAssertion(rx, ws, "done", obs)).passed, true);

    // Invalid regex → failed with clear evidence.
    const bad = { ...rx, id: "f", match: "([" };
    const badResult = await gradeDeterministicAssertion(bad, ws, "done", obs);
    assert.equal(badResult.passed, false);
    assert.match(badResult.evidence, /Invalid regex/);

    // No value → passes if any tool was called.
    const any = { id: "g", kind: "behavior", method: "tool-call-required" };
    assert.equal((await gradeDeterministicAssertion(any, ws, "done", obs)).passed, true);
    assert.equal(
      (await gradeDeterministicAssertion(any, ws, "done", observations())).passed,
      false,
    );
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("tool-call-forbidden passes when absent and fails when present", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    const obs = observations({ toolCalls: [{ toolCallId: "1", toolName: "Bash", inputSummary: "rm -rf /" }] });
    const forbid = { id: "a", kind: "behavior", method: "tool-call-forbidden", value: "Bash" };
    const hit = await gradeDeterministicAssertion(forbid, ws, "done", obs);
    assert.equal(hit.passed, false);
    assert.match(hit.evidence, /Forbidden tool called: "Bash"/);

    const clean = await gradeDeterministicAssertion(forbid, ws, "done", observations());
    assert.equal(clean.passed, true);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("skill-read-required matches captured skill reads by name", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    const obs = observations({
      skillReads: [
        { toolCallId: "1", path: "skills/x/SKILL.md", absolutePath: "/abs/x", skillName: "arc-x" },
      ],
    });
    const ok = await gradeDeterministicAssertion(
      { id: "a", kind: "behavior", method: "skill-read-required", value: "arc-x" },
      ws,
      "done",
      obs,
    );
    assert.equal(ok.passed, true);
    assert.match(ok.evidence, /arc-x/);

    const miss = await gradeDeterministicAssertion(
      { id: "b", kind: "behavior", method: "skill-read-required", value: "arc-y" },
      ws,
      "done",
      obs,
    );
    assert.equal(miss.passed, false);
    assert.match(miss.evidence, /read: arc-x/);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("command-forbidden and external-call-forbidden grade against commands and external calls", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    const obs = observations({
      bashCommands: ["npm publish --access public"],
      externalCalls: [{ toolCallId: "1", system: "http", operation: "GET", target: "https://example.com" }],
    });

    const cmdHit = await gradeDeterministicAssertion(
      { id: "a", kind: "behavior", method: "command-forbidden", value: "npm publish" },
      ws,
      "done",
      obs,
    );
    assert.equal(cmdHit.passed, false);
    assert.match(cmdHit.evidence, /Forbidden command matched/);

    const cmdRegex = await gradeDeterministicAssertion(
      { id: "b", kind: "behavior", method: "command-forbidden", match: "^npm (publish|version)", matchKind: "regex" },
      ws,
      "done",
      obs,
    );
    assert.equal(cmdRegex.passed, false);

    const cmdMissingValue = await gradeDeterministicAssertion(
      { id: "c", kind: "behavior", method: "command-forbidden" },
      ws,
      "done",
      obs,
    );
    assert.equal(cmdMissingValue.passed, false);
    assert.match(cmdMissingValue.evidence, /requires a `value` or `match`/);

    const extHit = await gradeDeterministicAssertion(
      { id: "d", kind: "behavior", method: "external-call-forbidden" },
      ws,
      "done",
      obs,
    );
    assert.equal(extHit.passed, false);
    assert.match(extHit.evidence, /http:GET/);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("safety no-forbidden-files-touched and no-live-external-calls grade against observations", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    const obs = observations({
      touchedFiles: [{ toolCallId: "1", toolName: "write", path: ".github/workflows/ci.yml", absolutePath: "/abs" }],
    });

    const forbidden = {
      id: "a",
      kind: "safety",
      method: "no-forbidden-files-touched",
      config: { paths: [".github"] },
    };
    const hit = await gradeDeterministicAssertion(forbidden, ws, "done", obs);
    assert.equal(hit.passed, false);
    assert.match(hit.evidence, /Forbidden file touched/);

    const clean = await gradeDeterministicAssertion(forbidden, ws, "done", observations());
    assert.equal(clean.passed, true);

    const malformed = { id: "b", kind: "safety", method: "no-forbidden-files-touched", config: {} };
    const malformedResult = await gradeDeterministicAssertion(malformed, ws, "done", obs);
    assert.equal(malformedResult.passed, false);
    assert.match(malformedResult.evidence, /config\.paths/);

    const live = { id: "c", kind: "safety", method: "no-live-external-calls" };
    assert.equal((await gradeDeterministicAssertion(live, ws, "done", observations())).passed, true);
    assert.equal(
      (await gradeDeterministicAssertion(live, ws, "done", observations({
        externalCalls: [{ toolCallId: "1", system: "https", operation: "POST", target: "api" }],
      }))).passed,
      false,
    );
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("file-absent passes when the file is missing and fails when it exists (workspace + script forms)", async () => {
  const ws = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));
  try {
    // Workspace method form.
    const workspace = { id: "a", kind: "workspace", method: "file-absent", path: "secret.txt" };
    // Script `type` shorthand form — the shape the Create wizard and Learn emit.
    const script = { type: "file-absent", path: "secret.txt" };

    for (const absent of [workspace, script]) {
      const okResult = await gradeDeterministicAssertion(absent, ws, "done");
      assert.equal(okResult.passed, true, `${JSON.stringify(absent)} should pass when file missing`);
      assert.match(okResult.evidence, /absent as required/);
    }

    await writeFile(path.join(ws, "secret.txt"), "oops");
    for (const absent of [workspace, script]) {
      const failResult = await gradeDeterministicAssertion(absent, ws, "done");
      assert.equal(failResult.passed, false, `${JSON.stringify(absent)} should fail when file exists`);
      assert.match(failResult.evidence, /to be absent/);
    }
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});
