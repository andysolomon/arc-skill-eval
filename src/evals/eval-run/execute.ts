import { Effect } from "effect";

import {
  collectObservabilityExportFailures,
  executeCasePipeline,
  type CaseRunArtifacts,
} from "../case-pipeline.js";
import type { EvalCase } from "../types.js";
import {
  EvalRunCancelledError,
  EvalRunError,
  type EvalRunOptions,
  type EvalRunPlan,
  type PlannedSkillRun,
  type SkillRunResult,
} from "./types.js";
import { writeSkillBenchmark } from "./aggregate.js";

type CaseOutcome =
  | { kind: "done"; artifacts: CaseRunArtifacts }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

interface CaseWork {
  planned: PlannedSkillRun;
  evalCase: EvalCase;
}

/**
 * Run every planned case through the case pipeline, `options.concurrency`
 * at a time (default 1), and optionally write per-skill benchmarks.
 */
export async function executeEvalRun(plan: EvalRunPlan, options: EvalRunOptions): Promise<SkillRunResult[]> {
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new EvalRunError(`concurrency must be a positive whole number, got ${concurrency}.`);
  }

  const work: CaseWork[] = plan.skills.flatMap((planned) => planned.cases.map((evalCase) => ({ planned, evalCase })));

  // A bounded pool over every case of every skill. Cancellation does not
  // interrupt the pool: each running case already stops on `options.signal`
  // and removes its own workspace, and a queued case sees the signal and
  // never starts. Waiting for all of them to settle is what guarantees every
  // workspace is gone before EvalRunCancelledError is thrown. Results come
  // back in `work` order, whatever order cases finish in.
  const outcomes = await Effect.runPromise(
    Effect.forEach(work, (unit) => Effect.promise(() => runCase(unit, plan, options)), { concurrency }),
  );
  if (options.signal?.aborted) {
    throw new EvalRunCancelledError();
  }

  const skillResults: SkillRunResult[] = [];
  let next = 0;
  for (const planned of plan.skills) {
    const result: SkillRunResult = {
      skillName: planned.evalsFile.skill_name,
      skillDir: planned.skill.skillDir,
      outputDir: planned.outputDir,
      iteration: plan.iteration,
      cases: [],
      errors: [],
      observabilityExportFailures: [],
    };

    for (const evalCase of planned.cases) {
      const outcome = outcomes[next++]!;
      if (outcome.kind === "done") {
        result.cases.push(outcome.artifacts);
        result.observabilityExportFailures.push(...collectObservabilityExportFailures(outcome.artifacts));
      } else if (outcome.kind === "failed") {
        result.errors.push({ caseId: String(evalCase.id), message: outcome.message });
      }
    }

    if (options.compare) {
      const { benchmarkPath, benchmark } = await writeSkillBenchmark({
        runId: plan.runId,
        skillName: result.skillName,
        outputDir: planned.outputDir,
        cases: result.cases,
        errors: result.errors,
      });
      result.benchmarkPath = benchmarkPath;
      result.benchmark = benchmark;
    }

    skillResults.push(result);
  }

  return skillResults;
}

/** Runs one case. Never rejects: a failure is recorded, and cancellation is reported as such. */
async function runCase({ planned, evalCase }: CaseWork, plan: EvalRunPlan, options: EvalRunOptions): Promise<CaseOutcome> {
  if (options.signal?.aborted) {
    return { kind: "cancelled" };
  }
  const caseId = String(evalCase.id);
  options.onProgress?.({ phase: "case-start", caseId });
  try {
    const artifacts = await executeCasePipeline({
      specification: {
        skill: planned.skill,
        evalCase,
        evalsDir: planned.evalsDir,
        skillName: planned.evalsFile.skill_name,
      },
      execution: {
        model: options.model,
        judgeModel: options.judgeModel,
        agentDir: options.agentDir,
        compare: options.compare ?? false,
        extraSkillPaths: options.extraSkillPaths ?? [],
        contextMode: options.contextMode ?? "isolated",
        sandbox: options.sandbox ?? evalCase.sandbox ?? "none",
        observabilitySinks: options.observabilitySinks ?? [],
        createSession: options.createSession,
        judge: options.judge,
        runtime: options.runtime,
        caseTimeoutMs: options.caseTimeoutMs,
        signal: options.signal,
      },
      context: { outputDir: planned.outputDir, runId: plan.runId, iteration: plan.iteration },
    });
    const g = artifacts.grading.summary;
    options.onProgress?.({
      phase: "case-done",
      caseId,
      assertionsPassed: g.passed,
      assertionsTotal: g.total,
      passed: g.failed === 0 && g.total > 0,
    });
    return { kind: "done", artifacts };
  } catch (error) {
    // An interrupted case is not a case failure: the whole run is cancelled.
    if (options.signal?.aborted) {
      return { kind: "cancelled" };
    }
    const message = error instanceof Error ? error.message : String(error);
    options.onProgress?.({ phase: "case-done", caseId, passed: false, message });
    return { kind: "failed", message };
  }
}
