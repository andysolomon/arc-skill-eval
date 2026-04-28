import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEvalsCommand } from "../dist/index.js";

async function createSkillFixture({
  skillName = "sample",
  evals = [],
} = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-runcmd-"));
  const skillDir = path.join(repoRoot, "skills", skillName);
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });

  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: Fixture skill used by runEvalsCommand tests.\n---\n\n# ${skillName}\n`,
    "utf8",
  );

  await writeFile(
    path.join(evalsDir, "evals.json"),
    JSON.stringify({ skill_name: skillName, evals }),
    "utf8",
  );

  return { repoRoot, skillDir, evalsDir };
}

function createAssistantMessage(text, usageOverrides = {}) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "mock",
    provider: "mock",
    model: "mock-model",
    stopReason: "stop",
    timestamp: Date.now(),
    usage: {
      input: 5,
      output: 7,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 12,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      ...usageOverrides,
    },
  };
}

function createInjectedSession(assistantText) {
  const state = { listener: () => {} };
  return {
    sessionId: "session-test",
    sessionFile: undefined,
    messages: [createAssistantMessage(assistantText)],
    model: { provider: "mock", id: "mock-model", contextWindow: 1000 },
    thinkingLevel: "medium",
    getContextUsage: () => ({ contextWindow: 1000, percent: 1.2 }),
    subscribe(listener) {
      state.listener = listener;
      return () => {
        state.listener = () => {};
      };
    },
    async prompt() {
      state.listener({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: assistantText },
      });
    },
    dispose() {},
  };
}

const STUB_JUDGE_PASS = async ({ assertions }) => ({
  results: assertions.map((_, index) => ({
    passed: true,
    evidence: `stub pass #${index + 1}`,
  })),
});

const STUB_JUDGE_FAIL = async ({ assertions }) => ({
  results: assertions.map((_, index) => ({
    passed: false,
    evidence: `stub fail #${index + 1}`,
  })),
});

test("runEvalsCommand runs every case, writes per-case artifacts, aggregates passing summary", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "sample",
    evals: [
      { id: 1, prompt: "Say hello.", assertions: ["The response contains 'hello'"] },
      { id: "case-two", prompt: "Say goodbye.", assertions: ["The response contains 'goodbye'"] },
    ],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-fixed",
      createSession: async ({ caseDefinition }) => ({
        model: null,
        session: createInjectedSession(caseDefinition.prompt),
      }),
      judge: STUB_JUDGE_PASS,
    });

    assert.equal(result.runId, "run-fixed");
    assert.equal(result.skills.length, 1);
    const [skillResult] = result.skills;
    assert.equal(skillResult.skillName, "sample");
    assert.equal(skillResult.cases.length, 2);
    assert.equal(skillResult.errors.length, 0);
    assert.equal(skillResult.benchmarkPath, undefined);

    for (const caseArt of skillResult.cases) {
      const grading = JSON.parse(await readFile(caseArt.gradingPath, "utf8"));
      assert.equal(grading.assertion_results.length, 1);
      assert.equal(grading.summary.passed, 1);
      assert.equal(grading.summary.failed, 0);

      const timing = JSON.parse(await readFile(caseArt.timingPath, "utf8"));
      assert.equal(timing.total_tokens, 12);
      assert.deepEqual(timing.token_usage, {
        input_tokens: 5,
        output_tokens: 7,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        total_tokens: 12,
      });
      assert.deepEqual(timing.model, { provider: "mock", id: "mock-model", thinking: "medium" });
      assert.equal(timing.thinking_level, "medium");
      assert.equal(timing.estimated_cost_usd, 0);
      assert.equal(timing.context_window_tokens, 1000);
      assert.equal(timing.context_window_used_percent, 1.2);
      assert.ok(timing.duration_ms >= 0);

      assert.equal(await readFile(caseArt.assistantPath, "utf8"), `${caseArt.caseId === "1" ? "Say hello." : "Say goodbye."}\n`);

      const trace = JSON.parse(await readFile(caseArt.tracePath, "utf8"));
      assert.equal(trace.identity.runtime, "pi-sdk");
      assert.equal(trace.observations.assistantText, caseArt.caseId === "1" ? "Say hello." : "Say goodbye.");

      const toolSummary = JSON.parse(await readFile(caseArt.toolSummaryPath, "utf8"));
      assert.equal(toolSummary.tool_call_count, 0);
      assert.equal(toolSummary.mcp_tool_call_count, 0);

      const contextManifest = JSON.parse(await readFile(caseArt.contextManifestPath, "utf8"));
      assert.equal(contextManifest.runtime, "pi");
      assert.equal(contextManifest.mode, "isolated");
      assert.deepEqual(contextManifest.attached_skills, [
        { name: "sample", path: path.join(skillDir, "SKILL.md"), role: "target" },
      ]);
      assert.equal(contextManifest.ambient.extensions, false);
      assert.ok(contextManifest.available_tools.some((tool) => tool.name === "bash" && tool.source === "builtin"));

      assert.ok(caseArt.outputsDir.startsWith(skillDir));
      assert.ok(caseArt.outputsDir.includes("run-fixed"));
    }

    assert.equal(result.summary.totalCases, 2);
    assert.equal(result.summary.passedCases, 2);
    assert.equal(result.summary.failedCases, 0);
    assert.equal(result.summary.totalAssertions, 2);
    assert.equal(result.summary.passedAssertions, 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand supports iteration-scoped output directories", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    evals: [
      { id: "iter", prompt: "Say hello.", assertions: ["The response contains 'hello'"] },
    ],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-iteration",
      iteration: "1",
      createSession: async () => ({
        model: null,
        session: createInjectedSession("hello"),
      }),
      judge: STUB_JUDGE_PASS,
    });

    assert.equal(result.iteration, "iteration-1");
    assert.equal(result.skills[0].iteration, "iteration-1");
    assert.equal(
      result.skills[0].outputDir,
      path.join(skillDir, "evals-runs", "iteration-1", "run-iteration"),
    );
    assert.equal(
      result.skills[0].cases[0].gradingPath,
      path.join(skillDir, "evals-runs", "iteration-1", "run-iteration", "eval-iter", "grading.json"),
    );

    const grading = JSON.parse(await readFile(result.skills[0].cases[0].gradingPath, "utf8"));
    assert.equal(grading.summary.passed, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand compare mode writes with_skill and without_skill variant artifacts", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    evals: [
      { id: "compare", prompt: "Do the task.", assertions: ["The response succeeds"] },
    ],
  });

  try {
    const attachSkillValues = [];
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-compare",
      iteration: "baseline",
      compare: true,
      createSession: async ({ attachSkill, workspaceDir }) => {
        attachSkillValues.push(attachSkill);
        await writeFile(path.join(workspaceDir, "variant.txt"), attachSkill ? "with" : "without", "utf8");
        return {
          model: null,
          session: createInjectedSession(attachSkill ? "success" : "baseline"),
        };
      },
      judge: async ({ assistantText, assertions }) => ({
        results: assertions.map(() => ({
          passed: assistantText === "success",
          evidence: assistantText,
        })),
      }),
    });

    assert.deepEqual(attachSkillValues, [true, false]);
    assert.equal(result.skills[0].cases.length, 1);
    const caseArt = result.skills[0].cases[0];
    assert.equal(caseArt.variant, "with_skill");
    assert.equal(caseArt.comparison.withSkillPassRate, 1);
    assert.equal(caseArt.comparison.withoutSkillPassRate, 0);
    assert.equal(caseArt.comparison.delta, 1);
    assert.equal(result.iteration, "iteration-baseline");
    assert.ok(result.skills[0].benchmarkPath.endsWith("iteration-baseline/run-compare/benchmark.json"));

    const benchmark = JSON.parse(await readFile(result.skills[0].benchmarkPath, "utf8"));
    assert.equal(benchmark.benchmark_version, "1");
    assert.equal(benchmark.skill_name, "sample");
    assert.equal(benchmark.summary.total_cases, 1);
    assert.equal(benchmark.summary.with_skill_pass_rate, 1);
    assert.equal(benchmark.summary.without_skill_pass_rate, 0);
    assert.equal(benchmark.summary.delta, 1);
    assert.equal(benchmark.cases[0].case_id, "compare");
    assert.equal(benchmark.metadata.runtime, "pi");
    assert.equal(benchmark.metadata.extensions.variants[0], "with_skill");
    assert.ok(benchmark.metadata.extensions.artifact_root.endsWith("iteration-baseline/run-compare"));
    assert.ok(benchmark.metadata.extensions.case_artifacts.compare.with_skill.grading_path.endsWith("with_skill/grading.json"));
    assert.ok(benchmark.metadata.extensions.case_artifacts.compare.with_skill.assistant_path.endsWith("with_skill/assistant.md"));
    assert.ok(benchmark.metadata.extensions.case_artifacts.compare.with_skill.trace_path.endsWith("with_skill/trace.json"));
    assert.ok(benchmark.metadata.extensions.case_artifacts.compare.with_skill.tool_summary_path.endsWith("with_skill/tool-summary.json"));
    assert.ok(benchmark.metadata.extensions.case_artifacts.compare.with_skill.context_manifest_path.endsWith("with_skill/context-manifest.json"));
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.total_tokens, 12);
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.estimated_cost_usd, 0);
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.context_window_tokens, 1000);
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.context_window_used_percent, 1.2);
    assert.deepEqual(benchmark.metadata.extensions.case_artifacts.compare.with_skill.model, { provider: "mock", id: "mock-model", thinking: "medium" });
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.thinking_level, "medium");
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.tool_call_count, 0);
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.tool_error_count, 0);
    assert.equal(benchmark.metadata.extensions.case_artifacts.compare.with_skill.mcp_tool_call_count, 0);
    assert.deepEqual(benchmark.metadata.extensions.case_artifacts.compare.with_skill.attached_skills, [
      { name: "sample", path: path.join(skillDir, "SKILL.md"), role: "target" },
    ]);
    assert.deepEqual(benchmark.metadata.extensions.case_artifacts.compare.with_skill.mcp_tools, []);

    assert.equal(
      await readFile(path.join(caseArt.variants.with_skill.outputsDir, "variant.txt"), "utf8"),
      "with",
    );
    assert.equal(
      await readFile(path.join(caseArt.variants.without_skill.outputsDir, "variant.txt"), "utf8"),
      "without",
    );

    assert.equal(await readFile(caseArt.variants.with_skill.assistantPath, "utf8"), "success\n");
    assert.equal(await readFile(caseArt.variants.without_skill.assistantPath, "utf8"), "baseline\n");

    const withGrading = JSON.parse(await readFile(caseArt.variants.with_skill.gradingPath, "utf8"));
    const withoutGrading = JSON.parse(await readFile(caseArt.variants.without_skill.gradingPath, "utf8"));
    assert.equal(withGrading.summary.passed, 1);
    assert.equal(withoutGrading.summary.failed, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand surfaces failing assertions in the summary", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    evals: [
      { id: "only", prompt: "Do it.", assertions: ["Produces the magic word"] },
    ],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-fail",
      createSession: async () => ({
        model: null,
        session: createInjectedSession("nope"),
      }),
      judge: STUB_JUDGE_FAIL,
    });

    assert.equal(result.summary.failedAssertions, 1);
    assert.equal(result.summary.passedAssertions, 0);
    assert.equal(result.summary.failedCases, 1);
    const grading = JSON.parse(await readFile(result.skills[0].cases[0].gradingPath, "utf8"));
    assert.equal(grading.assertion_results[0].passed, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand honors --case filter", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    evals: [
      { id: 1, prompt: "A", assertions: ["contains something"] },
      { id: 2, prompt: "B", assertions: ["contains something"] },
    ],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-filter",
      caseIds: ["2"],
      createSession: async ({ caseDefinition }) => {
        assert.equal(caseDefinition.caseId, "2");
        return {
          model: null,
          session: createInjectedSession("yes"),
        };
      },
      judge: STUB_JUDGE_PASS,
    });

    assert.equal(result.skills[0].cases.length, 1);
    assert.equal(result.skills[0].cases[0].caseId, "2");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand records per-case error without aborting the run", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    evals: [
      { id: "ok", prompt: "fine", assertions: ["works"] },
      { id: "bad", prompt: "explode", assertions: ["whatever"] },
    ],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-partial",
      createSession: async ({ caseDefinition }) => {
        if (caseDefinition.caseId === "bad") {
          throw new Error("injected failure");
        }
        return {
          model: null,
          session: createInjectedSession("ok"),
        };
      },
      judge: STUB_JUDGE_PASS,
    });

    assert.equal(result.skills[0].cases.length, 1);
    assert.equal(result.skills[0].errors.length, 1);
    assert.equal(result.skills[0].errors[0].caseId, "bad");
    assert.equal(result.summary.failedCases, 1);
    assert.equal(result.summary.passedCases, 1);
    assert.equal(result.summary.totalCases, 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
