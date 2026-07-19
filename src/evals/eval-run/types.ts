import type { ModelSelection, SandboxMode } from "../../contracts/types.js";
import type { ObservabilitySink } from "../../observability/types.js";
import type { PiSdkSessionFactory } from "../../pi/sdk-runner.js";
import type { AgentRuntime } from "../../runtime/types.js";
import type { DiscoveredEvalSkill } from "../discover.js";
import type { CaseRunArtifacts, CaseRunComparison, VariantRunArtifacts } from "../case-pipeline.js";
import type { LlmJudgeFn } from "../grade.js";
import type { BenchmarkJson, EvalCase, EvalRunVariant, EvalsJsonFile } from "../types.js";
import type { EvalContextMode } from "../../observability/types.js";

export class EvalRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalRunError";
  }
}

/** Options for a multi-skill eval run (CLI, TUI, and programmatic callers). */
export interface EvalRunOptions {
  input: string;
  skillNames?: string[];
  caseIds?: string[];
  outputDirOverride?: string;
  model?: ModelSelection;
  judgeModel?: ModelSelection;
  agentDir?: string;
  runId?: string;
  iteration?: string;
  compare?: boolean;
  extraSkillPaths?: string[];
  contextMode?: EvalContextMode;
  sandbox?: SandboxMode;
  observabilitySinks?: ObservabilitySink[];
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
  runtime?: AgentRuntime;
  onProgress?: (ev: {
    phase: "case-start" | "assertion" | "case-done";
    caseId: string;
    assertionsPassed?: number;
    assertionsTotal?: number;
    passed?: boolean;
    message?: string;
  }) => void;
}

/** One skill's resolved cases and artifact root after planning. */
export interface PlannedSkillRun {
  skill: DiscoveredEvalSkill;
  evalsFile: EvalsJsonFile;
  evalsDir: string;
  cases: EvalCase[];
  outputDir: string;
}

/** Prepared run identity and per-skill work units — no cases execute during planning. */
export interface EvalRunPlan {
  runId: string;
  iteration?: string;
  skills: PlannedSkillRun[];
}

export interface SkillRunResult {
  skillName: string;
  skillDir: string;
  outputDir: string;
  iteration?: string;
  benchmarkPath?: string;
  benchmark?: BenchmarkJson;
  cases: CaseRunArtifacts[];
  errors: Array<{ caseId: string; message: string }>;
  observabilityExportFailures: Array<{ caseId: string; variant: EvalRunVariant; sink: string; message: string }>;
}

export interface EvalRunSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  caseFailureRate: number | null;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  assertionPassRate: number | null;
}

export interface EvalRunResult {
  runId: string;
  iteration?: string;
  skills: SkillRunResult[];
  summary: EvalRunSummary;
}

export type { CaseRunArtifacts, CaseRunComparison, VariantRunArtifacts };
