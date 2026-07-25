/**
 * Protocol-neutral execution pipeline for one eval case. This module owns the
 * lifetime of a case workspace: execute, grade, persist local artifacts,
 * export observability, then clean up after every workspace consumer is done.
 */

import path from "node:path";

import type { ModelSelection, SandboxMode } from "../contracts/types.js";
import { writeCaseVariantArtifacts } from "./artifacts.js";
import type { DiscoveredEvalSkill } from "./discover.js";
import { gradeEvalCase, type LlmJudgeFn } from "./grade.js";
import { runEvalCase } from "./run-case.js";
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
import type { GradingJson, EvalCase, EvalRunVariant, TimingJson } from "./types.js";

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

/** Case data loaded from the suite and its discovered parent skill. */
export interface CasePipelineSpecification {
  skill: DiscoveredEvalSkill;
  evalCase: EvalCase;
  evalsDir: string;
  skillName: string;
}

/** Runtime settings shared by every variant for one case. */
export interface CasePipelineExecutionConfig {
  model?: ModelSelection;
  judgeModel?: ModelSelection;
  agentDir?: string;
  compare: boolean;
  extraSkillPaths: string[];
  contextMode: EvalContextMode;
  sandbox: SandboxMode;
  observabilitySinks: ObservabilitySink[];
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
  runtime?: AgentRuntime;
}

/** Output identity and artifact root for one case execution. */
export interface CasePipelineRunContext {
  outputDir: string;
  runId: string;
  iteration?: string;
}

/** Focused test seams for the three external stages of a case pipeline. */
export interface CasePipelineDependencies {
  runCase?: typeof runEvalCase;
  gradeCase?: typeof gradeEvalCase;
  writeArtifacts?: typeof writeCaseVariantArtifacts;
  exportToSinks?: typeof exportCaseVariantToSinks;
}

export interface ExecuteCasePipelineInput {
  specification: CasePipelineSpecification;
  execution: CasePipelineExecutionConfig;
  context: CasePipelineRunContext;
  dependencies?: CasePipelineDependencies;
}

const defaultDependencies = {
  runCase: runEvalCase,
  gradeCase: gradeEvalCase,
  writeArtifacts: writeCaseVariantArtifacts,
  exportToSinks: exportCaseVariantToSinks,
};

/**
 * Execute every requested variant serially. Compare mode deliberately runs
 * `with_skill` before `without_skill`; a failure never synthesizes a partial
 * comparison and prevents later variants from running.
 */
export async function executeCasePipeline(input: ExecuteCasePipelineInput): Promise<CaseRunArtifacts> {
  const deps = { ...defaultDependencies, ...input.dependencies };
  const { specification, execution, context } = input;
  const caseSlug = sanitizeCaseId(specification.evalCase.id);
  const caseDir = path.join(context.outputDir, `eval-${caseSlug}`);

  if (!execution.compare) {
    const single = await executeCaseVariant({
      specification,
      execution,
      context,
      deps,
      variant: "with_skill",
      variantDir: caseDir,
      attachSkill: true,
    });
    return { caseId: String(specification.evalCase.id), ...single };
  }

  const withSkill = await executeCaseVariant({
    specification,
    execution,
    context,
    deps,
    variant: "with_skill",
    variantDir: path.join(caseDir, "with_skill"),
    attachSkill: true,
  });
  const withoutSkill = await executeCaseVariant({
    specification,
    execution,
    context,
    deps,
    variant: "without_skill",
    variantDir: path.join(caseDir, "without_skill"),
    attachSkill: false,
  });

  return {
    caseId: String(specification.evalCase.id),
    ...withSkill,
    variants: { with_skill: withSkill, without_skill: withoutSkill },
    comparison: compareVariantPassRates(withSkill.grading, withoutSkill.grading),
  };
}

async function executeCaseVariant(args: {
  specification: CasePipelineSpecification;
  execution: CasePipelineExecutionConfig;
  context: CasePipelineRunContext;
  deps: Required<CasePipelineDependencies>;
  variant: EvalRunVariant;
  variantDir: string;
  attachSkill: boolean;
}): Promise<VariantRunArtifacts> {
  const { specification, execution, context, deps } = args;
  const run = await deps.runCase({
    skill: specification.skill,
    case: specification.evalCase,
    evalsDir: specification.evalsDir,
    model: execution.model,
    agentDir: execution.agentDir,
    createSession: execution.createSession,
    runtime: execution.runtime,
    attachSkill: args.attachSkill,
    extraSkillPaths: execution.extraSkillPaths,
    contextMode: execution.contextMode,
    sandbox: execution.sandbox,
  });

  try {
    // Judge precedence: explicit judge model, then the model that ran the
    // case, then gradeEvalCase's built-in fallback.
    const runnerModel = run.timing.model;
    const judgeModel = execution.judgeModel ??
      (runnerModel ? { provider: runnerModel.provider, id: runnerModel.id } : undefined);
    const grading = await deps.gradeCase({
      case: specification.evalCase,
      workspaceDir: run.workspaceDir,
      assistantText: run.assistantText,
      observations: run.trace.observations,
      judge: execution.judge,
      judgeModel,
      agentDir: execution.agentDir,
    });
    const { paths: artifactPaths } = await deps.writeArtifacts({
      variantDir: args.variantDir,
      assistantText: run.assistantText,
      workspaceDir: run.workspaceDir,
      timing: run.timing,
      grading,
      trace: run.trace,
      toolSummary: run.toolSummary,
      contextManifest: run.contextManifest,
    });
    const observabilityExports = await deps.exportToSinks(execution.observabilitySinks, {
      run_id: context.runId,
      ...(context.iteration ? { iteration: context.iteration } : {}),
      skill: { name: specification.skillName, dir: specification.skill.skillDir },
      case_id: String(specification.evalCase.id),
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
      assistantPath: artifactPaths.assistant,
      outputsDir: artifactPaths.outputs,
      timingPath: artifactPaths.timing,
      gradingPath: artifactPaths.grading,
      tracePath: artifactPaths.trace,
      toolSummaryPath: artifactPaths.tool_summary,
      contextManifestPath: artifactPaths.context_manifest,
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

/** Export each sink independently so optional observability cannot fail a case. */
export async function exportCaseVariantToSinks(
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

export function collectObservabilityExportFailures(artifacts: CaseRunArtifacts): Array<{
  caseId: string;
  variant: EvalRunVariant;
  sink: string;
  message: string;
}> {
  const failures: Array<{ caseId: string; variant: EvalRunVariant; sink: string; message: string }> = [];
  const variants = artifacts.variants ? Object.values(artifacts.variants) : [artifacts];
  for (const variant of variants) {
    if (!variant) continue;
    for (const result of variant.observabilityExports) {
      if (result.status === "failed") {
        failures.push({
          caseId: artifacts.caseId,
          variant: variant.variant,
          sink: result.sink,
          message: result.message ?? "Observability export failed",
        });
      }
    }
  }
  return failures;
}

export function compareVariantPassRates(withSkill: GradingJson, withoutSkill: GradingJson): CaseRunComparison {
  const withSkillPassRate = withSkill.summary.pass_rate;
  const withoutSkillPassRate = withoutSkill.summary.pass_rate;
  return {
    withSkillPassRate,
    withoutSkillPassRate,
    delta: withSkillPassRate === null || withoutSkillPassRate === null
      ? null
      : withSkillPassRate - withoutSkillPassRate,
  };
}

function sanitizeCaseId(id: string | number): string {
  return String(id).replace(/[^A-Za-z0-9_.-]/g, "-");
}
