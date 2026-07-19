import type { ModelSelection, SandboxCommandMock, SandboxMode, SkillProfile, TargetTier } from "../contracts/types.js";
import type { ContextManifestJson, EvalContextMode } from "../observability/types.js";
import type { DiscoveredSkillFiles, ValidatedSkillDiscovery } from "../load/source-types.js";
import {
  collectPiSdkRunnableCases,
  resolveRequestedModel,
  selectPiSdkCases,
} from "./sdk-case-mapping.js";
import { buildEvalCompatibilityCaseDefinition } from "./sdk-eval-case.js";
import { buildRequestedContextManifest } from "./sdk-context-resources.js";
import {
  createCaseCleanup,
  createPiSdkRunEnvironment,
  createSkillCleanup,
  maybeMaterializeCaseFixture,
  snapshotFixture,
} from "./sdk-run-lifecycle.js";
import {
  buildPromptFailureMessage,
  collectPiSdkUsageMetrics,
  findTerminalProviderError,
  loadTelemetryIfAvailable,
  observePiSdkSession,
  snapshotValue,
} from "./sdk-run-observation.js";
import { createDefaultPiSdkSession } from "./sdk-session-factory.js";
import type {
  MaterializedFixture,
} from "../fixtures/types.js";
import type {
  PiSdkCaseKind,
  PiSdkCaseLane,
  PiSdkCaseRunResult,
  PiSdkRunnableCase,
  PiSdkRunEnvironment,
  PiSdkSkillRunResult,
  RunPiSdkCaseOptions,
  RunPiSdkEvalCaseOptions,
  RunValidatedSkillViaPiSdkOptions,
} from "./types.js";

export { collectPiSdkRunnableCases, findPiSdkRunnableCase } from "./sdk-case-mapping.js";
export { createPiSdkRunEnvironment } from "./sdk-run-lifecycle.js";

/** Stable session shape used by the injectable Pi SDK runner seam. */
export interface PiSdkSessionLike {
  sessionId: string;
  sessionFile: string | undefined;
  messages: unknown[];
  model?: { provider?: unknown; id?: unknown; contextWindow?: unknown };
  thinkingLevel?: unknown;
  getContextUsage?: () => unknown;
  subscribe(listener: (event: unknown) => void): () => void;
  prompt(text: string): Promise<void>;
  dispose(): void;
}

export interface PiSdkSessionTelemetryContext {
  skillName: string;
  caseId: string;
  lane?: PiSdkCaseLane;
  kind?: PiSdkCaseKind;
}

export interface PiSdkSessionFactoryOptions {
  workspaceDir: string;
  agentDir: string;
  configAgentDir?: string;
  sessionDir: string;
  skillFiles: DiscoveredSkillFiles;
  caseDefinition: PiSdkRunnableCase;
  telemetryContext: PiSdkSessionTelemetryContext;
  requestedModel: ModelSelection | undefined;
  appendSystemPrompt: string[];
  env: Record<string, string>;
  attachSkill: boolean;
  extraSkillPaths: string[];
  contextMode: EvalContextMode;
  sandbox: SandboxMode;
  sandboxMocks: SandboxCommandMock[];
}

export interface PiSdkSessionFactoryResult {
  session: PiSdkSessionLike;
  model: ModelSelection | null;
  contextManifest?: ContextManifestJson;
}

export type PiSdkSessionFactory = (
  options: PiSdkSessionFactoryOptions,
) => Promise<PiSdkSessionFactoryResult>;

export class PiSdkCaseRunError extends Error {
  readonly result: PiSdkCaseRunResult;

  constructor(message: string, result: PiSdkCaseRunResult, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PiSdkCaseRunError";
    this.result = result;
  }
}

interface PiSdkCaseRunCoreOptions {
  source: RunPiSdkCaseOptions["source"];
  skillFiles: DiscoveredSkillFiles;
  skillResult: {
    name: string;
    relativeSkillDir: string;
    profile: SkillProfile;
    targetTier: TargetTier;
  };
  caseDefinition: PiSdkRunnableCase;
  telemetryContext: PiSdkSessionTelemetryContext;
  environment: PiSdkRunEnvironment;
  workspaceDir: string;
  materializedFixture: MaterializedFixture | null;
  requestedModel: ModelSelection | undefined;
  configAgentDir?: string;
  appendSystemPrompt?: string[];
  attachSkill?: boolean;
  extraSkillPaths?: string[];
  contextMode?: EvalContextMode;
  sandbox?: SandboxMode;
  sandboxMocks?: SandboxCommandMock[];
  createSession?: PiSdkSessionFactory;
}

/**
 * Eval-native Pi run: maps evals.json cases directly to a Pi session without
 * synthesizing a NormalizedSkillEvalContract or sdk-case-mapping lanes.
 */
export async function runPiSdkEvalCase(
  options: RunPiSdkEvalCaseOptions & { createSession?: PiSdkSessionFactory },
): Promise<PiSdkCaseRunResult> {
  const environment =
    options.environment ??
    (await createPiSdkRunEnvironment({
      workspaceDir: options.workspaceDir,
      agentDir: options.agentDir,
      sessionDir: options.sessionDir,
    }));
  const caseDefinition = buildEvalCompatibilityCaseDefinition(options.evalCase);

  return runPiSdkCaseCore({
    source: options.source,
    skillFiles: options.skill.files,
    skillResult: {
      name: options.skill.files.skillName,
      relativeSkillDir: options.skill.files.relativeSkillDir,
      profile: "repo-mutation",
      targetTier: 1,
    },
    caseDefinition,
    telemetryContext: {
      skillName: options.evalCase.skillName,
      caseId: options.evalCase.caseId,
    },
    environment,
    workspaceDir: options.workspaceDir,
    materializedFixture: null,
    requestedModel: options.model,
    configAgentDir: options.agentDir,
    appendSystemPrompt: options.appendSystemPrompt,
    attachSkill: options.attachSkill,
    extraSkillPaths: options.extraSkillPaths,
    contextMode: options.contextMode,
    sandbox: options.sandbox,
    sandboxMocks: options.sandboxMocks,
    createSession: options.createSession,
  });
}

/**
 * Legacy contract-mapped Pi run. Prefer {@link runPiSdkEvalCase} for evals.json.
 */
export async function runPiSdkCase(
  options: RunPiSdkCaseOptions & { createSession?: PiSdkSessionFactory },
): Promise<PiSdkCaseRunResult> {
  const environment =
    options.environment ??
    (await createPiSdkRunEnvironment({
      workspaceDir: options.workspaceDir ?? options.source.repositoryRoot,
      agentDir: options.agentDir,
      sessionDir: options.sessionDir,
    }));
  const requestedModel = resolveRequestedModel(options.skill.contract, options.caseDefinition, options.model);
  const materializedFixture = await maybeMaterializeCaseFixture(options.skill, options.caseDefinition);
  const workspaceDir = materializedFixture?.workspaceDir ?? environment.workspaceDir;

  return runPiSdkCaseCore({
    source: options.source,
    skillFiles: options.skill.files,
    skillResult: {
      name: options.skill.contract.skill,
      relativeSkillDir: options.skill.files.relativeSkillDir,
      profile: options.skill.contract.profile,
      targetTier: options.skill.contract.targetTier,
    },
    caseDefinition: options.caseDefinition,
    telemetryContext: {
      skillName: options.skill.contract.skill,
      caseId: options.caseDefinition.caseId,
      lane: options.caseDefinition.lane,
      kind: options.caseDefinition.kind,
    },
    environment,
    workspaceDir,
    materializedFixture,
    requestedModel,
    configAgentDir: options.agentDir,
    appendSystemPrompt: options.appendSystemPrompt,
    attachSkill: options.attachSkill,
    extraSkillPaths: options.extraSkillPaths,
    contextMode: options.contextMode,
    sandbox: options.sandbox,
    sandboxMocks: options.sandboxMocks,
    createSession: options.createSession,
  });
}

async function runPiSdkCaseCore(options: PiSdkCaseRunCoreOptions): Promise<PiSdkCaseRunResult> {
  const appendSystemPrompt = [...(options.appendSystemPrompt ?? [])];
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = [...(options.extraSkillPaths ?? [])];
  const contextMode = options.contextMode ?? "isolated";
  const sandbox = options.sandbox ?? "none";
  const sandboxMocks = options.sandboxMocks ?? [];
  const env = options.materializedFixture?.env ?? {};
  const cleanup = createCaseCleanup(options.environment, options.materializedFixture);

  let sessionResult: PiSdkSessionFactoryResult;
  try {
    sessionResult = await (options.createSession ?? createDefaultPiSdkSession)({
      workspaceDir: options.workspaceDir,
      agentDir: options.environment.agentDir,
      configAgentDir: options.configAgentDir,
      sessionDir: options.environment.sessionDir,
      skillFiles: options.skillFiles,
      caseDefinition: options.caseDefinition,
      telemetryContext: options.telemetryContext,
      requestedModel: options.requestedModel,
      appendSystemPrompt,
      env,
      attachSkill,
      extraSkillPaths,
      contextMode,
      sandbox,
      sandboxMocks,
    });
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  const { session } = sessionResult;
  const observation = observePiSdkSession(session);
  const startedAt = new Date();
  let promptError: unknown;

  try {
    await session.prompt(options.caseDefinition.prompt);
  } catch (error) {
    promptError = error;
  }

  observation.unsubscribe();

  const telemetry = await loadTelemetryIfAvailable(session.sessionFile);
  const finishedAt = new Date();
  const usage = collectPiSdkUsageMetrics(session, sessionResult.model);
  const contextManifest = sessionResult.contextManifest ?? buildRequestedContextManifest({
    skillFiles: options.skillFiles,
    agentDir: options.environment.agentDir,
    attachSkill,
    extraSkillPaths,
    contextMode,
  });
  const result: PiSdkCaseRunResult = {
    source: options.source,
    skill: options.skillResult,
    caseDefinition: options.caseDefinition,
    workspaceDir: options.workspaceDir,
    agentDir: options.environment.agentDir,
    sessionDir: options.environment.sessionDir,
    fixture: snapshotFixture(options.materializedFixture),
    model: usage.model,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    session: {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      assistantText: observation.getAssistantText(),
      messages: snapshotValue([...session.messages]),
      events: observation.events,
    },
    usage,
    contextManifest,
    telemetry,
    cleanup,
  };

  session.dispose();

  if (promptError !== undefined) {
    throw new PiSdkCaseRunError(buildPromptFailureMessage(options.caseDefinition.caseId, promptError), result, {
      cause: promptError,
    });
  }

  const providerError = findTerminalProviderError(session.messages);
  if (providerError !== null) {
    const modelLabel = usage.model ? `${usage.model.provider}/${usage.model.id}` : "unknown model";
    throw new PiSdkCaseRunError(
      `Case ${options.caseDefinition.caseId}: runner model ${modelLabel} returned an error instead of output: ${providerError}`,
      result,
    );
  }

  return result;
}

export async function runValidatedSkillViaPiSdk(
  options: RunValidatedSkillViaPiSdkOptions & { createSession?: PiSdkSessionFactory },
): Promise<PiSdkSkillRunResult> {
  const environment =
    options.environment ??
    (await createPiSdkRunEnvironment({
      workspaceDir: options.workspaceDir ?? options.source.repositoryRoot,
      agentDir: options.agentDir,
      sessionDir: options.sessionDir,
    }));
  const selectedCases = selectPiSdkCases(
    collectPiSdkRunnableCases(options.skill.contract),
    options.selectedCaseIds,
  );
  const results: PiSdkCaseRunResult[] = [];

  for (const caseDefinition of selectedCases) {
    results.push(
      await runPiSdkCase({
        source: options.source,
        skill: options.skill,
        caseDefinition,
        environment,
        model: options.model,
        appendSystemPrompt: options.appendSystemPrompt,
        attachSkill: options.attachSkill,
        extraSkillPaths: options.extraSkillPaths,
        contextMode: options.contextMode,
        createSession: options.createSession,
      }),
    );
  }

  return {
    source: options.source,
    skill: options.skill,
    workspaceDir: environment.workspaceDir,
    agentDir: environment.agentDir,
    sessionDir: environment.sessionDir,
    results,
    cleanup: createSkillCleanup(results, environment),
  };
}
