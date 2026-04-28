import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import { discoverEvalSkills, type DiscoveredEvalSkill } from "../evals/discover.js";
import { readEvalsJson } from "../evals/loader.js";
import { gradeEvalCase, type LlmJudgeFn } from "../evals/grade.js";
import { runEvalCase } from "../evals/run-case.js";
import type {
  BenchmarkCaseResult,
  BenchmarkJson,
  BenchmarkVariantArtifacts,
  BenchmarkVariantSummary,
  EvalCase,
  EvalCaseId,
  EvalRunVariant,
  EvalsJsonFile,
  GradingJson,
  TimingJson,
} from "../evals/types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";

export interface RunEvalsCommandOptions {
  /** Absolute path to a skill dir (contains `evals/evals.json`) OR a repo to scan. */
  input: string;
  /** Skill-name allowlist. Empty = all. */
  skillNames?: string[];
  /** Case-id allowlist. Empty = all. */
  caseIds?: string[];
  /**
   * Where to write per-case artifacts. Defaults to
   * `<skillDir>/evals-runs/<runId>/` per skill.
   */
  outputDirOverride?: string;
  /** Model pin for the runner (not the judge). */
  model?: ModelSelection;
  /** Model pin for the LLM-judge. Falls back to grader default. */
  judgeModel?: ModelSelection;
  /** Fixed runId; default is an ISO timestamp. */
  runId?: string;
  /** Opt into with_skill vs without_skill variant comparison. */
  compare?: boolean;
  /** Test-injection points. */
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
}

export interface VariantRunArtifacts {
  variant: EvalRunVariant;
  outputsDir: string;
  timingPath: string;
  gradingPath: string;
  timing: TimingJson;
  grading: GradingJson;
}

export interface CaseRunComparison {
  withSkillPassRate: number | null;
  withoutSkillPassRate: number | null;
  /** `null` when either variant has no assertion pass rate. */
  delta: number | null;
}

export interface CaseRunArtifacts extends VariantRunArtifacts {
  caseId: string;
  variants?: Partial<Record<EvalRunVariant, VariantRunArtifacts>>;
  comparison?: CaseRunComparison;
}

export interface SkillRunResult {
  skillName: string;
  skillDir: string;
  outputDir: string;
  benchmarkPath?: string;
  benchmark?: BenchmarkJson;
  cases: CaseRunArtifacts[];
  errors: Array<{ caseId: string; message: string }>;
}

export interface RunEvalsCommandSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  /** 0..1. `null` when `totalCases === 0`. */
  caseFailureRate: number | null;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  /** 0..1. `null` when `totalAssertions === 0`. */
  assertionPassRate: number | null;
}

export interface RunEvalsCommandResult {
  runId: string;
  skills: SkillRunResult[];
  summary: RunEvalsCommandSummary;
}

/**
 * Discover skills at `input`, load each `evals/evals.json`, run every
 * selected case through the Pi-backed runner, grade the outputs, and
 * write per-case `outputs/` + `timing.json` + `grading.json`. The
 * command never throws on per-case failures — they are recorded in
 * `errors[]` so a partial run still produces artifacts for the cases
 * that succeeded.
 */
export async function runEvalsCommand(
  options: RunEvalsCommandOptions,
): Promise<RunEvalsCommandResult> {
  const runId = options.runId ?? buildRunId();
  const discovered = await discoverInput(options.input);
  const selectedSkills = filterSkills(discovered, options.skillNames);

  const skillResults: SkillRunResult[] = [];

  for (const skill of selectedSkills) {
    const evalsFile = await readEvalsJson(skill.evalsJsonPath);
    const selectedCases = filterCases(evalsFile, options.caseIds);
    const skillOutputDir = resolveSkillOutputDir({
      skill,
      runId,
      outputDirOverride: options.outputDirOverride,
    });

    const result: SkillRunResult = {
      skillName: evalsFile.skill_name,
      skillDir: skill.skillDir,
      outputDir: skillOutputDir,
      cases: [],
      errors: [],
    };

    for (const evalCase of selectedCases) {
      try {
        const artifacts = await runOneCase({
          skill,
          evalCase,
          evalsDir: path.dirname(skill.evalsJsonPath),
          skillOutputDir,
          model: options.model,
          judgeModel: options.judgeModel,
          compare: options.compare ?? false,
          createSession: options.createSession,
          judge: options.judge,
        });
        result.cases.push(artifacts);
      } catch (error) {
        result.errors.push({
          caseId: String(evalCase.id),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (options.compare) {
      const benchmark = buildBenchmarkJson({
        runId,
        skillName: result.skillName,
        outputDir: skillOutputDir,
        cases: result.cases,
        errors: result.errors,
      });
      const benchmarkPath = path.join(skillOutputDir, "benchmark.json");
      await mkdir(skillOutputDir, { recursive: true });
      await writeFile(benchmarkPath, `${JSON.stringify(benchmark, null, 2)}\n`, "utf-8");
      result.benchmarkPath = benchmarkPath;
      result.benchmark = benchmark;
    }

    skillResults.push(result);
  }

  const summary = aggregateSummary(skillResults);
  return { runId, skills: skillResults, summary };
}

async function runOneCase(args: {
  skill: DiscoveredEvalSkill;
  evalCase: EvalCase;
  evalsDir: string;
  skillOutputDir: string;
  model: ModelSelection | undefined;
  judgeModel: ModelSelection | undefined;
  compare: boolean;
  createSession: PiSdkSessionFactory | undefined;
  judge: LlmJudgeFn | undefined;
}): Promise<CaseRunArtifacts> {
  const caseSlug = sanitizeCaseId(args.evalCase.id);
  const caseDir = path.join(args.skillOutputDir, `eval-${caseSlug}`);

  if (!args.compare) {
    const single = await runOneCaseVariant({
      ...args,
      variant: "with_skill",
      variantDir: caseDir,
      attachSkill: true,
    });

    return {
      caseId: String(args.evalCase.id),
      ...single,
    };
  }

  const withSkill = await runOneCaseVariant({
    ...args,
    variant: "with_skill",
    variantDir: path.join(caseDir, "with_skill"),
    attachSkill: true,
  });
  const withoutSkill = await runOneCaseVariant({
    ...args,
    variant: "without_skill",
    variantDir: path.join(caseDir, "without_skill"),
    attachSkill: false,
  });

  return {
    caseId: String(args.evalCase.id),
    ...withSkill,
    variants: {
      with_skill: withSkill,
      without_skill: withoutSkill,
    },
    comparison: compareVariantPassRates(withSkill.grading, withoutSkill.grading),
  };
}

async function runOneCaseVariant(args: {
  skill: DiscoveredEvalSkill;
  evalCase: EvalCase;
  evalsDir: string;
  model: ModelSelection | undefined;
  judgeModel: ModelSelection | undefined;
  createSession: PiSdkSessionFactory | undefined;
  judge: LlmJudgeFn | undefined;
  variant: EvalRunVariant;
  variantDir: string;
  attachSkill: boolean;
}): Promise<VariantRunArtifacts> {
  const run = await runEvalCase({
    skill: args.skill,
    case: args.evalCase,
    evalsDir: args.evalsDir,
    model: args.model,
    createSession: args.createSession,
    attachSkill: args.attachSkill,
  });

  try {
    const grading = await gradeEvalCase({
      case: args.evalCase,
      workspaceDir: run.workspaceDir,
      assistantText: run.assistantText,
      judge: args.judge,
      judgeModel: args.judgeModel,
    });

    const outputsDir = path.join(args.variantDir, "outputs");
    const timingPath = path.join(args.variantDir, "timing.json");
    const gradingPath = path.join(args.variantDir, "grading.json");

    await mkdir(outputsDir, { recursive: true });
    await cp(run.workspaceDir, outputsDir, { recursive: true, force: true });
    await writeFile(timingPath, `${JSON.stringify(run.timing, null, 2)}\n`, "utf-8");
    await writeFile(gradingPath, `${JSON.stringify(grading, null, 2)}\n`, "utf-8");

    return {
      variant: args.variant,
      outputsDir,
      timingPath,
      gradingPath,
      timing: run.timing,
      grading,
    };
  } finally {
    await run.cleanup().catch(() => undefined);
  }
}

function compareVariantPassRates(withSkill: GradingJson, withoutSkill: GradingJson): CaseRunComparison {
  const withSkillPassRate = withSkill.summary.pass_rate;
  const withoutSkillPassRate = withoutSkill.summary.pass_rate;
  const delta = withSkillPassRate === null || withoutSkillPassRate === null
    ? null
    : withSkillPassRate - withoutSkillPassRate;

  return { withSkillPassRate, withoutSkillPassRate, delta };
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
    const delta = withSummary.pass_rate === null || withoutSummary.pass_rate === null
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
      delta: withSkillPassRate === null || withoutSkillPassRate === null
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
    outputs_dir: artifacts.outputsDir,
    timing_path: artifacts.timingPath,
    grading_path: artifacts.gradingPath,
    total_tokens: artifacts.timing.total_tokens,
    duration_ms: artifacts.timing.duration_ms,
  };
}

async function discoverInput(input: string): Promise<DiscoveredEvalSkill[]> {
  const absolute = path.resolve(input);
  const directEvals = path.join(absolute, "evals", "evals.json");

  try {
    const directCheck = await import("node:fs/promises").then((fs) => fs.stat(directEvals));
    if (directCheck.isFile()) {
      return [
        {
          skillDir: absolute,
          relativeSkillDir: ".",
          skillDefinitionPath: path.join(absolute, "SKILL.md"),
          evalsJsonPath: directEvals,
        },
      ];
    }
  } catch {
    // fall through to repo-wide discovery
  }

  return await discoverEvalSkills(absolute);
}

function filterSkills(
  discovered: DiscoveredEvalSkill[],
  names: string[] | undefined,
): DiscoveredEvalSkill[] {
  if (!names || names.length === 0) return discovered;
  const allow = new Set(names);
  return discovered.filter((skill) => allow.has(path.basename(skill.skillDir)));
}

function filterCases(file: EvalsJsonFile, ids: string[] | undefined): EvalCase[] {
  if (!ids || ids.length === 0) return file.evals;
  const allow = new Set(ids);
  return file.evals.filter((evalCase) => allow.has(String(evalCase.id)));
}

function resolveSkillOutputDir(args: {
  skill: DiscoveredEvalSkill;
  runId: string;
  outputDirOverride: string | undefined;
}): string {
  if (args.outputDirOverride) {
    return path.resolve(args.outputDirOverride, path.basename(args.skill.skillDir), args.runId);
  }
  return path.join(args.skill.skillDir, "evals-runs", args.runId);
}

function aggregateSummary(skills: SkillRunResult[]): RunEvalsCommandSummary {
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

function buildRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

function sanitizeCaseId(id: string | number): string {
  return String(id).replace(/[^A-Za-z0-9_.-]/g, "-");
}
