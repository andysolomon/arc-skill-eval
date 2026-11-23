import type { ModelSelection, SandboxMode } from "../../contracts/types.js";
import type { ObservabilitySink } from "../../observability/types.js";
import type { PiSdkSessionFactory } from "../../pi/sdk-runner.js";
import type { AgentRuntime } from "../../runtime/types.js";
import type { DiscoveredEvalSkill } from "../discover.js";
import type { CaseRunArtifacts, CaseRunComparison, VariantRunArtifacts } from "../case-pipeline.js";
import type { LlmJudgeFn } from "../grade.js";
import type { BenchmarkJson, EvalCase, EvalRunVariant, EvalsJsonFile, TrialsJson } from "../types.js";
import type { EvalContextMode } from "../../observability/types.js";

export class EvalRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalRunError";
  }
}

/** The run's `signal` aborted. In-flight case resources were released before this was thrown. */
export class EvalRunCancelledError extends Error {
  constructor(message = "Eval run cancelled.") {
    super(message);
    this.name = "EvalRunCancelledError";
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
  /** Per-case agent time limit; a case that exceeds it is stopped and recorded as an error. */
  caseTimeoutMs?: number;
  /**
   * How many cases run at once, across all selected skills. Defaults to 1.
   * Results keep evals.json order whatever order cases finish in.
   */
  concurrency?: number;
  /**
   * How many times each case runs. Defaults to 1. Above 1, the first trial
   * writes the usual artifacts, later trials write under `trial-<k>/` in the
   * run directory, and `trials.json` reports what held across them. A hard
   * failure in any trial fails the run.
   */
  trials?: number;
  /**
   * Write `evals/sync.json` for each skill whose whole suite passed (see
   * `sync-record.ts`). A failing, erroring or `caseIds`-filtered run is never
   * stamped; the reason is reported in {@link SkillRunResult.sync}.
   */
  stamp?: boolean;
  /** With {@link stamp}: a soft assertion miss also blocks the stamp, as `--strict` fails the run. */
  strict?: boolean;
  /**
   * Cancels the run: every in-flight case is interrupted (agent stopped,
   * workspace removed), no new case starts, and once all of them have been
   * released the run rejects with {@link EvalRunCancelledError}.
   */
  signal?: AbortSignal;
  onProgress?: (ev: {
    phase: "case-start" | "assertion" | "case-done";
    caseId: string;
    /** One-based trial number; absent when the run has a single trial. */
    trial?: number;
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
  /** Present when the run used more than one trial. */
  trialsPath?: string;
  trials?: TrialsJson;
  /** Present when the run asked for a stamp: whether the sync record was written, and why not. */
  sync?: { stamped: true; path: string } | { stamped: false; reason: string };
}

export interface EvalRunSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  caseFailureRate: number | null;
  totalAssertions: number;
  passedAssertions: number;
  /** Hard assertion failures — these fail the run by default. */
  failedAssertions: number;
  /**
   * Soft assertion misses (declared `mustPass: false` or `info`/`warn`
   * severity). Recorded but non-failing unless the run is invoked with
   * `--strict`.
   */
  softFailedAssertions: number;
  assertionPassRate: number | null;
  /**
   * Cases whose judge assertions were graded by the same model that ran the
   * case. A model grading its own output is a known bias; `--judge-model`
   * with a different model avoids it.
   */
  selfJudgedCases: number;
  /**
   * With `--trials`: how many trials, of any case, had a hard assertion
   * failure or crashed. Zero for a single-trial run. Any failed trial fails
   * the run, so a suite that only passes sometimes does not pass.
   */
  failedTrials: number;
  /** The model behind {@link selfJudgedCases}, when there is one. */
  selfJudgeModel?: { provider: string; id: string };
}

export interface EvalRunResult {
  runId: string;
  iteration?: string;
  skills: SkillRunResult[];
  summary: EvalRunSummary;
}

export type { CaseRunArtifacts, CaseRunComparison, VariantRunArtifacts };
