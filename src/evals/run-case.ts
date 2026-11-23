import path from "node:path";

import { Data, Effect, type Scope } from "effect";

import type { ModelSelection, SandboxMode } from "../contracts/types.js";
import type { DiscoveredSkillFiles, RepoSourceDescriptor } from "../load/source-types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import { piSdkRuntime } from "../pi/sdk-eval-case.js";
import { stageSkillsForAgent } from "../runtime/stage-skill.js";
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
import { releaseQuietly, runScopedHandoff } from "../effect/scope.js";

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
  /**
   * Stop the agent and fail the case with {@link CaseTimeoutError} if it runs
   * longer than this. Covers the agent run only, not grading.
   */
  timeoutMs?: number;
  /** Cancels the case; every resource acquired so far is released. */
  signal?: AbortSignal;
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
  const { value, release } = await runScopedHandoff(runEvalCaseScoped(options), { signal: options.signal });
  return { ...value, cleanup: release };
}

/**
 * Scoped form of {@link runEvalCase}. Acquires the case workspace, the staged
 * skill copies and the runtime run as resources of the surrounding `Scope`;
 * closing the scope releases the runtime first, then the copies, then the
 * workspace. If anything after an
 * acquisition fails, times out or is interrupted, everything acquired so far
 * is released before the failure propagates.
 */
export function runEvalCaseScoped(
  options: RunEvalCaseOptions,
): Effect.Effect<Omit<EvalCaseRunResult, "cleanup">, CaseTimeoutError, Scope.Scope> {
  return Effect.gen(function* () {
    const skillFiles = buildSkillFiles(options.skill);

    const prepared = yield* Effect.acquireRelease(
      Effect.promise(() =>
        prepareCaseWorkspace({
          evalsDir: options.evalsDir,
          setup: options.case.setup,
          files: options.case.files,
          skillFiles,
        }),
      ),
      (workspace) => releaseQuietly(workspace.cleanup),
    );

    // The agent is pointed at copies of the skills, never at the real
    // directories: a copy has no eval suite beside SKILL.md, and its path does
    // not say the run is an eval.
    const staged = yield* Effect.acquireRelease(
      Effect.promise(() =>
        stageSkillsForAgent({ skillDir: skillFiles.skillDir, extraSkillPaths: options.extraSkillPaths ?? [] }),
      ),
      (copies) => releaseQuietly(copies.cleanup),
    );

    const skillIdentity = toRuntimeSkillIdentity({
      ...skillFiles,
      skillDir: staged.skillDir,
      skillDefinitionPath: path.join(staged.skillDir, path.relative(skillFiles.skillDir, skillFiles.skillDefinitionPath)),
    });
    const runtime = options.runtime ?? piSdkRuntime;
    const caseId = String(options.case.id);

    const runAgent = Effect.promise((signal) =>
      runtime.runCase({
        source: buildSourceDescriptor(options.skill),
        skill: skillIdentity,
        case: { caseId, prompt: options.case.prompt, skillName: skillIdentity.name },
        workspaceDir: prepared.workspaceDir,
        workspaceEnv: prepared.materializedFixture?.env,
        agentDir: options.agentDir,
        model: options.model,
        createSession: options.createSession,
        attachSkill: options.attachSkill,
        extraSkillPaths: staged.extraSkillPaths,
        contextMode: options.contextMode,
        sandbox: options.sandbox,
        sandboxMocks: options.case.sandboxMocks,
        signal,
      }),
    );

    // Interruptible acquire: a timeout or cancellation must be able to stop a
    // hung agent. The runtime releases its own partial resources on abort.
    const runtimeResult = yield* Effect.acquireRelease(
      options.timeoutMs === undefined
        ? runAgent
        : runAgent.pipe(
            Effect.timeoutOrElse({
              duration: options.timeoutMs,
              orElse: () => Effect.fail(new CaseTimeoutError({ caseId, timeoutMs: options.timeoutMs! })),
            }),
          ),
      (result) => releaseQuietly(result.cleanup),
      { interruptible: true },
    );

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
    // Artifacts outlive the copies, so they name the files the copies came from.
    const contextManifest = enrichContextManifestWithTrace(
      {
        ...runtimeResult.contextManifest,
        attached_skills: runtimeResult.contextManifest.attached_skills.map((attachment) => ({
          ...attachment,
          path: staged.toSourcePath(attachment.path),
        })),
      },
      trace,
    );
    const toolSummary = buildToolSummary(trace, contextManifest);

    return {
      caseId: options.case.id,
      assistantText: runtimeResult.session.assistantText,
      workspaceDir: prepared.workspaceDir,
      timing,
      trace,
      contextManifest,
      toolSummary,
    };
  });
}

/** The agent did not finish within `--case-timeout`. */
export class CaseTimeoutError extends Data.TaggedError("CaseTimeoutError")<{
  readonly caseId: string;
  readonly timeoutMs: number;
}> {
  override get message(): string {
    return `Case ${this.caseId} timed out after ${formatDuration(this.timeoutMs)}; the agent was stopped.`;
  }
}

function formatDuration(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
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
