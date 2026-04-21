import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
  type Skill,
} from "@mariozechner/pi-coding-agent";

import type {
  ExecutionCase,
  LiveSmokeCase,
  ModelSelection,
  NormalizedSkillEvalContract,
  RoutingCase,
} from "../contracts/types.js";
import type { DiscoveredSkillFiles, ValidatedSkillDiscovery } from "../load/source-types.js";
import type {
  CreatePiSdkRunEnvironmentOptions,
  PiSdkCaseRunResult,
  PiSdkExecutionCase,
  PiSdkLiveSmokeCase,
  PiSdkRunEnvironment,
  PiSdkRunnableCase,
  PiSdkRoutingCase,
  PiSdkSkillRunResult,
  RunPiSdkCaseOptions,
  RunValidatedSkillViaPiSdkOptions,
} from "./types.js";
import { createPiSessionTelemetryObserverExtension } from "./observer-extension.js";
import { loadPiSessionTelemetry } from "./session-telemetry.js";

export interface PiSdkSessionLike {
  sessionId: string;
  sessionFile: string | undefined;
  messages: unknown[];
  subscribe(listener: (event: unknown) => void): () => void;
  prompt(text: string): Promise<void>;
  dispose(): void;
}

export interface PiSdkSessionFactoryOptions {
  workspaceDir: string;
  agentDir: string;
  sessionDir: string;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  skillFiles: DiscoveredSkillFiles;
  requestedModel: ModelSelection | undefined;
  appendSystemPrompt: string[];
}

export interface PiSdkSessionFactoryResult {
  session: PiSdkSessionLike;
  model: ModelSelection | null;
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

export async function createPiSdkRunEnvironment(
  options: CreatePiSdkRunEnvironmentOptions,
): Promise<PiSdkRunEnvironment> {
  const workspaceDir = path.resolve(options.workspaceDir);
  const agentDir = options.agentDir ? path.resolve(options.agentDir) : await mkdtemp(path.join(tmpdir(), "arc-skill-eval-pi-"));
  const sessionDir = options.sessionDir ? path.resolve(options.sessionDir) : path.join(agentDir, "sessions");
  const ownsAgentDir = options.agentDir === undefined;

  await mkdir(agentDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  return {
    workspaceDir,
    agentDir,
    sessionDir,
    cleanup: async () => {
      if (!ownsAgentDir) {
        return;
      }

      await rm(agentDir, { recursive: true, force: true });
    },
  };
}

export function collectPiSdkRunnableCases(contract: NormalizedSkillEvalContract): PiSdkRunnableCase[] {
  return [
    ...contract.routing.explicit.map((definition) => toRoutingCase(contract, "routing-explicit", definition)),
    ...contract.routing.implicitPositive.map((definition) => toRoutingCase(contract, "routing-implicit-positive", definition)),
    ...contract.routing.adjacentNegative.map((definition) => toRoutingCase(contract, "routing-adjacent-negative", definition)),
    ...contract.routing.hardNegative.map((definition) => toRoutingCase(contract, "routing-hard-negative", definition)),
    ...contract.execution.map((definition) => toExecutionCase(contract, definition)),
    ...contract.liveSmoke.map((definition) => toLiveSmokeCase(contract, definition)),
  ];
}

export function findPiSdkRunnableCase(
  contract: NormalizedSkillEvalContract,
  caseId: string,
): PiSdkRunnableCase | undefined {
  return collectPiSdkRunnableCases(contract).find((caseDefinition) => caseDefinition.caseId === caseId);
}

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

  const createSession = options.createSession ?? createDefaultPiSdkSession;
  const requestedModel = resolveRequestedModel(options.skill.contract, options.caseDefinition, options.model);
  const appendSystemPrompt = [...(options.appendSystemPrompt ?? [])];
  const { session, model } = await createSession({
    workspaceDir: environment.workspaceDir,
    agentDir: environment.agentDir,
    sessionDir: environment.sessionDir,
    skill: options.skill,
    caseDefinition: options.caseDefinition,
    skillFiles: options.skill.files,
    requestedModel,
    appendSystemPrompt,
  });

  const events: unknown[] = [];
  let assistantText = "";
  const unsubscribe = session.subscribe((event) => {
    events.push(snapshotValue(event));

    if (isTextDeltaEvent(event)) {
      assistantText += event.assistantMessageEvent.delta;
    }
  });

  const startedAt = new Date();
  let promptError: unknown;

  try {
    await session.prompt(options.caseDefinition.prompt);
  } catch (error) {
    promptError = error;
  }

  unsubscribe();

  const telemetry = await loadTelemetryIfAvailable(session.sessionFile);
  const finishedAt = new Date();
  const result: PiSdkCaseRunResult = {
    source: options.source,
    skill: {
      name: options.skill.contract.skill,
      relativeSkillDir: options.skill.files.relativeSkillDir,
      profile: options.skill.contract.profile,
      targetTier: options.skill.contract.targetTier,
    },
    caseDefinition: options.caseDefinition,
    workspaceDir: environment.workspaceDir,
    agentDir: environment.agentDir,
    sessionDir: environment.sessionDir,
    model,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    session: {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      assistantText,
      messages: snapshotValue([...session.messages]),
      events,
    },
    telemetry,
    cleanup: environment.cleanup,
  };

  session.dispose();

  if (promptError !== undefined) {
    throw new PiSdkCaseRunError(buildPromptFailureMessage(options.caseDefinition.caseId, promptError), result, {
      cause: promptError,
    });
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

  const allCases = collectPiSdkRunnableCases(options.skill.contract);
  const selectedCases = selectPiSdkCases(allCases, options.selectedCaseIds);
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
    cleanup: environment.cleanup,
  };
}

async function createDefaultPiSdkSession(
  options: PiSdkSessionFactoryOptions,
): Promise<PiSdkSessionFactoryResult> {
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
  });
  const credentialsAgentDir = getAgentDir();
  const authStorage = AuthStorage.create(path.join(credentialsAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(credentialsAgentDir, "models.json"));
  const resourceLoader = await createPiSdkResourceLoader({
    workspaceDir: options.workspaceDir,
    agentDir: options.agentDir,
    settingsManager,
    skill: options.skill,
    caseDefinition: options.caseDefinition,
    skillFiles: options.skillFiles,
    appendSystemPrompt: options.appendSystemPrompt,
  });
  const resolvedModel = resolveSdkModelSelection(modelRegistry, options.requestedModel);

  const { session } = await createAgentSession({
    cwd: options.workspaceDir,
    agentDir: options.agentDir,
    authStorage,
    modelRegistry,
    model: resolvedModel?.sdkModel,
    thinkingLevel: resolvedModel?.selection.thinking,
    tools: createCodingTools(options.workspaceDir),
    resourceLoader,
    sessionManager: SessionManager.create(options.workspaceDir, options.sessionDir),
    settingsManager,
  });

  return {
    session,
    model: resolvedModel?.selection ?? null,
  };
}

async function createPiSdkResourceLoader(options: {
  workspaceDir: string;
  agentDir: string;
  settingsManager: SettingsManager;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  skillFiles: DiscoveredSkillFiles;
  appendSystemPrompt: string[];
}): Promise<ResourceLoader> {
  const baseLoader = new DefaultResourceLoader({
    cwd: options.workspaceDir,
    agentDir: options.agentDir,
    settingsManager: options.settingsManager,
    noExtensions: true,
    extensionFactories: [createPiSessionTelemetryObserverExtension({ skill: options.skill, caseDefinition: options.caseDefinition })],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await baseLoader.reload();

  const loadedSkill = loadSdkSkill(options.skillFiles);

  return {
    getExtensions: () => baseLoader.getExtensions(),
    getSkills: () => ({ skills: [loadedSkill], diagnostics: [] }),
    getPrompts: () => baseLoader.getPrompts(),
    getThemes: () => baseLoader.getThemes(),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => baseLoader.getSystemPrompt(),
    getAppendSystemPrompt: () => [...options.appendSystemPrompt],
    extendResources: () => {},
    reload: async () => {},
  };
}

function loadSdkSkill(skillFiles: DiscoveredSkillFiles): Skill {
  const loaded = loadSkillsFromDir({
    dir: skillFiles.skillDir,
    source: "arc-skill-eval",
  });
  const matchedSkill = loaded.skills.find((skill) => skill.name === skillFiles.skillName) ?? loaded.skills[0];

  if (!matchedSkill) {
    throw new Error(`Unable to load Pi skill definition for ${skillFiles.skillName}.`);
  }

  return matchedSkill;
}

function resolveRequestedModel(
  contract: NormalizedSkillEvalContract,
  caseDefinition: PiSdkRunnableCase,
  override: ModelSelection | undefined,
): ModelSelection | undefined {
  if (override !== undefined) {
    return override;
  }

  if (caseDefinition.kind === "execution" && caseDefinition.definition.model !== undefined) {
    return caseDefinition.definition.model;
  }

  return contract.model;
}

function resolveSdkModelSelection(modelRegistry: ModelRegistry, selection: ModelSelection | undefined) {
  if (selection === undefined) {
    return undefined;
  }

  const sdkModel = modelRegistry.find(selection.provider, selection.id);

  if (!sdkModel) {
    throw new Error(`Unable to resolve Pi model ${selection.provider}/${selection.id}.`);
  }

  return {
    sdkModel,
    selection,
  };
}

function selectPiSdkCases(
  allCases: PiSdkRunnableCase[],
  selectedCaseIds: string[] | undefined,
): PiSdkRunnableCase[] {
  if (selectedCaseIds === undefined || selectedCaseIds.length === 0) {
    return allCases;
  }

  const casesById = new Map(allCases.map((caseDefinition) => [caseDefinition.caseId, caseDefinition]));
  const selectedCases: PiSdkRunnableCase[] = [];

  for (const caseId of selectedCaseIds) {
    const caseDefinition = casesById.get(caseId);

    if (!caseDefinition) {
      throw new Error(`Unknown Pi SDK case id: ${caseId}`);
    }

    selectedCases.push(caseDefinition);
  }

  return selectedCases;
}

function toRoutingCase(
  contract: NormalizedSkillEvalContract,
  lane: PiSdkRoutingCase["lane"],
  definition: RoutingCase,
): PiSdkRoutingCase {
  return {
    kind: "routing",
    lane,
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function toExecutionCase(
  contract: NormalizedSkillEvalContract,
  definition: ExecutionCase,
): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function toLiveSmokeCase(
  contract: NormalizedSkillEvalContract,
  definition: LiveSmokeCase,
): PiSdkLiveSmokeCase {
  return {
    kind: "live-smoke",
    lane: "live-smoke",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function isTextDeltaEvent(
  event: unknown,
): event is { type: "message_update"; assistantMessageEvent: { type: "text_delta"; delta: string } } {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "message_update" &&
    "assistantMessageEvent" in event &&
    typeof event.assistantMessageEvent === "object" &&
    event.assistantMessageEvent !== null &&
    "type" in event.assistantMessageEvent &&
    event.assistantMessageEvent.type === "text_delta" &&
    "delta" in event.assistantMessageEvent &&
    typeof event.assistantMessageEvent.delta === "string"
  );
}

async function loadTelemetryIfAvailable(sessionFile: string | undefined) {
  if (!sessionFile) {
    return null;
  }

  try {
    return await loadPiSessionTelemetry(sessionFile);
  } catch {
    return null;
  }
}

function buildPromptFailureMessage(caseId: string, error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return `Pi SDK run failed for case ${caseId}: ${error.message}`;
  }

  return `Pi SDK run failed for case ${caseId}.`;
}

function snapshotValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
