import path from "node:path";
import { EvalRunCancelledError, readEvalsJson, runEvalsCommand } from "../../../dist/index.js";
import { createReplayRuntimeFromFile } from "../../../dist/runtime/replay.js";
import { cancelRun, completeRun, failRun, updateCase } from "./state.mjs";

const controllers = new Map();

function abortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

async function replayRuntime() {
  const fixturePath = process.env.ARC_SKILL_EVAL_DAEMON_REPLAY;
  if (!fixturePath) {
    return undefined;
  }

  const replay = await createReplayRuntimeFromFile(fixturePath);
  const delayMs = Number.parseInt(process.env.ARC_SKILL_EVAL_DAEMON_REPLAY_DELAY_MS ?? "0", 10) || 0;
  return {
    id: replay.id,
    runCase: async (options) => {
      if (delayMs > 0) {
        await wait(delayMs, options.signal);
      }
      return replay.runCase(options);
    },
  };
}

export function runtimeName() {
  return process.env.ARC_SKILL_EVAL_DAEMON_REPLAY ? "replay" : "pi-sdk";
}

export async function readSuiteCases(skillDir) {
  const evals = await readEvalsJson(path.join(skillDir, "evals", "evals.json"));
  return evals.evals.map((evalCase) => ({
    id: String(evalCase.id),
    assertions: (evalCase.assertions ?? []).length,
  }));
}

function caseCost(artifacts) {
  const variants = artifacts.variants ? Object.values(artifacts.variants) : [artifacts];
  return variants.reduce((total, variant) => total + (variant?.timing?.estimated_cost_usd ?? 0), 0);
}

function variantPassed(variant) {
  const summary = variant?.grading?.summary;
  return Boolean(summary && summary.total > 0 && summary.failed === 0);
}

/**
 * The `run.completed` frame. passed and total count cases, like the CLI
 * summary. A comparison run adds how many cases passed with and without the
 * skill, and the benchmark's pass rate difference in percentage points.
 */
function summarize(result, compare) {
  const cases = result.skills.flatMap((skill) => skill.cases);
  const benchmark = result.skills[0]?.benchmark?.summary;
  const failed = result.summary.failedCases > 0 || result.summary.failedAssertions > 0;
  const comparison = compare
    ? {
        withSkill: cases.filter((artifacts) => variantPassed(artifacts.variants?.with_skill)).length,
        withoutSkill: cases.filter((artifacts) => variantPassed(artifacts.variants?.without_skill)).length,
        ...(typeof benchmark?.delta === "number" ? { delta: benchmark.delta * 100 } : {}),
      }
    : {};
  return {
    passed: result.summary.passedCases,
    total: result.summary.totalCases,
    cost: cases.reduce((total, artifacts) => total + caseCost(artifacts), 0),
    exitCode: failed ? 1 : 0,
    artifactPath: result.skills[0]?.outputDir ?? "",
    ...comparison,
  };
}

export function startRun(runId, request) {
  const controller = new AbortController();
  controllers.set(runId, controller);

  const totals = new Map(request.cases.map((evalCase) => [evalCase.id, evalCase.assertions]));
  for (const evalCase of request.cases) {
    updateCase(runId, {
      caseId: evalCase.id,
      phase: "queued",
      assertionsPassed: 0,
      assertionsFailed: 0,
      totalAssertions: evalCase.assertions,
    });
  }

  const onProgress = (event) => {
    if (event.phase === "case-start") {
      updateCase(runId, {
        caseId: event.caseId,
        phase: "running",
        assertionsPassed: 0,
        assertionsFailed: 0,
        totalAssertions: totals.get(event.caseId) ?? 0,
      });
      return;
    }

    if (event.phase === "case-done") {
      const total = event.assertionsTotal ?? 0;
      const passed = event.assertionsPassed ?? 0;
      updateCase(runId, {
        caseId: event.caseId,
        phase: event.passed ? "pass" : "fail",
        assertionsPassed: passed,
        assertionsFailed: total - passed,
        totalAssertions: total,
        ...(event.message ? { error: event.message } : {}),
      });
    }
  };

  (async () => {
    try {
      const runtime = await replayRuntime();
      const result = await runEvalsCommand({
        input: request.skillDir,
        caseIds: request.caseIds,
        model: request.model,
        judgeModel: request.judgeModel,
        compare: request.compare,
        extraSkillPaths: request.extraSkillPaths,
        contextMode: request.contextMode,
        sandbox: request.sandbox,
        iteration: request.iteration,
        signal: controller.signal,
        onProgress,
        ...(runtime ? { runtime } : {}),
      });

      if (result.summary.totalCases === 0) {
        failRun(runId, "The run finished without executing any case. Check the skill folder and the case id.");
        return;
      }

      completeRun(runId, summarize(result, request.compare));
    } catch (error) {
      if (error instanceof EvalRunCancelledError || controller.signal.aborted) {
        cancelRun(runId);
        return;
      }
      failRun(runId, error instanceof Error ? error.message : String(error));
    } finally {
      controllers.delete(runId);
    }
  })();
}

export function abortRun(runId) {
  const controller = controllers.get(runId);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}
