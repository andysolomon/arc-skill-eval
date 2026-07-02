import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CliCommandError, runEvalsCommand } from "../dist/index.js";

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
    assert.deepEqual(skillResult.observabilityExportFailures, []);
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

      assert.deepEqual(caseArt.observabilityExports, []);
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

test("runEvalsCommand accepts a sandbox override and per-case sandbox without changing default behavior", async () => {
  // W-000023 only threads the resolved sandbox value through to the
  // runner; the just-bash execution path (and an observable precedence
  // assertion) arrives in W-000021. Here we confirm the plumbing accepts
  // both a CLI-level override and a per-case field and still runs the
  // existing temp-workspace path end-to-end.
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "sample",
    evals: [
      { id: "cli-override", prompt: "Say hello.", sandbox: "none", assertions: ["The response contains 'hello'"] },
      { id: "case-field", prompt: "Say hi.", sandbox: "just-bash", assertions: ["The response contains 'hi'"] },
    ],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-sandbox",
      sandbox: "just-bash",
      createSession: async ({ caseDefinition }) => ({
        model: null,
        session: createInjectedSession(caseDefinition.prompt),
      }),
      judge: STUB_JUDGE_PASS,
    });

    const [skillResult] = result.skills;
    assert.equal(skillResult.cases.length, 2);
    assert.equal(skillResult.errors.length, 0);
    for (const caseArt of skillResult.cases) {
      const grading = JSON.parse(await readFile(caseArt.gradingPath, "utf8"));
      assert.equal(grading.summary.failed, 0);
    }
    assert.equal(result.summary.passedCases, 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand exports complete case variant payloads to observability sinks", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "sample",
    evals: [{ id: "observed", prompt: "Say hello.", assertions: ["The response contains hello"] }],
  });
  const payloads = [];

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-observed",
      iteration: "obs",
      createSession: async () => ({
        model: null,
        session: createInjectedSession("hello"),
      }),
      judge: STUB_JUDGE_PASS,
      observabilitySinks: [{
        name: "fake-sink",
        exportCaseVariant(payload) {
          payloads.push(payload);
          return { sink: "fake-sink", status: "success", message: "exported" };
        },
      }],
    });

    assert.equal(payloads.length, 1);
    const [payload] = payloads;
    assert.equal(payload.run_id, "run-observed");
    assert.equal(payload.iteration, "iteration-obs");
    assert.deepEqual(payload.skill, { name: "sample", dir: skillDir });
    assert.equal(payload.case_id, "observed");
    assert.equal(payload.variant, "with_skill");
    assert.equal(payload.timing.total_tokens, 12);
    assert.equal(payload.grading_summary.passed, 1);
    assert.equal(payload.grading.assertion_results.length, 1);
    assert.equal(payload.trace.identity.runtime, "pi-sdk");
    assert.equal(payload.tool_summary.tool_call_count, 0);
    assert.equal(payload.context_manifest.mode, "isolated");
    assert.ok(payload.artifact_paths.assistant.endsWith("assistant.md"));
    assert.ok(payload.artifact_paths.outputs.endsWith("outputs"));
    assert.ok(payload.artifact_paths.grading.endsWith("grading.json"));

    const caseArtifacts = result.skills[0].cases[0];
    assert.deepEqual(caseArtifacts.observabilityExports, [{ sink: "fake-sink", status: "success", message: "exported" }]);
    assert.deepEqual(result.skills[0].observabilityExportFailures, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand isolates observability sink failures after local artifacts are written", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "sample",
    evals: [{ id: "export-fails", prompt: "Say hello.", assertions: ["The response contains hello"] }],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-export-fails",
      createSession: async () => ({
        model: null,
        session: createInjectedSession("hello"),
      }),
      judge: STUB_JUDGE_PASS,
      observabilitySinks: [{
        name: "broken-sink",
        exportCaseVariant() {
          throw new Error("network unavailable");
        },
      }],
    });

    assert.equal(result.summary.passedCases, 1);
    const [caseArtifacts] = result.skills[0].cases;
    assert.equal(JSON.parse(await readFile(caseArtifacts.gradingPath, "utf8")).summary.passed, 1);
    assert.equal(await readFile(caseArtifacts.assistantPath, "utf8"), "hello\n");
    assert.deepEqual(caseArtifacts.observabilityExports, [{
      sink: "broken-sink",
      status: "failed",
      message: "network unavailable",
    }]);
    assert.deepEqual(result.skills[0].observabilityExportFailures, [{
      caseId: "export-fails",
      variant: "with_skill",
      sink: "broken-sink",
      message: "network unavailable",
    }]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand forwards agentDir and records it in context manifest", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "sample",
    evals: [{ id: "agent-dir", prompt: "Write greeting.", assertions: ["The response contains greeting"] }],
  });
  const agentDir = path.join(repoRoot, ".arc-skill-eval", "pi-agent");
  let seenAgentDir;
  let seenConfigAgentDir;

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-agent-dir",
      agentDir,
      createSession: async (options) => {
        seenAgentDir = options.agentDir;
        seenConfigAgentDir = options.configAgentDir;
        return {
          model: null,
          session: createInjectedSession(options.caseDefinition.prompt),
        };
      },
      judge: STUB_JUDGE_PASS,
    });

    assert.equal(seenAgentDir, path.resolve(agentDir));
    assert.equal(seenConfigAgentDir, agentDir);
    const manifest = JSON.parse(await readFile(result.skills[0].cases[0].contextManifestPath, "utf8"));
    assert.equal(manifest.agent_dir, path.resolve(agentDir));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalsCommand preflights incomplete eval-owned agent dir", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "sample",
    evals: [{ id: "preflight", prompt: "Write greeting.", assertions: [] }],
  });
  const agentDir = path.join(repoRoot, ".arc-skill-eval", "pi-agent");

  try {
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(agentDir, "auth.json"), "{}\n", "utf8");

    await assert.rejects(
      () => runEvalsCommand({ input: skillDir, runId: "run-preflight", agentDir }),
      (error) => {
        assert(error instanceof CliCommandError);
        assert.match(error.message, new RegExp(`--agent-dir ${agentDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        assert.match(error.message, /missing or unreadable models\.json/);
        assert.match(error.message, /missing or unreadable settings\.json/);
        assert.match(error.message, /arc-skill-eval init-runtime/);
        assert.match(error.message, /omit --agent-dir/);
        return true;
      },
    );
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

test("runEvalsCommand loads extra skills into context manifests for conflict evals", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    evals: [
      { id: "conflict", prompt: "Do the task.", assertions: ["The response succeeds"] },
    ],
  });
  const extraSkillDir = path.join(repoRoot, "skills", "release-distractor");
  await mkdir(extraSkillDir, { recursive: true });
  await writeFile(
    path.join(extraSkillDir, "SKILL.md"),
    "---\nname: release-distractor\ndescription: Distractor skill.\n---\n\n# release-distractor\n",
    "utf8",
  );

  try {
    const received = [];
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-conflict",
      compare: true,
      extraSkillPaths: [extraSkillDir],
      contextMode: "isolated",
      createSession: async ({ attachSkill, extraSkillPaths, contextMode }) => {
        received.push({ attachSkill, extraSkillPaths, contextMode });
        return {
          model: null,
          session: createInjectedSession(attachSkill ? "with target" : "without target"),
        };
      },
      judge: STUB_JUDGE_PASS,
    });

    assert.deepEqual(received, [
      { attachSkill: true, extraSkillPaths: [extraSkillDir], contextMode: "isolated" },
      { attachSkill: false, extraSkillPaths: [extraSkillDir], contextMode: "isolated" },
    ]);

    const caseArt = result.skills[0].cases[0];
    const withContext = JSON.parse(await readFile(caseArt.variants.with_skill.contextManifestPath, "utf8"));
    const withoutContext = JSON.parse(await readFile(caseArt.variants.without_skill.contextManifestPath, "utf8"));

    assert.deepEqual(withContext.attached_skills, [
      { name: "sample", path: path.join(skillDir, "SKILL.md"), role: "target" },
      { name: "release-distractor", path: path.join(extraSkillDir, "SKILL.md"), role: "extra" },
    ]);
    assert.deepEqual(withoutContext.attached_skills, [
      { name: "release-distractor", path: path.join(extraSkillDir, "SKILL.md"), role: "extra" },
    ]);
    assert.equal(withContext.ambient.extensions, false);
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

test("judge model defaults to the resolved runner model when --judge-model is absent", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "judge-default",
    evals: [{ id: "j1", prompt: "Say hello.", assertions: ["The response contains 'hello'"] }],
  });

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-judge-default",
      createSession: async ({ caseDefinition }) => ({
        model: null,
        session: createInjectedSession(caseDefinition.prompt),
      }),
      judge: STUB_JUDGE_PASS,
      // No judgeModel: grading must record the model that ran the case
      // (mock/mock-model from the injected session), not the built-in
      // mistral last-resort default.
    });

    const [caseArt] = result.skills[0].cases;
    const grading = JSON.parse(await readFile(caseArt.gradingPath, "utf8"));
    assert.deepEqual(grading.judge_model, { provider: "mock", id: "mock-model" });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
