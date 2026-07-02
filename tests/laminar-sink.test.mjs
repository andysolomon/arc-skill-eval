import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDatapoint,
  buildEvaluationName,
  createLaminarSink,
  laminarFrontendUrl,
} from "../dist/index.js";

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
      assertion_results: [
        {
          text: "mentions the commit type",
          passed: true,
          evidence: 'quoted line: "feat: add sandbox"',
          assertion: "mentions the commit type",
        },
        {
          text: "keeps subject under 72 chars",
          passed: false,
          evidence: "subject was 84 characters",
          assertion: "keeps subject under 72 chars",
        },
      ],
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

test("maps a with_skill payload to a record with grading verdicts but no full assistant text", async () => {
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
  assert.ok(rec.name.includes("with_skill"), "record name includes variant");
  assert.deepEqual(rec.artifact_paths.trace, "artifacts/with_skill/trace.json");

  // Per-assertion verdicts ARE exported (grading data, not assistant content).
  assert.deepEqual(rec.assertions, [
    {
      text: "mentions the commit type",
      passed: true,
      evidence: 'quoted line: "feat: add sandbox"',
    },
    {
      text: "keeps subject under 72 chars",
      passed: false,
      evidence: "subject was 84 characters",
    },
  ]);

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

  // Distinguishable by variant attribute and record/evaluation name.
  assert.equal(withRec.variant, "with_skill");
  assert.equal(withoutRec.variant, "without_skill");
  assert.notEqual(withRec.name, withoutRec.name);
  assert.ok(withRec.name.includes("with_skill"));
  assert.ok(withoutRec.name.includes("without_skill"));

  // The two variants land in sibling evaluations within the same group
  // (grouping key = skill name via buildEvaluationName's inputs).
  assert.notEqual(buildEvaluationName(withRec), buildEvaluationName(withoutRec));
  assert.ok(buildEvaluationName(withRec).includes("run-123"));
  assert.ok(buildEvaluationName(withRec).includes("[with_skill]"));
  assert.ok(buildEvaluationName(withoutRec).includes("[without_skill]"));
});

test("buildDatapoint maps scores, output, and metadata for the Evaluations API", async () => {
  const { records, client } = makeCapturingClient();
  const sink = createLaminarSink({ apiKey: "key" }, { client });
  await sink.exportCaseVariant(makePayload());

  const { data, scores, executorOutput, metadata } = buildDatapoint(records[0]);

  // Numeric scores become comparable metric columns in the Evaluations UI.
  assert.deepEqual(scores, {
    passed: 3,
    failed: 1,
    total_tokens: 1500,
    cost_usd: 0.0123,
    duration_ms: 4200,
    tool_calls: 7,
    pass_rate: 0.75,
  });
  for (const value of Object.values(scores)) assert.equal(typeof value, "number");

  assert.deepEqual(data, {
    case_id: "case-a",
    skill: "my-skill",
    variant: "with_skill",
    model: "anthropic/claude-opus",
  });

  // Output shows grading summary + per-assertion verdicts + artifact paths.
  assert.deepEqual(executorOutput.grading, { passed: 3, failed: 1, total: 4, pass_rate: 0.75 });
  assert.equal(executorOutput.assertions.length, 2);
  assert.equal(executorOutput.artifacts.grading, "artifacts/with_skill/grading.json");

  // Metadata drops nulls but keeps native number values (plain JSON API).
  assert.equal(metadata["eval.run_id"], "run-123");
  assert.equal(metadata["gen_ai.usage.input_tokens"], 1000);
  assert.ok(!("eval.iteration" in buildDatapoint({ ...records[0], attributes: { "eval.iteration": null } }).metadata));
});

test("buildDatapoint omits a null pass_rate instead of coercing it to 0", async () => {
  const { records, client } = makeCapturingClient();
  const sink = createLaminarSink({ apiKey: "key" }, { client });
  await sink.exportCaseVariant(
    makePayload({
      grading_summary: { passed: 0, failed: 0, total: 0, pass_rate: null },
      grading: {
        case_id: "case-a",
        assertion_results: [],
        summary: { passed: 0, failed: 0, total: 0, pass_rate: null },
      },
    }),
  );

  const { scores } = buildDatapoint(records[0]);
  assert.ok(!("pass_rate" in scores), "null pass_rate must be omitted");
});

test("laminarFrontendUrl maps the hosted API to the dashboard and preserves self-hosted URLs", () => {
  assert.equal(laminarFrontendUrl(), "https://www.laminar.sh");
  assert.equal(laminarFrontendUrl("https://api.lmnr.ai"), "https://www.laminar.sh");
  assert.equal(laminarFrontendUrl("https://api.lmnr.ai/"), "https://www.laminar.sh");
  assert.equal(laminarFrontendUrl("https://laminar.internal.example.com/"), "https://laminar.internal.example.com");
});

test("evaluationUrls surfaces the client's created evaluation URLs", async () => {
  const sink = createLaminarSink(
    { apiKey: "key" },
    {
      client: {
        async exportCaseVariant() {},
        evaluationUrls() {
          return ["https://www.laminar.sh/project/p/evaluations/e1"];
        },
      },
    },
  );

  assert.deepEqual(sink.evaluationUrls(), ["https://www.laminar.sh/project/p/evaluations/e1"]);
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

// Note: the real-SDK client path (dynamic import of @lmnr-ai/lmnr,
// LaminarClient.evals init/createDatapoint/updateDatapoint) makes live
// network calls, so it is validated by the manual smoke test documented in
// W-000028 rather than a hermetic unit test. The mapping and
// failure-isolation logic above are exercised with an injected mock client.
