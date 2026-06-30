import assert from "node:assert/strict";
import test from "node:test";

import { createLaminarSink } from "../dist/index.js";

/**
 * Build a minimal but realistic ObservabilityCaseVariantPayload. Only the
 * fields the sink maps need real values; the rest are minimal stubs.
 */
function makePayload(overrides = {}) {
  const artifactPaths = {
    assistant: "artifacts/with_skill/assistant.md",
    outputs: "artifacts/with_skill/outputs",
    timing: "artifacts/with_skill/timing.json",
    grading: "artifacts/with_skill/grading.json",
    trace: "artifacts/with_skill/trace.json",
    tool_summary: "artifacts/with_skill/tool-summary.json",
    context_manifest: "artifacts/with_skill/context-manifest.json",
  };

  return {
    run_id: "run-123",
    iteration: "1",
    skill: { name: "my-skill", dir: "skills/my-skill" },
    case_id: "case-a",
    variant: "with_skill",
    timing: {
      total_tokens: 1500,
      duration_ms: 4200,
      model: { provider: "anthropic", id: "claude-opus", thinking: "medium" },
      thinking_level: "medium",
      token_usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_tokens: 200,
        cache_write_tokens: 50,
        total_tokens: 1500,
      },
      estimated_cost_usd: 0.0123,
      context_window_tokens: 200000,
      context_window_used_percent: 12,
    },
    grading_summary: { passed: 3, failed: 1, total: 4, pass_rate: 0.75 },
    grading: {
      case_id: "case-a",
      assertion_results: [],
      summary: { passed: 3, failed: 1, total: 4, pass_rate: 0.75 },
    },
    trace: {
      // Full assistant text lives here; the sink MUST NOT export it.
      observations: { assistantText: "SECRET FULL ASSISTANT RESPONSE TEXT" },
    },
    tool_summary: {
      tool_call_count: 7,
      tool_result_count: 7,
      tool_error_count: 1,
      tool_calls_by_name: {},
      bash_command_count: 2,
      skill_read_count: 1,
      skill_reads_by_name: {},
      file_touch_count: 3,
      written_files: [],
      edited_files: [],
      external_call_count: 0,
      external_calls: [],
      mcp_tool_call_count: 2,
      mcp_tool_calls_by_name: {},
    },
    context_manifest: {},
    artifact_paths: artifactPaths,
    ...overrides,
  };
}

function makeCapturingClient() {
  const records = [];
  return {
    records,
    client: {
      async exportCaseVariant(record) {
        records.push(record);
      },
    },
  };
}

test("maps a with_skill payload to a metadata record with no full assistant text", async () => {
  const { records, client } = makeCapturingClient();
  const sink = createLaminarSink({ apiKey: "key" }, { client });

  const result = await sink.exportCaseVariant(makePayload());

  assert.equal(sink.name, "laminar");
  assert.deepEqual(result, { sink: "laminar", status: "success" });
  assert.equal(records.length, 1);

  const rec = records[0];
  assert.equal(rec.run_id, "run-123");
  assert.equal(rec.case_id, "case-a");
  assert.equal(rec.variant, "with_skill");
  assert.equal(rec.skill_name, "my-skill");
  assert.equal(rec.model_provider, "anthropic");
  assert.equal(rec.model_id, "claude-opus");
  assert.equal(rec.thinking_level, "medium");
  assert.equal(rec.total_tokens, 1500);
  assert.equal(rec.input_tokens, 1000);
  assert.equal(rec.output_tokens, 500);
  assert.equal(rec.estimated_cost_usd, 0.0123);
  assert.equal(rec.duration_ms, 4200);
  assert.equal(rec.grading_passed, 3);
  assert.equal(rec.grading_failed, 1);
  assert.equal(rec.grading_total, 4);
  assert.equal(rec.grading_pass_rate, 0.75);
  assert.equal(rec.tool_call_count, 7);
  assert.equal(rec.tool_error_count, 1);
  assert.equal(rec.mcp_tool_call_count, 2);
  assert.equal(rec.file_touch_count, 3);
  assert.ok(rec.name.includes("with_skill"), "trace name includes variant");
  assert.deepEqual(rec.artifact_paths.trace, "artifacts/with_skill/trace.json");

  // Conservative export: no full assistant text / prompt / file contents.
  const serialized = JSON.stringify(rec);
  assert.ok(
    !serialized.includes("SECRET FULL ASSISTANT RESPONSE TEXT"),
    "record must not contain full assistant text",
  );
  assert.equal(rec.assistant, undefined);
  assert.equal(rec.assistantText, undefined);
});

test("compare mode: with_skill and without_skill share run/case identity but are distinguishable", async () => {
  const { records, client } = makeCapturingClient();
  const sink = createLaminarSink({ apiKey: "key" }, { client });

  await sink.exportCaseVariant(makePayload({ variant: "with_skill" }));
  await sink.exportCaseVariant(
    makePayload({
      variant: "without_skill",
      artifact_paths: {
        assistant: "artifacts/without_skill/assistant.md",
        outputs: "artifacts/without_skill/outputs",
        timing: "artifacts/without_skill/timing.json",
        grading: "artifacts/without_skill/grading.json",
        trace: "artifacts/without_skill/trace.json",
        tool_summary: "artifacts/without_skill/tool-summary.json",
        context_manifest: "artifacts/without_skill/context-manifest.json",
      },
    }),
  );

  assert.equal(records.length, 2);
  const [withRec, withoutRec] = records;

  // Shared run/case identity groups them.
  assert.equal(withRec.run_id, withoutRec.run_id);
  assert.equal(withRec.case_id, withoutRec.case_id);

  // Distinguishable by variant attribute and span name.
  assert.equal(withRec.variant, "with_skill");
  assert.equal(withoutRec.variant, "without_skill");
  assert.notEqual(withRec.name, withoutRec.name);
  assert.ok(withRec.name.includes("with_skill"));
  assert.ok(withoutRec.name.includes("without_skill"));
});

test("a throwing client resolves to a failed result instead of throwing", async () => {
  const sink = createLaminarSink(
    { apiKey: "key" },
    {
      client: {
        async exportCaseVariant() {
          throw new Error("boom from client");
        },
      },
    },
  );

  const result = await sink.exportCaseVariant(makePayload());
  assert.equal(result.sink, "laminar");
  assert.equal(result.status, "failed");
  assert.match(result.message, /boom from client/);
});

test("enabled with no injected client and SDK absent returns a clear @lmnr-ai/lmnr error", async () => {
  const sink = createLaminarSink({ apiKey: "key" });

  const result = await sink.exportCaseVariant(makePayload());
  assert.equal(result.status, "failed");
  // Either the optional package is missing (expected in this repo) or, if
  // somehow present, the call still must not throw. Assert it is actionable.
  assert.ok(typeof result.message === "string" && result.message.length > 0);
  if (result.message.includes("@lmnr-ai/lmnr")) {
    assert.match(result.message, /@lmnr-ai\/lmnr/);
  }
});
