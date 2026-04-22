import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import { discoverEvalSkills, type DiscoveredEvalSkill } from "../evals/discover.js";
import { readEvalsJson } from "../evals/loader.js";
import { gradeEvalCase, type LlmJudgeFn } from "../evals/grade.js";
import { runEvalCase } from "../evals/run-case.js";
import type {
  EvalCase,
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
  /** Test-injection points. */
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
}

export interface CaseRunArtifacts {
  caseId: string;
  outputsDir: string;
  timingPath: string;
  gradingPath: string;
  timing: TimingJson;
  grading: GradingJson;
}

export interface SkillRunResult {
  skillName: string;
  skillDir: string;
  outputDir: string;
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
  createSession: PiSdkSessionFactory | undefined;
  judge: LlmJudgeFn | undefined;
}): Promise<CaseRunArtifacts> {
  const run = await runEvalCase({
    skill: args.skill,
    case: args.evalCase,
    evalsDir: args.evalsDir,
    model: args.model,
    createSession: args.createSession,
  });

  try {
    const grading = await gradeEvalCase({
      case: args.evalCase,
      workspaceDir: run.workspaceDir,
      assistantText: run.assistantText,
      judge: args.judge,
      judgeModel: args.judgeModel,
    });

    const caseSlug = sanitizeCaseId(args.evalCase.id);
    const caseDir = path.join(args.skillOutputDir, `eval-${caseSlug}`);
    const outputsDir = path.join(caseDir, "outputs");
    const timingPath = path.join(caseDir, "timing.json");
    const gradingPath = path.join(caseDir, "grading.json");

    await mkdir(outputsDir, { recursive: true });
    await cp(run.workspaceDir, outputsDir, { recursive: true, force: true });
    await writeFile(timingPath, `${JSON.stringify(run.timing, null, 2)}\n`, "utf-8");
    await writeFile(gradingPath, `${JSON.stringify(grading, null, 2)}\n`, "utf-8");

    return {
      caseId: String(args.evalCase.id),
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
