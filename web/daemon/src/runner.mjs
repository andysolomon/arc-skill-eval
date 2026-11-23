/**
 * Runs an eval suite in process with the arc-skill-eval library built into
 * the repository's `dist/` (run `npm run build` at the repository root), the
 * same call the TUI makes. Case progress comes from the library's
 * `onProgress` hook and cancellation goes through its `signal`, so the web
 * app sees real progress and Cancel stops the in-flight case.
 *
 * Test seam: when ARC_SKILL_EVAL_DAEMON_REPLAY names a replay fixture (see
 * src/runtime/replay.ts), cases run on the library's replay runtime instead
 * of a model. Everything else (planning, workspaces, grading, artifacts on
 * disk, progress, cancellation) is the real code path.
 * ARC_SKILL_EVAL_DAEMON_REPLAY_DELAY_MS holds each case for that long first,
 * so a test can cancel a run while a case is in flight.
 */

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

/** The runtime the daemon reports in `/health`: replay when the test seam is on. */
export function runtimeName() {
  return process.env.ARC_SKILL_EVAL_DAEMON_REPLAY ? "replay" : "pi-sdk";
}

/** Case ids and assertion counts in a skill's suite, in file order. */
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

/**
 * Start a run in the background. `request` holds library options that the
 * route already validated: skillDir, cases (the selected suite cases),
 * caseIds, and the run flags.
 */
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

/** Abort a run in flight. Returns false when the run is not running. */
export function abortRun(runId) {
  const controller = controllers.get(runId);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}
