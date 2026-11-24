import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CliCommandError, formatRunEvalsResult, runEvalsCommand } from "../dist/index.js";

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

test("runEvalsCommand sends only shared-classifier judge assertions to the judge", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "classifier",
    evals: [{
      id: "deterministic-output",
      prompt: "Say done.",
      assertions: [{ id: "exact", kind: "output", method: "exact", expected: "done" }],
    }],
  });
  let judgeCalls = 0;

  try {
    const result = await runEvalsCommand({
      input: skillDir,
      runId: "run-classifier",
      createSession: async () => ({ model: null, session: createInjectedSession("done") }),
      judge: async () => {
        judgeCalls++;
        return { results: [] };
      },
    });

    assert.equal(judgeCalls, 0);
    assert.equal(result.summary.passedAssertions, 1);
    assert.equal(result.skills[0].cases[0].grading.judge_model, undefined);
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

// Self-judging: with no --judge-model the judge is the model that ran the
// case, so it grades its own work. The summary has to say so. It could:
//   1. count a case that has no judge assertion (a script cannot self-judge),
//   2. miss the default fallback, where nobody asked for that judge,
//   3. still count the case when --judge-model names a different model.
test("the summary counts cases graded by the model that ran them", async () => {
  const { repoRoot, skillDir } = await createSkillFixture({
    skillName: "self-judged",
    evals: [
      { id: "judged", prompt: "Say hello.", assertions: ["The response contains 'hello'"] },
      { id: "scripted", prompt: "Say hello.", assertions: [{ type: "regex-match", pattern: "hello" }] },
    ],
  });

  const runOnce = (judgeModel) =>
    runEvalsCommand({
      input: skillDir,
      createSession: async ({ caseDefinition }) => ({
        model: null,
        session: createInjectedSession(caseDefinition.prompt),
      }),
      judge: STUB_JUDGE_PASS,
      ...(judgeModel ? { judgeModel } : {}),
    });

  try {
    const selfJudged = await runOnce();
    assert.equal(selfJudged.summary.selfJudgedCases, 1);
    assert.match(formatRunEvalsResult(selfJudged), /1 case was graded by the model that ran it \(mock\/mock-model\)/);

    const separateJudge = await runOnce({ provider: "other", id: "judge-model" });
    assert.equal(separateJudge.summary.selfJudgedCases, 0);
    assert.doesNotMatch(formatRunEvalsResult(separateJudge), /graded by the model that ran/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
