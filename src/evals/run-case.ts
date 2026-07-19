import path from "node:path";

import type { ModelSelection, SandboxMode } from "../contracts/types.js";
import type { DiscoveredSkillFiles, RepoSourceDescriptor } from "../load/source-types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import { piSdkRuntime } from "../pi/sdk-eval-case.js";
import type { AgentRuntime, RuntimeSkillIdentity } from "../runtime/types.js";
import {
  buildToolSummary,
  enrichContextManifestWithTrace,
} from "../observability/artifacts.js";
import type { ContextManifestJson, EvalContextMode, ToolSummaryJson } from "../observability/types.js";
import { normalizePiSdkCaseRunResult } from "../traces/normalize-sdk.js";
import type { EvalTrace } from "../traces/types.js";

import type { DiscoveredEvalSkill } from "./discover.js";
import type { EvalCase, TimingJson } from "./types.js";
import { prepareCaseWorkspace } from "./workspace.js";

/**
 * Options accepted by {@link runEvalCase}. Intentionally scoped to the
 * M2A runner — the M2B grader receives the returned
 * {@link EvalCaseRunResult} and produces `grading.json`.
 */
export interface RunEvalCaseOptions {
  /** Skill discovered via `discoverEvalSkills`. */
  skill: DiscoveredEvalSkill;
  /** One case loaded from `<skillDir>/evals/evals.json`. */
  case: EvalCase;
  /**
   * Absolute path to the `<skillDir>/evals/` directory — used to resolve
   * case-relative `files` entries when materializing fixtures.
   */
  evalsDir: string;
  /** Optional model pin; falls back to runtime defaults when absent. */
  model?: ModelSelection;
  /** Eval-owned Pi agent directory for model registry/settings/auth. */
  agentDir?: string;
  /** Attach the target skill to the Pi session. Defaults to true. */
  attachSkill?: boolean;
  /** Additional explicit skill paths to load as conflict/distractor context. */
  extraSkillPaths?: string[];
  /** Context isolation mode. Defaults to isolated. */
  contextMode?: EvalContextMode;
  /**
   * Resolved execution isolation for this case. Defaults to `"none"`
   * (host shell + real workspace FS). `"just-bash"` routes the agent's
   * bash tool through an in-process virtual shell — see
   * {@link createJustBashCodingTools}.
   */
  sandbox?: SandboxMode;
  /**
   * Test-injection hook. When provided, replaces the real Pi SDK session
   * so tests can assert on prompt flow without calling the API.
   */
  createSession?: PiSdkSessionFactory;
  /**
   * Agent runtime that executes the case. Defaults to the Pi SDK runtime;
   * alternative runtimes run behind the same eval contract and artifacts.
   */
  runtime?: AgentRuntime;
}

/**
 * Result of a single {@link runEvalCase} invocation. The caller is
 * responsible for invoking {@link EvalCaseRunResult.cleanup} once
 * downstream grading has finished reading the workspace.
 */
export interface EvalCaseRunResult {
  /** The case id pulled straight from {@link EvalCase.id}. */
  caseId: EvalCase["id"];
  /** Final assistant text produced by the run. */
  assistantText: string;
  /** Absolute path to the per-case workspace (populated if `files` declared). */
  workspaceDir: string;
  /** Token/duration summary ready to write to `timing.json`. */
  timing: TimingJson;
  /** Normalized trace for downstream grading / reporting. */
  trace: EvalTrace;
  /** Manifest describing what skills/tools/context were exposed to the model. */
  contextManifest: ContextManifestJson;
  /** Aggregated tool/context activity observed during the run. */
  toolSummary: ToolSummaryJson;
  /** Idempotent cleanup for the workspace + underlying agent dir. */
  cleanup: () => Promise<void>;
}

/**
 * Execute one {@link EvalCase} against its parent skill via an
 * {@link AgentRuntime}.
 *
 * Constructs protocol-neutral runtime input (skill identity + case id/prompt)
 * and delegates Pi-specific contract/lane synthesis to the Pi adapter.
 * Captures assistant text + timing + trace and hands the populated workspace
 * back for downstream assertion grading.
 */
export async function runEvalCase(options: RunEvalCaseOptions): Promise<EvalCaseRunResult> {
  const skillFiles = buildSkillFiles(options.skill);

  const prepared = await prepareCaseWorkspace({
    evalsDir: options.evalsDir,
    setup: options.case.setup,
    files: options.case.files,
    skillFiles,
  });

  try {
    const skillIdentity = toRuntimeSkillIdentity(skillFiles);
    const source = buildSourceDescriptor(options.skill);

    const runtime = options.runtime ?? piSdkRuntime;
    const runtimeResult = await runtime.runCase({
      source,
      skill: skillIdentity,
      case: {
        caseId: String(options.case.id),
        prompt: options.case.prompt,
        skillName: skillIdentity.name,
      },
      workspaceDir: prepared.workspaceDir,
      workspaceEnv: prepared.materializedFixture?.env,
      agentDir: options.agentDir,
      model: options.model,
      createSession: options.createSession,
      attachSkill: options.attachSkill,
      extraSkillPaths: options.extraSkillPaths,
      contextMode: options.contextMode,
      sandbox: options.sandbox,
      sandboxMocks: options.case.sandboxMocks,
    });

    const timing: TimingJson = {
      total_tokens: runtimeResult.usage.totalTokens,
      duration_ms: runtimeResult.durationMs,
      model: runtimeResult.usage.model,
      thinking_level: runtimeResult.usage.thinkingLevel,
      token_usage: {
        input_tokens: runtimeResult.usage.inputTokens,
        output_tokens: runtimeResult.usage.outputTokens,
        cache_read_tokens: runtimeResult.usage.cacheReadTokens,
        cache_write_tokens: runtimeResult.usage.cacheWriteTokens,
        total_tokens: runtimeResult.usage.totalTokens,
      },
      estimated_cost_usd: runtimeResult.usage.estimatedCostUsd,
      context_window_tokens: runtimeResult.usage.contextWindowTokens,
      context_window_used_percent: runtimeResult.usage.contextWindowUsedPercent,
    };
    const trace = normalizePiSdkCaseRunResult(runtimeResult, runtime.id);
    const contextManifest = enrichContextManifestWithTrace(runtimeResult.contextManifest, trace);
    const toolSummary = buildToolSummary(trace, contextManifest);

    const cleanup = async () => {
      await prepared.cleanup();
      await runtimeResult.cleanup().catch(() => undefined);
    };

    return {
      caseId: options.case.id,
      assistantText: runtimeResult.session.assistantText,
      workspaceDir: prepared.workspaceDir,
      timing,
      trace,
      contextManifest,
      toolSummary,
      cleanup,
    };
  } catch (error) {
    await prepared.cleanup().catch(() => undefined);
    throw error;
  }
}

function buildSkillFiles(skill: DiscoveredEvalSkill): DiscoveredSkillFiles {
  return {
    skillName: path.basename(skill.skillDir),
    skillDir: skill.skillDir,
    relativeSkillDir: skill.relativeSkillDir,
    skillDefinitionPath: skill.skillDefinitionPath,
    // evals.json replaces the legacy `skill.eval.ts` — reuse the slot
    // so callers that log it still get a meaningful path.
    evalDefinitionPath: skill.evalsJsonPath,
  };
}

function toRuntimeSkillIdentity(files: DiscoveredSkillFiles): RuntimeSkillIdentity {
  return {
    name: files.skillName,
    skillDir: files.skillDir,
    relativeSkillDir: files.relativeSkillDir,
    skillDefinitionPath: files.skillDefinitionPath,
    evalDefinitionPath: files.evalDefinitionPath,
  };
}

function buildSourceDescriptor(skill: DiscoveredEvalSkill): RepoSourceDescriptor {
  // `relativeSkillDir` equals "." when the skill lives at the repo root.
  // Otherwise, the repo root is `<skillDir>` minus that relative prefix.
  const repositoryRoot =
    skill.relativeSkillDir === "."
      ? skill.skillDir
      : path.resolve(skill.skillDir, path.relative(skill.relativeSkillDir, "."));

  return {
    kind: "local",
    input: repositoryRoot,
    repositoryRoot,
    displayName: path.basename(repositoryRoot),
    resolvedRef: null,
    git: null,
  };
}
