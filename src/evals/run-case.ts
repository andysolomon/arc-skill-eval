import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import { normalizeSkillEvalContract } from "../contracts/normalize.js";
import type {
  DiscoveredSkillFiles,
  RepoSourceDescriptor,
  ValidatedSkillDiscovery,
} from "../load/source-types.js";
import {
  runPiSdkCase,
  type PiSdkSessionFactory,
} from "../pi/sdk-runner.js";
import type {
  PiSdkCaseRunResult,
  PiSdkExecutionCase,
} from "../pi/types.js";
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
  /**
   * Test-injection hook. When provided, replaces the real Pi SDK session
   * so tests can assert on prompt flow without calling the API.
   */
  createSession?: PiSdkSessionFactory;
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
  /** Idempotent cleanup for the workspace + underlying agent dir. */
  cleanup: () => Promise<void>;
}

/**
 * Execute one {@link EvalCase} against its parent skill via the Pi SDK.
 *
 * This is the M2A "runner" half of the MVP pipeline — it runs the
 * prompt once with the skill attached, captures assistant text +
 * timing + trace, and hands the populated workspace back to the caller
 * for downstream assertion grading (M2B).
 */
export async function runEvalCase(options: RunEvalCaseOptions): Promise<EvalCaseRunResult> {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-case-"));
  let workspaceCleaned = false;

  try {
    if (options.case.files && options.case.files.length > 0) {
      await materializeCaseFiles({
        evalsDir: options.evalsDir,
        files: options.case.files,
        workspaceDir,
      });
    }

    const skillDiscovery = buildSkillDiscovery(options.skill);
    const caseDefinition = buildExecutionCase(options.skill, options.case);
    const source = buildSourceDescriptor(options.skill);

    const piResult = await runPiSdkCase({
      source,
      skill: skillDiscovery,
      caseDefinition,
      workspaceDir,
      model: options.model,
      createSession: options.createSession,
    });

    const timing: TimingJson = {
      total_tokens: sumAssistantTokens(piResult.session.messages),
      duration_ms: piResult.durationMs,
    };
    const trace = normalizePiSdkCaseRunResult(piResult);

    const cleanup = async () => {
      if (!workspaceCleaned) {
        workspaceCleaned = true;
        await rm(workspaceDir, { recursive: true, force: true });
      }
      await piResult.cleanup().catch(() => undefined);
    };

    return {
      caseId: options.case.id,
      assistantText: piResult.session.assistantText,
      workspaceDir,
      timing,
      trace,
      cleanup,
    };
  } catch (error) {
    if (!workspaceCleaned) {
      workspaceCleaned = true;
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
  for (const relativeFile of options.files) {
    const sourcePath = path.resolve(options.evalsDir, relativeFile);
    const destPath = path.resolve(options.workspaceDir, relativeFile);
    await mkdir(path.dirname(destPath), { recursive: true });
    await cp(sourcePath, destPath, { recursive: true, force: true });
  }
}

function buildSkillDiscovery(skill: DiscoveredEvalSkill): ValidatedSkillDiscovery {
  const skillName = path.basename(skill.skillDir);
  const files: DiscoveredSkillFiles = {
    skillName,
    skillDir: skill.skillDir,
    relativeSkillDir: skill.relativeSkillDir,
    skillDefinitionPath: skill.skillDefinitionPath,
    // evals.json replaces the legacy `skill.eval.ts` — reuse the slot
    // so callers that log it still get a meaningful path.
    evalDefinitionPath: skill.evalsJsonPath,
  };
  const contract = normalizeSkillEvalContract({
    skill: skillName,
    // Profile + targetTier are required by the legacy contract shape but
    // irrelevant to the MVP runner; the Anthropic pivot drops them from
    // the authoring surface. Pick conservative defaults.
    profile: "repo-mutation",
    targetTier: 1,
    routing: {
      explicit: [],
      implicitPositive: [],
      adjacentNegative: [],
    },
  });

  return { files, contract };
}

function buildExecutionCase(
  skill: DiscoveredEvalSkill,
  caseInput: EvalCase,
): PiSdkExecutionCase {
  const skillName = path.basename(skill.skillDir);
  const caseId = String(caseInput.id);

  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId,
    prompt: caseInput.prompt,
    skillName,
    // Leave contractModel undefined — model resolution falls back to
    // `options.model` or runtime defaults.
    contractModel: undefined,
    definition: {
      id: caseId,
      prompt: caseInput.prompt,
      // No fixture — the M2A runner handles `files` itself so we can
      // keep the declarative Anthropic shape without tunneling it
      // through the legacy `FixtureRef` type.
      fixture: undefined,
    },
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

function sumAssistantTokens(messages: unknown[]): number {
  let total = 0;

  for (const message of messages) {
    if (!isAssistantMessageWithUsage(message)) continue;
    const usage = message.usage;
    total += numericField(usage, "input");
    total += numericField(usage, "output");
    total += numericField(usage, "cacheRead");
    total += numericField(usage, "cacheWrite");
  }

  return total;
}

function isAssistantMessageWithUsage(
  value: unknown,
): value is { role: "assistant"; usage: Record<string, unknown> } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.role !== "assistant") return false;
  return typeof record.usage === "object" && record.usage !== null;
}

function numericField(source: Record<string, unknown>, key: string): number {
  const raw = source[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
