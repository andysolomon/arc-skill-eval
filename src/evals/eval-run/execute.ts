import {
  collectObservabilityExportFailures,
  executeCasePipeline,
} from "../case-pipeline.js";
import type { EvalRunOptions, EvalRunPlan, SkillRunResult } from "./types.js";
import { writeSkillBenchmark } from "./aggregate.js";

/** Run every planned case through the case pipeline and optionally write per-skill benchmarks. */
export async function executeEvalRun(plan: EvalRunPlan, options: EvalRunOptions): Promise<SkillRunResult[]> {
  const skillResults: SkillRunResult[] = [];

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
      options.onProgress?.({ phase: "case-start", caseId: String(evalCase.id) });
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
          },
          context: { outputDir: planned.outputDir, runId: plan.runId, iteration: plan.iteration },
        });
        result.cases.push(artifacts);
        result.observabilityExportFailures.push(...collectObservabilityExportFailures(artifacts));
        const g = artifacts.grading.summary;
        options.onProgress?.({
          phase: "case-done",
          caseId: String(evalCase.id),
          assertionsPassed: g.passed,
          assertionsTotal: g.total,
          passed: g.failed === 0 && g.total > 0,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ caseId: String(evalCase.id), message });
        options.onProgress?.({ phase: "case-done", caseId: String(evalCase.id), passed: false, message });
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
