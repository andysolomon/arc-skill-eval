import type { ModelSelection, SandboxCommandMock, SandboxMode } from "../contracts/types.js";
import type { ContextManifestJson, EvalContextMode } from "../observability/types.js";
import type { DiscoveredSkillFiles, ValidatedSkillDiscovery } from "../load/source-types.js";
import {
  collectPiSdkRunnableCases,
  resolveRequestedModel,
  selectPiSdkCases,
} from "./sdk-case-mapping.js";
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
  PiSdkCaseRunResult,
  PiSdkRunnableCase,
  PiSdkSkillRunResult,
  RunPiSdkCaseOptions,
  RunValidatedSkillViaPiSdkOptions,
} from "./types.js";

export { collectPiSdkRunnableCases, findPiSdkRunnableCase } from "./sdk-case-mapping.js";
export { createPiSdkRunEnvironment } from "./sdk-run-lifecycle.js";

/** Stable session shape used by the injectable Pi SDK runner seam. */
export interface PiSdkSessionLike {
  sessionId: string;
  sessionFile: string | undefined;
  messages: unknown[];
  /** Present on real Pi sessions; optional so tests can inject small fakes. */
  model?: { provider?: unknown; id?: unknown; contextWindow?: unknown };
  /** Present on real Pi sessions. */
  thinkingLevel?: unknown;
  /** Present on real Pi sessions. */
  getContextUsage?: () => unknown;
  subscribe(listener: (event: unknown) => void): () => void;
  prompt(text: string): Promise<void>;
  dispose(): void;
}

export interface PiSdkSessionFactoryOptions {
  workspaceDir: string;
  agentDir: string;
  /** User-supplied eval-owned Pi config directory, if any. Undefined means use normal Pi defaults. */
  configAgentDir?: string;
  sessionDir: string;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  skillFiles: DiscoveredSkillFiles;
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

/**
 * Stable Pi run façade: prepare owned resources, create a session, observe the
 * prompt, assemble the persisted result, then enforce terminal failures.
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
  const appendSystemPrompt = [...(options.appendSystemPrompt ?? [])];
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = [...(options.extraSkillPaths ?? [])];
  const contextMode = options.contextMode ?? "isolated";
  const sandbox = options.sandbox ?? "none";
  const sandboxMocks = options.sandboxMocks ?? [];
  const materializedFixture = await maybeMaterializeCaseFixture(options.skill, options.caseDefinition);
  const workspaceDir = materializedFixture?.workspaceDir ?? environment.workspaceDir;
  const env = materializedFixture?.env ?? {};
  const cleanup = createCaseCleanup(environment, materializedFixture);

  let sessionResult: PiSdkSessionFactoryResult;
  try {
    sessionResult = await (options.createSession ?? createDefaultPiSdkSession)({
      workspaceDir,
      agentDir: environment.agentDir,
      configAgentDir: options.agentDir,
      sessionDir: environment.sessionDir,
      skill: options.skill,
      caseDefinition: options.caseDefinition,
      skillFiles: options.skill.files,
      requestedModel,
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
    skillFiles: options.skill.files,
    agentDir: environment.agentDir,
    attachSkill,
    extraSkillPaths,
    contextMode,
  });
  const result: PiSdkCaseRunResult = {
    source: options.source,
    skill: {
      name: options.skill.contract.skill,
      relativeSkillDir: options.skill.files.relativeSkillDir,
      profile: options.skill.contract.profile,
      targetTier: options.skill.contract.targetTier,
    },
    caseDefinition: options.caseDefinition,
    workspaceDir,
    agentDir: environment.agentDir,
    sessionDir: environment.sessionDir,
    fixture: snapshotFixture(materializedFixture),
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
