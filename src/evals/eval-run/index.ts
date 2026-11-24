import { aggregateEvalRun } from "./aggregate.js";
import { executeEvalRun } from "./execute.js";
import { planEvalRun } from "./plan.js";
import { writeSyncRecord } from "../sync-record.js";
import type { EvalRunOptions, EvalRunResult, SkillRunResult } from "./types.js";

export * from "./types.js";
export { planEvalRun, filterCases, buildRunId, normalizeIteration } from "./plan.js";
export { executeEvalRun } from "./execute.js";
export { aggregateEvalRun, writeSkillBenchmark, writeSkillTrials } from "./aggregate.js";

/**
 * Plan, execute, and aggregate a multi-skill eval run. Per-case failures are
 * recorded in each skill's `errors[]` rather than aborting the run.
 */
export async function runEval(options: EvalRunOptions): Promise<EvalRunResult> {
  const plan = await planEvalRun(options);
  const skills = await executeEvalRun(plan, options);
  if (options.stamp) {
    for (const skill of skills) {
      skill.sync = await stampIfSuitePassed(skill, plan.runId, options);
    }
  }
  const summary = aggregateEvalRun(skills);
  return { runId: plan.runId, iteration: plan.iteration, skills, summary };
}

async function stampIfSuitePassed(
  skill: SkillRunResult,
  runId: string,
  options: EvalRunOptions,
): Promise<NonNullable<SkillRunResult["sync"]>> {
  const refuse = (reason: string) => ({ stamped: false as const, reason });

  if (options.caseIds && options.caseIds.length > 0) {
    return refuse("--case ran part of the suite; run every case to stamp it.");
  }
  if (skill.cases.length === 0 && skill.errors.length === 0) {
    return refuse("the suite has no cases.");
  }
  if (skill.errors.length > 0) {
    return refuse(`${skill.errors.length} case(s) errored.`);
  }
  const failed = skill.cases.filter((caseRun) => caseRun.grading.summary.failed > 0).length;
  if (failed > 0) {
    return refuse(`${failed} case(s) failed.`);
  }
  const failedTrials = (skill.trials?.cases ?? []).reduce(
    (sum, trialCase) => sum + trialCase.errored_trials + trialCase.failed_trials,
    0,
  );
  if (failedTrials > 0) {
    return refuse(`${failedTrials} trial(s) failed.`);
  }
  const softMisses = skill.cases.reduce((sum, caseRun) => sum + (caseRun.grading.summary.soft_failed ?? 0), 0);
  if (options.strict && softMisses > 0) {
    return refuse(`${softMisses} soft assertion(s) missed under --strict.`);
  }

  const { path } = await writeSyncRecord(skill.skillDir, runId);
  return { stamped: true, path };
}
