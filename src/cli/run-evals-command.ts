import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModelSelection, SandboxMode } from "../contracts/types.js";
import { discoverEvalSkills, type DiscoveredEvalSkill } from "../evals/discover.js";
import { readEvalsJson } from "../evals/loader.js";
import { DEFAULT_JUDGE_MODEL, gradeEvalCase, type LlmJudgeFn } from "../evals/grade.js";
import { runEvalCase } from "../evals/run-case.js";
import type {
  BenchmarkCaseResult,
  BenchmarkJson,
  BenchmarkVariantArtifacts,
  BenchmarkVariantSummary,
  EvalAssertion,
  EvalCase,
  EvalCaseId,
  EvalRunVariant,
  EvalsJsonFile,
  GradingJson,
  TimingJson,
} from "../evals/types.js";
import type {
  ContextManifestJson,
  EvalContextMode,
  ObservabilityCaseVariantPayload,
  ObservabilityExportResult,
  ObservabilitySink,
  ToolSummaryJson,
} from "../observability/types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import type { AgentRuntime } from "../runtime/types.js";
import { CliCommandError } from "./types.js";

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
  /** Eval-owned Pi agent directory for model registry/settings/auth. */
  agentDir?: string;
  /** Fixed runId; default is an ISO timestamp. */
  runId?: string;
  /** Optional iteration bucket, e.g. `1` -> `iteration-1`. */
  iteration?: string;
  /** Opt into with_skill vs without_skill variant comparison. */
  compare?: boolean;
  /** Explicit extra skill paths to load as distractor/conflict context. */
  extraSkillPaths?: string[];
  /** Context resource mode. Defaults to isolated. */
  contextMode?: EvalContextMode;
  /**
   * Sandbox override applied to every selected case. Takes precedence
   * over each case's own `sandbox` field. Defaults to `"none"`.
   */
  sandbox?: SandboxMode;
  /** Optional observability exporters. Omitted by default, so runs remain local-only. */
  observabilitySinks?: ObservabilitySink[];
  /** Test-injection points. */
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
  /** Agent runtime executing every case (programmatic; defaults to Pi SDK). */
  runtime?: AgentRuntime;
  /**
   * Optional per-case progress callback. Purely additive — used by the in-TUI
   * run console (`browse` → `r`/`R`) to animate live progress without scraping
   * stdout. The `assertion` phase is optional and only fires if a grader emits it.
   */
  onProgress?: (ev: {
    phase: "case-start" | "assertion" | "case-done";
    caseId: string;
    assertionsPassed?: number;
    assertionsTotal?: number;
    passed?: boolean;
    message?: string;
  }) => void;
}

export interface VariantRunArtifacts {
  variant: EvalRunVariant;
  assistantPath: string;
  outputsDir: string;
  timingPath: string;
  gradingPath: string;
  tracePath: string;
  toolSummaryPath: string;
  contextManifestPath: string;
  timing: TimingJson;
  grading: GradingJson;
  toolSummary: ToolSummaryJson;
  contextManifest: ContextManifestJson;
  observabilityExports: ObservabilityExportResult[];
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
  iteration?: string;
  benchmarkPath?: string;
  benchmark?: BenchmarkJson;
  cases: CaseRunArtifacts[];
  errors: Array<{ caseId: string; message: string }>;
  observabilityExportFailures: Array<{ caseId: string; variant: EvalRunVariant; sink: string; message: string }>;
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
  iteration?: string;
  skills: SkillRunResult[];
  summary: RunEvalsCommandSummary;
}

/**
 * Discover skills at `input`, load each `evals/evals.json`, run every
 * selected case through the Pi-backed runner, grade the outputs, and
 * write per-case `assistant.md` + `outputs/` + `timing.json` +
 * `grading.json` + observability artifacts. The
 * command never throws on per-case failures — they are recorded in
 * `errors[]` so a partial run still produces artifacts for the cases
 * that succeeded.
 */
export async function runEvalsCommand(
  options: RunEvalsCommandOptions,
): Promise<RunEvalsCommandResult> {
  const runId = options.runId ?? buildRunId();
  const iteration = normalizeIteration(options.iteration);
  const discovered = await discoverInput(options.input);
  const selectedSkills = filterSkills(discovered, options.skillNames);

  const loadedSkills = await Promise.all(selectedSkills.map(async (skill) => ({
    skill,
    evalsFile: await readEvalsJson(skill.evalsJsonPath),
  })));

  await preflightAgentDirRuntime({
    agentDir: options.agentDir,
    model: options.model,
    judgeModel: options.judgeModel,
    createSession: options.createSession,
    judge: options.judge,
    evalsFiles: loadedSkills.map((item) => item.evalsFile),
    caseIds: options.caseIds,
  });

  const skillResults: SkillRunResult[] = [];

  for (const { skill, evalsFile } of loadedSkills) {
    const selectedCases = filterCases(evalsFile, options.caseIds);
    const skillOutputDir = resolveSkillOutputDir({
      skill,
      runId,
      iteration,
      outputDirOverride: options.outputDirOverride,
    });

    const result: SkillRunResult = {
      skillName: evalsFile.skill_name,
      skillDir: skill.skillDir,
      outputDir: skillOutputDir,
      iteration,
      cases: [],
      errors: [],
      observabilityExportFailures: [],
    };

    for (const evalCase of selectedCases) {
      options.onProgress?.({ phase: "case-start", caseId: String(evalCase.id) });
      try {
        const artifacts = await runOneCase({
          skill,
          evalCase,
          evalsDir: path.dirname(skill.evalsJsonPath),
          skillOutputDir,
          model: options.model,
          judgeModel: options.judgeModel,
          agentDir: options.agentDir,
          compare: options.compare ?? false,
          extraSkillPaths: options.extraSkillPaths ?? [],
          contextMode: options.contextMode ?? "isolated",
          // Precedence: CLI override > per-case field > default.
          sandbox: options.sandbox ?? evalCase.sandbox ?? "none",
          observabilitySinks: options.observabilitySinks ?? [],
          runId,
          iteration,
          skillName: evalsFile.skill_name,
          createSession: options.createSession,
          judge: options.judge,
          runtime: options.runtime,
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
  return { runId, iteration, skills: skillResults, summary };
}

interface AgentDirPreflightOptions {
  agentDir?: string;
  model?: ModelSelection;
  judgeModel?: ModelSelection;
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
  evalsFiles: EvalsJsonFile[];
  caseIds?: string[];
}

interface RuntimeSettingsJson {
  defaultProvider?: unknown;
  defaultModel?: unknown;
}

interface RuntimeModelsJson {
  providers?: unknown;
}

async function preflightAgentDirRuntime(options: AgentDirPreflightOptions): Promise<void> {
  if (!options.agentDir) return;
  if (options.createSession && (options.judge || !selectedCasesNeedJudge(options.evalsFiles, options.caseIds))) return;

  const agentDir = path.resolve(options.agentDir);
  const issues: string[] = [];
  const modelsPath = path.join(agentDir, "models.json");
  const settingsPath = path.join(agentDir, "settings.json");
  const modelsJson = await readJsonFile<RuntimeModelsJson>(modelsPath);
  const settingsJson = await readJsonFile<RuntimeSettingsJson>(settingsPath);

  if (!modelsJson.ok) issues.push(`missing or unreadable models.json at ${modelsPath}`);
  if (!options.model && !settingsJson.ok) issues.push(`missing or unreadable settings.json at ${settingsPath}`);

  if (modelsJson.ok) {
    if (!isRecord(modelsJson.value.providers)) {
      issues.push(`models.json at ${modelsPath} must contain a providers object`);
    } else {
      const runnerSelection = options.model ?? selectionFromSettings(settingsJson.ok ? settingsJson.value : undefined);
      if (!options.createSession && runnerSelection) {
        validateProviderSelection({ selection: runnerSelection, providers: modelsJson.value.providers, issues, role: "runner" });
      }

      if (!options.judge && selectedCasesNeedJudge(options.evalsFiles, options.caseIds)) {
        // Mirrors the grading-time precedence: --judge-model > runner model
        // > last-resort default.
        const judgeSelection = options.judgeModel ?? runnerSelection ?? DEFAULT_JUDGE_MODEL;
        validateProviderSelection({ selection: judgeSelection, providers: modelsJson.value.providers, issues, role: "judge" });
      }
    }
  }

  if (!options.model && settingsJson.ok && !selectionFromSettings(settingsJson.value)) {
    issues.push(`settings.json at ${settingsPath} must define defaultProvider and defaultModel, or pass --model <provider/model>`);
  }

  if (issues.length === 0) return;

  throw new CliCommandError(
    [
      `Incomplete eval runtime for --agent-dir ${agentDir}.`,
      ...issues.map((issue) => `- ${issue}`),
      "",
      "Initialize a tiny eval runtime with:",
      `arc-skill-eval init-runtime ${agentDir} --provider <provider> --model <model>`,
      "",
      "Then set any required provider API key environment variable, pass --model/--judge-model for configured providers, or omit --agent-dir to use your default Pi agent directory (~/.pi/agent).",
    ].join("\n"),
  );
}

function selectionFromSettings(settings: RuntimeSettingsJson | undefined): ModelSelection | undefined {
  if (!settings) return undefined;
  if (typeof settings.defaultProvider !== "string" || typeof settings.defaultModel !== "string") return undefined;
  return { provider: settings.defaultProvider, id: settings.defaultModel };
}

function validateProviderSelection(options: {
  selection: ModelSelection;
  providers: Record<string, unknown>;
  issues: string[];
  role: "runner" | "judge";
}): void {
  const providerConfig = options.providers[options.selection.provider];
  if (!isRecord(providerConfig)) {
    options.issues.push(`${options.role} model provider '${options.selection.provider}' is not configured in models.json`);
    return;
  }

  const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
  const hasModel = models.some((model) => isRecord(model) && model.id === options.selection.id);
  if (!hasModel) {
    options.issues.push(`${options.role} model '${options.selection.provider}/${options.selection.id}' is not listed in models.json`);
  }

  if (typeof providerConfig.apiKey === "string" && looksLikeRequiredEnvVar(providerConfig.apiKey) && !process.env[providerConfig.apiKey]) {
    options.issues.push(`${options.role} model provider '${options.selection.provider}' requires environment variable ${providerConfig.apiKey}`);
  }
}

function selectedCasesNeedJudge(evalsFiles: EvalsJsonFile[], caseIds: string[] | undefined): boolean {
  return evalsFiles.some((evalsFile) => filterCases(evalsFile, caseIds).some((evalCase) => (evalCase.assertions ?? []).some(isJudgeAssertion)));
}

function isJudgeAssertion(assertion: EvalAssertion): boolean {
  return typeof assertion === "string" || (isRecord(assertion) && assertion.method === "judge");
}

function looksLikeRequiredEnvVar(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(value) && /(?:API|KEY|TOKEN|SECRET|AUTH|CREDENTIAL)/.test(value);
}

async function readJsonFile<T>(file: string): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(file, "utf8")) as T };
  } catch (error) {
    return { ok: false, error };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runOneCase(args: {
  skill: DiscoveredEvalSkill;
  evalCase: EvalCase;
  evalsDir: string;
  skillOutputDir: string;
  model: ModelSelection | undefined;
  judgeModel: ModelSelection | undefined;
  agentDir: string | undefined;
  compare: boolean;
  extraSkillPaths: string[];
  contextMode: EvalContextMode;
  sandbox: SandboxMode;
  observabilitySinks: ObservabilitySink[];
  runId: string;
  iteration: string | undefined;
  skillName: string;
  createSession: PiSdkSessionFactory | undefined;
  judge: LlmJudgeFn | undefined;
  runtime: AgentRuntime | undefined;
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
  agentDir: string | undefined;
  createSession: PiSdkSessionFactory | undefined;
  judge: LlmJudgeFn | undefined;
  runtime: AgentRuntime | undefined;
  variant: EvalRunVariant;
  variantDir: string;
  attachSkill: boolean;
  extraSkillPaths: string[];
  contextMode: EvalContextMode;
  sandbox: SandboxMode;
  observabilitySinks: ObservabilitySink[];
  runId: string;
  iteration: string | undefined;
  skillName: string;
}): Promise<VariantRunArtifacts> {
  const run = await runEvalCase({
    skill: args.skill,
    case: args.evalCase,
    evalsDir: args.evalsDir,
    model: args.model,
    agentDir: args.agentDir,
    createSession: args.createSession,
    runtime: args.runtime,
    attachSkill: args.attachSkill,
    extraSkillPaths: args.extraSkillPaths,
    contextMode: args.contextMode,
    sandbox: args.sandbox,
  });

  try {
    // Judge model precedence: --judge-model > the model that actually ran
    // the case (guaranteed usable — the run just used it) > the built-in
    // last-resort default inside gradeEvalCase.
    const runnerModel = run.timing.model;
    const judgeModel =
      args.judgeModel ??
      (runnerModel ? { provider: runnerModel.provider, id: runnerModel.id } : undefined);
    const grading = await gradeEvalCase({
      case: args.evalCase,
      workspaceDir: run.workspaceDir,
      assistantText: run.assistantText,
      judge: args.judge,
      judgeModel,
      agentDir: args.agentDir,
    });

    const assistantPath = path.join(args.variantDir, "assistant.md");
    const outputsDir = path.join(args.variantDir, "outputs");
    const timingPath = path.join(args.variantDir, "timing.json");
    const gradingPath = path.join(args.variantDir, "grading.json");
    const tracePath = path.join(args.variantDir, "trace.json");
    const toolSummaryPath = path.join(args.variantDir, "tool-summary.json");
    const contextManifestPath = path.join(args.variantDir, "context-manifest.json");

    await mkdir(outputsDir, { recursive: true });
    await writeFile(assistantPath, formatAssistantArtifact(run.assistantText), "utf-8");
    await cp(run.workspaceDir, outputsDir, { recursive: true, force: true });
    await writeJsonArtifact(timingPath, run.timing);
    await writeJsonArtifact(gradingPath, grading);
    await writeJsonArtifact(tracePath, run.trace);
    await writeJsonArtifact(toolSummaryPath, run.toolSummary);
    await writeJsonArtifact(contextManifestPath, run.contextManifest);

    const artifactPaths = {
      assistant: assistantPath,
      outputs: outputsDir,
      timing: timingPath,
      grading: gradingPath,
      trace: tracePath,
      tool_summary: toolSummaryPath,
      context_manifest: contextManifestPath,
    };
    const observabilityExports = await exportCaseVariantToSinks(args.observabilitySinks, {
      run_id: args.runId,
      ...(args.iteration ? { iteration: args.iteration } : {}),
      skill: {
        name: args.skillName,
        dir: args.skill.skillDir,
      },
      case_id: String(args.evalCase.id),
      variant: args.variant,
      timing: run.timing,
      grading_summary: grading.summary,
      grading,
      trace: run.trace,
      tool_summary: run.toolSummary,
      context_manifest: run.contextManifest,
      artifact_paths: artifactPaths,
    });

    return {
      variant: args.variant,
      assistantPath,
      outputsDir,
      timingPath,
      gradingPath,
      tracePath,
      toolSummaryPath,
      contextManifestPath,
      timing: run.timing,
      grading,
      toolSummary: run.toolSummary,
      contextManifest: run.contextManifest,
      observabilityExports,
    };
  } finally {
    await run.cleanup().catch(() => undefined);
  }
}

async function exportCaseVariantToSinks(
  sinks: ObservabilitySink[],
  payload: ObservabilityCaseVariantPayload,
): Promise<ObservabilityExportResult[]> {
  const results: ObservabilityExportResult[] = [];

  for (const sink of sinks) {
    try {
      const result = await sink.exportCaseVariant(payload);
      results.push(result ?? { sink: sink.name, status: "success" });
    } catch (error) {
      results.push({
        sink: sink.name,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function collectObservabilityExportFailures(artifacts: CaseRunArtifacts): SkillRunResult["observabilityExportFailures"] {
  const failures: SkillRunResult["observabilityExportFailures"] = [];
  const variants = artifacts.variants ? Object.values(artifacts.variants) : [artifacts];

  for (const variant of variants) {
    if (!variant) continue;
    for (const result of variant.observabilityExports) {
      if (result.status !== "failed") continue;
      failures.push({
        caseId: artifacts.caseId,
        variant: variant.variant,
        sink: result.sink,
        message: result.message ?? "Observability export failed",
      });
    }
  }

  return failures;
}

function formatAssistantArtifact(assistantText: string): string {
  return assistantText.endsWith("\n") ? assistantText : `${assistantText}\n`;
}

async function writeJsonArtifact(pathname: string, value: unknown): Promise<void> {
  await writeFile(pathname, `${JSON.stringify(value, createSafeJsonReplacer(), 2)}\n`, "utf-8");
}

function createSafeJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    return value;
  };
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
  iteration: string | undefined;
  outputDirOverride: string | undefined;
}): string {
  if (args.outputDirOverride) {
    return args.iteration
      ? path.resolve(args.outputDirOverride, path.basename(args.skill.skillDir), args.iteration, args.runId)
      : path.resolve(args.outputDirOverride, path.basename(args.skill.skillDir), args.runId);
  }
  return args.iteration
    ? path.join(args.skill.skillDir, "evals-runs", args.iteration, args.runId)
    : path.join(args.skill.skillDir, "evals-runs", args.runId);
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

function normalizeIteration(iteration: string | undefined): string | undefined {
  if (iteration === undefined) return undefined;
  const trimmed = iteration.trim();
  if (trimmed.length === 0) return undefined;
  const normalized = trimmed.startsWith("iteration-") ? trimmed : `iteration-${trimmed}`;
  return normalized.replace(/[^A-Za-z0-9_.-]/g, "-");
}

function sanitizeCaseId(id: string | number): string {
  return String(id).replace(/[^A-Za-z0-9_.-]/g, "-");
}
