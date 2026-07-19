import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CaseRunArtifacts, VariantRunArtifacts } from "../case-pipeline.js";
import type {
  BenchmarkCaseResult,
  BenchmarkJson,
  BenchmarkVariantArtifacts,
  BenchmarkVariantSummary,
  EvalCaseId,
  EvalRunVariant,
  GradingJson,
} from "../types.js";
import type { EvalRunSummary, SkillRunResult } from "./types.js";

export function aggregateEvalRun(skills: SkillRunResult[]): EvalRunSummary {
  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  for (const skill of skills) {
    for (const caseArtifacts of skill.cases) {
      totalCases += 1;
      totalAssertions += caseArtifacts.grading.summary.total;
      passedAssertions += caseArtifacts.grading.summary.passed;
      failedAssertions += caseArtifacts.grading.summary.failed;
      if (caseArtifacts.grading.summary.failed === 0 && caseArtifacts.grading.summary.total > 0) {
        passedCases += 1;
      } else if (caseArtifacts.grading.summary.failed > 0) {
        failedCases += 1;
      }
    }
    failedCases += skill.errors.length;
    totalCases += skill.errors.length;
  }

  return {
    totalCases,
    passedCases,
    failedCases,
    caseFailureRate: totalCases === 0 ? null : failedCases / totalCases,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    assertionPassRate: totalAssertions === 0 ? null : passedAssertions / totalAssertions,
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
  await writeFile(benchmarkPath, `${JSON.stringify(benchmark, null, 2)}\n`, "utf-8");
  return { benchmarkPath, benchmark };
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

    cases.push({
      case_id: caseRun.caseId,
      with_skill: withSummary,
      without_skill: withoutSummary,
      delta,
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
