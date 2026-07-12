import assert from "node:assert/strict";
import test from "node:test";

import { executeCasePipeline, exportCaseVariantToSinks } from "../dist/index.js";

function grading(passRate) {
  const passed = passRate === 1 ? 1 : 0;
  return {
    case_id: "case-1",
    assertion_results: [],
    summary: { passed, failed: 1 - passed, total: 1, pass_rate: passRate },
  };
}

function makeRun(label, events) {
  return {
    workspaceDir: `/workspace/${label}`,
    assistantText: label,
    timing: {
      total_tokens: 1,
      duration_ms: 1,
      model: { provider: "test", id: "model" },
      thinking_level: null,
      token_usage: { input_tokens: 0, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, total_tokens: 1 },
      estimated_cost_usd: 0,
      context_window_tokens: null,
      context_window_used_percent: null,
    },
    trace: { label },
    toolSummary: { label },
    contextManifest: { label },
    async cleanup() {
      events.push(`cleanup:${label}`);
    },
  };
}

function pipelineInput({ compare = false, dependencies }) {
  return {
    specification: {
      skill: { skillDir: "/skill", relativeSkillDir: ".", skillDefinitionPath: "/skill/SKILL.md", evalsJsonPath: "/skill/evals/evals.json" },
      evalCase: { id: "case-1", prompt: "test" },
      evalsDir: "/skill/evals",
      skillName: "sample",
    },
    execution: {
      compare,
      extraSkillPaths: [],
      contextMode: "isolated",
      sandbox: "none",
      observabilitySinks: [],
    },
    context: { outputDir: "/runs", runId: "run-1" },
    dependencies,
  };
}

function artifactPaths(label) {
  return {
    paths: {
      assistant: `/runs/${label}/assistant.md`,
      outputs: `/runs/${label}/outputs`,
      timing: `/runs/${label}/timing.json`,
      grading: `/runs/${label}/grading.json`,
      trace: `/runs/${label}/trace.json`,
      tool_summary: `/runs/${label}/tool-summary.json`,
      context_manifest: `/runs/${label}/context-manifest.json`,
    },
  };
}

test("case pipeline sequences variants, assembles one comparison, and cleans each workspace after export", async () => {
  const events = [];
  const result = await executeCasePipeline(pipelineInput({
    compare: true,
    dependencies: {
      async runCase(options) {
        const label = options.attachSkill ? "with" : "without";
        events.push(`run:${label}`);
        return makeRun(label, events);
      },
      async gradeCase({ assistantText }) {
        events.push(`grade:${assistantText}`);
        return grading(assistantText === "with" ? 1 : 0);
      },
      async writeArtifacts({ assistantText }) {
        events.push(`write:${assistantText}`);
        return artifactPaths(assistantText);
      },
      async exportToSinks(_sinks, payload) {
        events.push(`export:${payload.variant}`);
        return [];
      },
    },
  }));

  assert.deepEqual(events, [
    "run:with", "grade:with", "write:with", "export:with_skill", "cleanup:with",
    "run:without", "grade:without", "write:without", "export:without_skill", "cleanup:without",
  ]);
  assert.equal(result.comparison.withSkillPassRate, 1);
  assert.equal(result.comparison.withoutSkillPassRate, 0);
  assert.equal(result.comparison.delta, 1);
  assert.equal(result.variants.with_skill.assistantPath, "/runs/with/assistant.md");
  assert.equal(result.variants.without_skill.assistantPath, "/runs/without/assistant.md");
});

test("case pipeline cleans up after a downstream failure while preserving completed artifact work", async () => {
  const events = [];
  await assert.rejects(
    () => executeCasePipeline(pipelineInput({
      dependencies: {
        async runCase() {
          events.push("run");
          return makeRun("single", events);
        },
        async gradeCase() {
          events.push("grade");
          return grading(1);
        },
        async writeArtifacts() {
          events.push("write");
          return artifactPaths("single");
        },
        async exportToSinks() {
          events.push("export");
          throw new Error("export dependency failed");
        },
      },
    })),
    /export dependency failed/,
  );
  assert.deepEqual(events, ["run", "grade", "write", "export", "cleanup:single"]);
});

test("observability sink failures are isolated and later sinks still receive the case payload", async () => {
  const calls = [];
  const results = await exportCaseVariantToSinks([
    { name: "broken", exportCaseVariant() { calls.push("broken"); throw new Error("offline"); } },
    { name: "healthy", exportCaseVariant() { calls.push("healthy"); return { sink: "healthy", status: "success" }; } },
  ], {});

  assert.deepEqual(calls, ["broken", "healthy"]);
  assert.deepEqual(results, [
    { sink: "broken", status: "failed", message: "offline" },
    { sink: "healthy", status: "success" },
  ]);
});

test("compare mode runs with_skill first and fails fast without a partial comparison", async () => {
  const events = [];
  await assert.rejects(
    () => executeCasePipeline(pipelineInput({
      compare: true,
      dependencies: {
        async runCase(options) {
          const label = options.attachSkill ? "with" : "without";
          events.push(`run:${label}`);
          return makeRun(label, events);
        },
        async gradeCase({ assistantText }) {
          events.push(`grade:${assistantText}`);
          if (assistantText === "with") throw new Error("with_skill failed");
          return grading(1);
        },
        async writeArtifacts() { throw new Error("not reached"); },
        async exportToSinks() { throw new Error("not reached"); },
      },
    })),
    /with_skill failed/,
  );
  assert.deepEqual(events, ["run:with", "grade:with", "cleanup:with"]);
});
