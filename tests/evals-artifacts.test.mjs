import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  readCaseVariantArtifacts,
  writeCaseVariantArtifacts,
} from "../dist/evals/artifacts.js";
import { mapAssertionResultForView } from "../dist/tui/view-model.js";

test("writeCaseVariantArtifacts round-trips through readCaseVariantArtifacts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-artifacts-"));
  const variantDir = path.join(root, "eval-demo");
  const workspaceDir = path.join(root, "workspace");

  const timing = {
    total_tokens: 42,
    duration_ms: 100,
    model: { provider: "test", id: "model-a" },
    token_usage: { input_tokens: 10, output_tokens: 32, total_tokens: 42 },
  };
  const grading = {
    case_id: "demo",
    assertion_results: [
      {
        text: "file-exists: out.txt",
        passed: true,
        evidence: "Found out.txt",
        assertion: { type: "file-exists", path: "out.txt" },
      },
    ],
    summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 },
  };
  const trace = {
    identity: { runtime: "replay", case: { caseId: "demo", prompt: "hi" } },
    timing: { durationMs: 100 },
    observations: { assistantText: "hello\n" },
    raw: {},
  };
  const toolSummary = { tool_call_count: 0, tool_error_count: 0, mcp_tool_call_count: 0 };
  const contextManifest = {
    runtime: "pi",
    mode: "isolated",
    attached_skills: [],
    available_tools: [],
    active_tools: [],
    mcp_tools: [],
    mcp_servers: [],
    ambient: {},
  };

  try {
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(path.join(workspaceDir, "out.txt"), "ok", "utf-8");

    await writeCaseVariantArtifacts({
      variantDir,
      assistantText: "hello",
      workspaceDir,
      timing,
      grading,
      trace,
      toolSummary,
      contextManifest,
    });

    const read = await readCaseVariantArtifacts(variantDir);
    assert.equal(read.compare, false);
    assert.deepEqual(read.grading, grading);
    assert.deepEqual(read.timing, timing);
    assert.deepEqual(read.toolSummary, toolSummary);
    assert.deepEqual(read.contextManifest, contextManifest);
    assert.equal(read.assistantText, "hello\n");

    const copied = await readFile(path.join(variantDir, "outputs", "out.txt"), "utf-8");
    assert.equal(copied, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mapAssertionResultForView uses the shared judge classification without grading artifacts", () => {
  const judge = mapAssertionResultForView({
    text: "The assistant reports success.",
    passed: true,
    evidence: '"success"',
    assertion: { id: "judge", kind: "output", method: "judge" },
  });
  const behavior = mapAssertionResultForView({
    text: "behavior:tool-call-required: read",
    passed: false,
    evidence: "Behavior assertions require trace-aware grading and are not implemented yet",
    assertion: { id: "behavior", kind: "behavior", method: "tool-call-required", value: "read" },
  });

  assert.equal(judge.det, false);
  assert.equal(judge.type, "output/judge");
  assert.equal(behavior.det, true);
  assert.equal(behavior.type, "behavior/tool-call-required");
});
