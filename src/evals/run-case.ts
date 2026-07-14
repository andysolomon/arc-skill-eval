import { cp, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ModelSelection, SandboxMode, SeededWorkspaceSetup, WorkspaceSetup } from "../contracts/types.js";
import { materializeFixture } from "../fixtures/materialize.js";
import type { MaterializedFixture } from "../fixtures/types.js";
import type { DiscoveredSkillFiles, RepoSourceDescriptor } from "../load/source-types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import { piSdkRuntime } from "../runtime/pi-sdk.js";
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
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-case-"));
  let workspaceCleaned = false;
  let materializedFixture: MaterializedFixture | undefined;

  try {
    const skillFiles = buildSkillFiles(options.skill);

    if (options.case.setup) {
      materializedFixture = await materializeWorkspaceSetup({
        evalsDir: options.evalsDir,
        setup: options.case.setup,
        workspaceDir,
        skillFiles,
      });
    }

    if (options.case.files && options.case.files.length > 0) {
      await materializeCaseFiles({
        evalsDir: options.evalsDir,
        files: options.case.files,
        workspaceDir,
      });
    }

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
      workspaceDir,
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
      if (!workspaceCleaned) {
        workspaceCleaned = true;
        await materializedFixture?.cleanup().catch(() => undefined);
        await rm(workspaceDir, { recursive: true, force: true });
      }
      await runtimeResult.cleanup().catch(() => undefined);
    };

    return {
      caseId: options.case.id,
      assistantText: runtimeResult.session.assistantText,
      workspaceDir,
      timing,
      trace,
      contextManifest,
      toolSummary,
      cleanup,
    };
  } catch (error) {
    if (!workspaceCleaned) {
      workspaceCleaned = true;
      await materializedFixture?.cleanup().catch(() => undefined);
      await rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }
}

async function materializeCaseFiles(options: {
  evalsDir: string;
  files: string[];
  workspaceDir: string;
}): Promise<void> {
  await materializeSeededWorkspace({
    evalsDir: options.evalsDir,
    workspaceDir: options.workspaceDir,
    setup: {
      kind: "seeded",
      sources: options.files.map((file) => ({ from: file, to: file })),
      mountMode: "preserve-path",
    },
  });
}

async function materializeWorkspaceSetup(options: {
  evalsDir: string;
  setup: WorkspaceSetup;
  workspaceDir: string;
  skillFiles: DiscoveredSkillFiles;
}): Promise<MaterializedFixture | undefined> {
  switch (options.setup.kind) {
    case "empty":
      return undefined;
    case "seeded":
      await materializeSeededWorkspace({
        evalsDir: options.evalsDir,
        setup: options.setup,
        workspaceDir: options.workspaceDir,
      });
      return undefined;
    case "fixture":
      return await materializeFixture({
        fixture: options.setup.fixture,
        skillFiles: options.skillFiles,
        workspaceDir: options.workspaceDir,
      });
  }
}

async function materializeSeededWorkspace(options: {
  evalsDir: string;
  setup: SeededWorkspaceSetup;
  workspaceDir: string;
}): Promise<void> {
  const mountMode = options.setup.mountMode ?? "preserve-path";

  for (const source of options.setup.sources) {
    const sourcePath = path.resolve(options.evalsDir, source.from);
    const defaultDestination = mountMode === "flatten-contents" ? "." : source.from;
    const destination = source.to ?? defaultDestination;
    const destPath = resolveWorkspaceDestination(options.workspaceDir, destination);

    if (mountMode === "flatten-contents") {
      await copyFlattened(sourcePath, destPath);
    } else {
      await mkdir(path.dirname(destPath), { recursive: true });
      await cp(sourcePath, destPath, { recursive: true, force: true });
    }
  }
}

async function copyFlattened(sourcePath: string, destPath: string): Promise<void> {
  const stats = await lstat(sourcePath);
  if (!stats.isDirectory()) {
    const destStats = await lstat(destPath).catch(() => null);
    const fileDest = destStats?.isDirectory() ? path.join(destPath, path.basename(sourcePath)) : destPath;
    await mkdir(path.dirname(fileDest), { recursive: true });
    await cp(sourcePath, fileDest, { recursive: true, force: true });
    return;
  }

  await mkdir(destPath, { recursive: true });
  const entries = await readdir(sourcePath);
  for (const entry of entries) {
    await cp(path.join(sourcePath, entry), path.join(destPath, entry), {
      recursive: true,
      force: true,
    });
  }
}

function resolveWorkspaceDestination(workspaceDir: string, relativePath: string): string {
  const root = path.resolve(workspaceDir);
  const absolute = path.resolve(root, relativePath);
  const rel = path.relative(root, absolute);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Workspace setup destination escapes workspace: ${relativePath}`);
  }

  return absolute;
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
