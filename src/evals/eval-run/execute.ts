import path from "node:path";

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
import { writeSkillBenchmark, writeSkillTrials, type TrialOutcome } from "./aggregate.js";

type CaseOutcome =
  | { kind: "done"; artifacts: CaseRunArtifacts }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

interface CaseWork {
  planned: PlannedSkillRun;
  evalCase: EvalCase;
  trial: number;
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

  const trials = options.trials ?? 1;
  if (!Number.isInteger(trials) || trials < 1) {
    throw new EvalRunError(`trials must be a positive whole number, got ${trials}.`);
  }

  const work: CaseWork[] = plan.skills.flatMap((planned) =>
    planned.cases.flatMap((evalCase) =>
      Array.from({ length: trials }, (_, index) => ({ planned, evalCase, trial: index + 1 })),
    ),
  );

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

    const trialOutcomes: Array<{ caseId: string; outcomes: TrialOutcome[] }> = [];
    for (const evalCase of planned.cases) {
      const caseOutcomes = outcomes.slice(next, next + trials);
      next += trials;

      const outcome = caseOutcomes[0]!;
      if (outcome.kind === "done") {
        result.cases.push(outcome.artifacts);
        result.observabilityExportFailures.push(...collectObservabilityExportFailures(outcome.artifacts));
      } else if (outcome.kind === "failed") {
        result.errors.push({ caseId: String(evalCase.id), message: outcome.message });
      }

      trialOutcomes.push({
        caseId: String(evalCase.id),
        outcomes: caseOutcomes.map((entry) => (entry.kind === "done" ? entry.artifacts : null)),
      });
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

    if (trials > 1) {
      const { trialsPath, trials: trialsJson } = await writeSkillTrials({
        runId: plan.runId,
        skillName: result.skillName,
        outputDir: planned.outputDir,
        trials,
        cases: trialOutcomes,
        compare: options.compare ?? false,
      });
      result.trialsPath = trialsPath;
      result.trials = trialsJson;
    }

    skillResults.push(result);
  }

  return skillResults;
}

async function runCase({ planned, evalCase, trial }: CaseWork, plan: EvalRunPlan, options: EvalRunOptions): Promise<CaseOutcome> {
  if (options.signal?.aborted) {
    return { kind: "cancelled" };
  }
  const caseId = String(evalCase.id);
  const trialTag = (options.trials ?? 1) > 1 ? { trial } : {};
  const outputDir = trial === 1 ? planned.outputDir : path.join(planned.outputDir, `trial-${trial}`);
  options.onProgress?.({ phase: "case-start", caseId, ...trialTag });
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
        observabilitySinks: trial === 1 ? (options.observabilitySinks ?? []) : [],
        createSession: options.createSession,
        judge: options.judge,
        runtime: options.runtime,
        caseTimeoutMs: options.caseTimeoutMs,
        signal: options.signal,
      },
      context: { outputDir, runId: plan.runId, iteration: plan.iteration },
    });
    const g = artifacts.grading.summary;
    options.onProgress?.({
      phase: "case-done",
      caseId,
      ...trialTag,
      assertionsPassed: g.passed,
      assertionsTotal: g.total,
      passed: g.failed === 0 && g.total > 0,
    });
    return { kind: "done", artifacts };
  } catch (error) {
    if (options.signal?.aborted) {
      return { kind: "cancelled" };
    }
    const message = error instanceof Error ? error.message : String(error);
    options.onProgress?.({ phase: "case-done", caseId, ...trialTag, passed: false, message });
    return { kind: "failed", message };
  }
}
