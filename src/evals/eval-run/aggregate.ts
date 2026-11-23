import { mkdir } from "node:fs/promises";
import path from "node:path";

import { writeJsonArtifact } from "../artifacts.js";

import type { CaseRunArtifacts, VariantRunArtifacts } from "../case-pipeline.js";
import type {
  BenchmarkAssertionComparison,
  BenchmarkCaseResult,
  BenchmarkJson,
  BenchmarkVariantArtifacts,
  BenchmarkVariantSummary,
  EvalCaseId,
  EvalRunVariant,
  GradingJson,
  TrialsAssertionResult,
  TrialsCaseResult,
  TrialsDelta,
  TrialsJson,
} from "../types.js";
import type { EvalRunSummary, SkillRunResult } from "./types.js";

export function aggregateEvalRun(skills: SkillRunResult[]): EvalRunSummary {
  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;
  let softFailedAssertions = 0;
  let selfJudgedCases = 0;
  let selfJudgeModel: { provider: string; id: string } | undefined;
  let failedTrials = 0;

  for (const skill of skills) {
    for (const caseArtifacts of skill.cases) {
      totalCases += 1;
      totalAssertions += caseArtifacts.grading.summary.total;
      passedAssertions += caseArtifacts.grading.summary.passed;
      failedAssertions += caseArtifacts.grading.summary.failed;
      softFailedAssertions += caseArtifacts.grading.summary.soft_failed ?? 0;
      const judge = caseArtifacts.grading.judge_model;
      const runner = caseArtifacts.timing.model;
      if (judge && runner && judge.provider === runner.provider && judge.id === runner.id) {
        selfJudgedCases += 1;
        selfJudgeModel = { provider: judge.provider, id: judge.id };
      }
      if (caseArtifacts.grading.summary.failed === 0 && caseArtifacts.grading.summary.total > 0) {
        passedCases += 1;
      } else if (caseArtifacts.grading.summary.failed > 0) {
        failedCases += 1;
      }
    }
    failedCases += skill.errors.length;
    totalCases += skill.errors.length;
    for (const trialCase of skill.trials?.cases ?? []) {
      failedTrials += trialCase.errored_trials + trialCase.failed_trials;
    }
  }

  return {
    totalCases,
    passedCases,
    failedCases,
    caseFailureRate: totalCases === 0 ? null : failedCases / totalCases,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    softFailedAssertions,
    assertionPassRate: totalAssertions === 0 ? null : passedAssertions / totalAssertions,
    selfJudgedCases,
    failedTrials,
    ...(selfJudgeModel ? { selfJudgeModel } : {}),
  };
}

export async function writeSkillBenchmark(args: {
  runId: string;
  skillName: string;
  outputDir: string;
  cases: CaseRunArtifacts[];
  errors: Array<{ caseId: string; message: string }>;
}): Promise<{ benchmarkPath: string; benchmark: BenchmarkJson }> {
  const benchmark = buildBenchmarkJson(args);
  const benchmarkPath = path.join(args.outputDir, "benchmark.json");
  await mkdir(args.outputDir, { recursive: true });
  await writeJsonArtifact(benchmarkPath, benchmark);
  return { benchmarkPath, benchmark };
}

/** One trial of one case: its artifacts, or `null` when the trial crashed before grading. */
export type TrialOutcome = CaseRunArtifacts | null;

export async function writeSkillTrials(args: {
  runId: string;
  skillName: string;
  outputDir: string;
  trials: number;
  cases: Array<{ caseId: string; outcomes: TrialOutcome[] }>;
  compare: boolean;
}): Promise<{ trialsPath: string; trials: TrialsJson }> {
  const trials: TrialsJson = {
    trials_version: "1",
    run_id: args.runId,
    skill_name: args.skillName,
    generated_at: new Date().toISOString(),
    trials: args.trials,
    cases: args.cases.map(summarizeCaseTrials),
    ...(args.compare ? { delta: summarizeTrialDeltas(args.trials, args.cases) } : {}),
  };
  const trialsPath = path.join(args.outputDir, "trials.json");
  await mkdir(args.outputDir, { recursive: true });
  await writeJsonArtifact(trialsPath, trials);
  return { trialsPath, trials };
}

function summarizeCaseTrials(entry: { caseId: string; outcomes: TrialOutcome[] }): TrialsCaseResult {
  const graded = entry.outcomes.filter((outcome): outcome is CaseRunArtifacts => outcome !== null);
  const assertions: TrialsAssertionResult[] = (graded[0]?.grading.assertion_results ?? []).map((first, index) => {
    const passedTrials = graded.filter((outcome) => outcome.grading.assertion_results[index]?.passed).length;
    return {
      index,
      text: first.text,
      passed_trials: passedTrials,
      graded_trials: graded.length,
      soft: first.soft ?? false,
      flaky: passedTrials > 0 && passedTrials < graded.length,
    };
  });
  return {
    case_id: entry.caseId,
    errored_trials: entry.outcomes.length - graded.length,
    failed_trials: graded.filter((outcome) => outcome.grading.summary.failed > 0).length,
    assertions,
  };
}

/**
 * The suite-wide with-minus-without delta of each trial, and whether the gap
 * is larger than its own movement between trials.
 */
function summarizeTrialDeltas(
  trials: number,
  cases: Array<{ caseId: string; outcomes: TrialOutcome[] }>,
): TrialsDelta {
  const perTrial: Array<number | null> = [];
  for (let trial = 0; trial < trials; trial++) {
    let withPassed = 0;
    let withTotal = 0;
    let withoutPassed = 0;
    let withoutTotal = 0;
    for (const entry of cases) {
      const variants = entry.outcomes[trial]?.variants;
      if (!variants?.with_skill || !variants.without_skill) continue;
      withPassed += variants.with_skill.grading.summary.passed;
      withTotal += variants.with_skill.grading.summary.total;
      withoutPassed += variants.without_skill.grading.summary.passed;
      withoutTotal += variants.without_skill.grading.summary.total;
    }
    perTrial.push(withTotal === 0 || withoutTotal === 0 ? null : withPassed / withTotal - withoutPassed / withoutTotal);
  }

  const deltas = perTrial.filter((delta): delta is number => delta !== null).sort((a, b) => a - b);
  if (deltas.length === 0) {
    return { per_trial: perTrial, median: null, min: null, max: null, spread: null, measurable: false };
  }
  const middle = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 === 1 ? deltas[middle]! : (deltas[middle - 1]! + deltas[middle]!) / 2;
  const min = deltas[0]!;
  const max = deltas[deltas.length - 1]!;
  const spread = max - min;
  return {
    per_trial: perTrial,
    median,
    min,
    max,
    spread,
    // One trial has no spread to compare against, so it measures nothing.
    measurable: deltas.length > 1 && Math.abs(median) > spread,
  };
}

function buildBenchmarkJson(args: {
  runId: string;
  skillName: string;
  outputDir: string;
  cases: CaseRunArtifacts[];
  errors: Array<{ caseId: string; message: string }>;
}): BenchmarkJson {
  const cases: BenchmarkCaseResult[] = [];
  const caseArtifacts: Record<EvalCaseId, Partial<Record<EvalRunVariant, BenchmarkVariantArtifacts>>> = {};
  let withPassed = 0;
  let withTotal = 0;
  let withoutPassed = 0;
  let withoutTotal = 0;
  let casesWithDelta = 0;
  let assertionsCompared = 0;
  let assertionsPassingInBoth = 0;

  for (const caseRun of args.cases) {
    const withSkill = caseRun.variants?.with_skill;
    const withoutSkill = caseRun.variants?.without_skill;
    if (!withSkill || !withoutSkill) continue;

    const withSummary = toBenchmarkVariantSummary(withSkill.grading);
    const withoutSummary = toBenchmarkVariantSummary(withoutSkill.grading);
    const delta =
      withSummary.pass_rate === null || withoutSummary.pass_rate === null
        ? null
        : withSummary.pass_rate - withoutSummary.pass_rate;

    if (delta !== null) casesWithDelta += 1;
    withPassed += withSummary.passed;
    withTotal += withSummary.total;
    withoutPassed += withoutSummary.passed;
    withoutTotal += withoutSummary.total;

    const assertions = compareAssertions(withSkill.grading, withoutSkill.grading);
    assertionsCompared += assertions.length;
    assertionsPassingInBoth += assertions.filter((row) => row.with_skill && row.without_skill).length;

    cases.push({
      case_id: caseRun.caseId,
      with_skill: withSummary,
      without_skill: withoutSummary,
      delta,
      assertions,
    });
    caseArtifacts[caseRun.caseId] = {
      with_skill: toBenchmarkVariantArtifacts(withSkill),
      without_skill: toBenchmarkVariantArtifacts(withoutSkill),
    };
  }

  const withSkillPassRate = withTotal === 0 ? null : withPassed / withTotal;
  const withoutSkillPassRate = withoutTotal === 0 ? null : withoutPassed / withoutTotal;

  return {
    benchmark_version: "1",
    run_id: args.runId,
    skill_name: args.skillName,
    generated_at: new Date().toISOString(),
    summary: {
      total_cases: args.cases.length + args.errors.length,
      errored_cases: args.errors.length,
      cases_with_delta: casesWithDelta,
      with_skill_pass_rate: withSkillPassRate,
      without_skill_pass_rate: withoutSkillPassRate,
      delta:
        withSkillPassRate === null || withoutSkillPassRate === null
          ? null
          : withSkillPassRate - withoutSkillPassRate,
      assertions_passing_in_both: assertionsPassingInBoth,
      assertions_compared: assertionsCompared,
    },
    cases,
    errors: args.errors.map((error) => ({
      case_id: error.caseId,
      message: error.message,
    })),
    metadata: {
      runtime: "pi",
      extensions: {
        artifact_root: args.outputDir,
        variants: ["with_skill", "without_skill"],
        case_artifacts: caseArtifacts,
      },
    },
  };
}

/**
 * Pair each assertion's verdict across the two variants. Both gradings come
 * from the same case, so they list the same assertions in the same order.
 */
function compareAssertions(withSkill: GradingJson, withoutSkill: GradingJson): BenchmarkAssertionComparison[] {
  const rows: BenchmarkAssertionComparison[] = [];
  const count = Math.min(withSkill.assertion_results.length, withoutSkill.assertion_results.length);
  for (let index = 0; index < count; index++) {
    const withResult = withSkill.assertion_results[index]!;
    const withoutResult = withoutSkill.assertion_results[index]!;
    rows.push({
      index,
      text: withResult.text,
      with_skill: withResult.passed,
      without_skill: withoutResult.passed,
      discriminates: withResult.passed !== withoutResult.passed,
    });
  }
  return rows;
}

function toBenchmarkVariantSummary(artifacts: GradingJson): BenchmarkVariantSummary {
  return {
    passed: artifacts.summary.passed,
    failed: artifacts.summary.failed,
    total: artifacts.summary.total,
    pass_rate: artifacts.summary.pass_rate,
  };
}

function toBenchmarkVariantArtifacts(artifacts: VariantRunArtifacts): BenchmarkVariantArtifacts {
  return {
    assistant_path: artifacts.assistantPath,
    outputs_dir: artifacts.outputsDir,
    timing_path: artifacts.timingPath,
    grading_path: artifacts.gradingPath,
    trace_path: artifacts.tracePath,
    tool_summary_path: artifacts.toolSummaryPath,
    context_manifest_path: artifacts.contextManifestPath,
    total_tokens: artifacts.timing.total_tokens,
    duration_ms: artifacts.timing.duration_ms,
    model: artifacts.timing.model,
    thinking_level: artifacts.timing.thinking_level,
    estimated_cost_usd: artifacts.timing.estimated_cost_usd,
    context_window_tokens: artifacts.timing.context_window_tokens,
    context_window_used_percent: artifacts.timing.context_window_used_percent,
    tool_call_count: artifacts.toolSummary.tool_call_count,
    tool_error_count: artifacts.toolSummary.tool_error_count,
    mcp_tool_call_count: artifacts.toolSummary.mcp_tool_call_count,
    attached_skills: artifacts.contextManifest.attached_skills,
    mcp_tools: artifacts.contextManifest.mcp_tools,
  };
}
