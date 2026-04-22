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

    for (const caseArt of skillResult.cases) {
      const grading = JSON.parse(await readFile(caseArt.gradingPath, "utf8"));
      assert.equal(grading.assertion_results.length, 1);
      assert.equal(grading.summary.passed, 1);
      assert.equal(grading.summary.failed, 0);

      const timing = JSON.parse(await readFile(caseArt.timingPath, "utf8"));
      assert.equal(timing.total_tokens, 12);
      assert.ok(timing.duration_ms >= 0);

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
