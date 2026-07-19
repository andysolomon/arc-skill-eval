import { aggregateEvalRun } from "./aggregate.js";
import { executeEvalRun } from "./execute.js";
import { planEvalRun } from "./plan.js";
import type { EvalRunOptions, EvalRunResult } from "./types.js";

export * from "./types.js";
export { planEvalRun, filterCases, buildRunId, normalizeIteration } from "./plan.js";
export { executeEvalRun } from "./execute.js";
export { aggregateEvalRun, writeSkillBenchmark } from "./aggregate.js";

/**
 * Plan, execute, and aggregate a multi-skill eval run. Per-case failures are
 * recorded in each skill's `errors[]` rather than aborting the run.
 */
export async function runEval(options: EvalRunOptions): Promise<EvalRunResult> {
  const plan = await planEvalRun(options);
  const skills = await executeEvalRun(plan, options);
  const summary = aggregateEvalRun(skills);
  return { runId: plan.runId, iteration: plan.iteration, skills, summary };
}
