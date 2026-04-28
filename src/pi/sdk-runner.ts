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
  ParityCase,
  RoutingCase,
} from "../contracts/types.js";
import { PI_BUILTIN_TOOLS, PI_DEFAULT_ACTIVE_TOOLS } from "../observability/artifacts.js";
import type {
  ContextManifestJson,
  ContextSkillAttachment,
  ContextSkillRole,
  EvalContextMode,
} from "../observability/types.js";
import { materializeFixture, type MaterializedFixture } from "../fixtures/index.js";
import type { DiscoveredSkillFiles, ValidatedSkillDiscovery } from "../load/source-types.js";
import type {
  CreatePiSdkRunEnvironmentOptions,
  PiSdkCaseCleanupResult,
  PiSdkCaseRunResult,
  PiSdkExecutionCase,
  PiSdkLiveSmokeCase,
  PiSdkRunEnvironment,
  PiSdkRunEnvironmentCleanupResult,
  PiSdkRunnableCase,
  PiSdkRoutingCase,
  PiSdkSessionArtifact,
  PiSdkSkillCleanupResult,
  PiSdkUsageMetrics,
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

export async function createPiSdkRunEnvironment(
  options: CreatePiSdkRunEnvironmentOptions,
): Promise<PiSdkRunEnvironment> {
  const workspaceDir = path.resolve(options.workspaceDir);
  const agentDir = options.agentDir ? path.resolve(options.agentDir) : await mkdtemp(path.join(tmpdir(), "arc-skill-eval-pi-"));
  const sessionDir = options.sessionDir ? path.resolve(options.sessionDir) : path.join(agentDir, "sessions");
  const ownsAgentDir = options.agentDir === undefined;
  let cleaned = false;

  await mkdir(agentDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  return {
    workspaceDir,
    agentDir,
    sessionDir,
    cleanup: async () => {
      if (!ownsAgentDir || cleaned) {
        return { agentDirRemoved: false };
      }

      await rm(agentDir, { recursive: true, force: true });
      cleaned = true;

      return { agentDirRemoved: true };
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
    ...contract.cliParity.map((definition) => toParityCase(contract, definition)),
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
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = [...(options.extraSkillPaths ?? [])];
  const contextMode = options.contextMode ?? "isolated";
  const materializedFixture = await maybeMaterializeCaseFixture(options.skill, options.caseDefinition);
  const caseWorkspaceDir = materializedFixture?.workspaceDir ?? environment.workspaceDir;
  const caseEnv = materializedFixture?.env ?? {};
  const cleanup = createCaseCleanup(environment, materializedFixture);

  let sessionResult: PiSdkSessionFactoryResult;

  try {
    sessionResult = await createSession({
      workspaceDir: caseWorkspaceDir,
      agentDir: environment.agentDir,
      sessionDir: environment.sessionDir,
      skill: options.skill,
      caseDefinition: options.caseDefinition,
      skillFiles: options.skill.files,
      requestedModel,
      appendSystemPrompt,
      env: caseEnv,
      attachSkill,
      extraSkillPaths,
      contextMode,
    });
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  const { session } = sessionResult;
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
  const usage = collectPiSdkUsageMetrics(session, sessionResult.model);
  const contextManifest = sessionResult.contextManifest ?? buildRequestedContextManifest({
    skillFiles: options.skill.files,
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
    workspaceDir: caseWorkspaceDir,
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
      assistantText,
      messages: snapshotValue([...session.messages]),
      events,
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

async function createDefaultPiSdkSession(
  options: PiSdkSessionFactoryOptions,
): Promise<PiSdkSessionFactoryResult> {
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
  });
  const credentialsAgentDir = getAgentDir();
  const authStorage = AuthStorage.create(path.join(credentialsAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, path.join(credentialsAgentDir, "models.json"));
  const { resourceLoader, contextManifest } = await createPiSdkResourceLoader({
    workspaceDir: options.workspaceDir,
    agentDir: options.agentDir,
    settingsManager,
    skill: options.skill,
    caseDefinition: options.caseDefinition,
    skillFiles: options.skillFiles,
    appendSystemPrompt: options.appendSystemPrompt,
    attachSkill: options.attachSkill,
    extraSkillPaths: options.extraSkillPaths,
    contextMode: options.contextMode,
  });
  const resolvedModel = resolveSdkModelSelection(modelRegistry, options.requestedModel);

  const { session } = await createAgentSession({
    cwd: options.workspaceDir,
    agentDir: options.agentDir,
    authStorage,
    modelRegistry,
    model: resolvedModel?.sdkModel,
    thinkingLevel: resolvedModel?.selection.thinking,
    tools: createPiSdkCodingTools(options.workspaceDir, options.env),
    resourceLoader,
    sessionManager: SessionManager.create(options.workspaceDir, options.sessionDir),
    settingsManager,
  });

  return {
    session,
    model: normalizeSessionModel(session.model, session.thinkingLevel) ?? resolvedModel?.selection ?? null,
    contextManifest,
  };
}

function collectPiSdkUsageMetrics(
  session: PiSdkSessionLike,
  selectedModel: ModelSelection | null,
): PiSdkUsageMetrics {
  const tokenUsage = collectAssistantTokenUsage(session.messages);
  const contextUsage = normalizeContextUsage(session.getContextUsage?.());
  const sessionModel = normalizeSessionModel(session.model, session.thinkingLevel);
  const messageModel = inferModelFromMessages(session.messages);
  const model = sessionModel ?? selectedModel ?? messageModel;
  const thinkingLevel = normalizeThinkingLevel(session.thinkingLevel) ?? model?.thinking ?? null;
  const contextWindowTokens = contextUsage?.contextWindowTokens ?? numericValue(session.model?.contextWindow) ?? null;
  const contextWindowUsedPercent = contextUsage
    ? contextUsage.contextWindowUsedPercent
    : contextWindowTokens && contextWindowTokens > 0
      ? (tokenUsage.totalTokens / contextWindowTokens) * 100
      : null;

  return {
    model,
    thinkingLevel,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    cacheReadTokens: tokenUsage.cacheReadTokens,
    cacheWriteTokens: tokenUsage.cacheWriteTokens,
    totalTokens: tokenUsage.totalTokens,
    estimatedCostUsd: tokenUsage.estimatedCostUsd,
    contextWindowTokens,
    contextWindowUsedPercent,
  };
}

function collectAssistantTokenUsage(messages: unknown[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedCostUsd = 0;

  for (const message of messages) {
    if (!isAssistantMessageWithUsage(message)) continue;
    const usage = message.usage;
    inputTokens += numericField(usage, "input");
    outputTokens += numericField(usage, "output");
    cacheReadTokens += numericField(usage, "cacheRead");
    cacheWriteTokens += numericField(usage, "cacheWrite");
    estimatedCostUsd += numericField(asRecord(usage.cost), "total");
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    estimatedCostUsd,
  };
}

function normalizeSessionModel(
  model: PiSdkSessionLike["model"],
  thinkingLevel: unknown,
): ModelSelection | null {
  if (typeof model !== "object" || model === null) return null;
  const provider = typeof model.provider === "string" ? model.provider : undefined;
  const id = typeof model.id === "string" ? model.id : undefined;
  if (!provider || !id) return null;
  const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel);
  return { provider, id, ...(normalizedThinkingLevel ? { thinking: normalizedThinkingLevel } : {}) };
}

function inferModelFromMessages(messages: unknown[]): ModelSelection | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (typeof message !== "object" || message === null) continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "assistant") continue;
    const provider = typeof record.provider === "string" ? record.provider : undefined;
    const id = typeof record.model === "string" ? record.model : undefined;
    if (provider && id) return { provider, id };
  }
  return null;
}

function normalizeContextUsage(value: unknown): {
  contextWindowTokens: number | null;
  contextWindowUsedPercent: number | null;
} | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    contextWindowTokens: numericValue(record.contextWindow),
    contextWindowUsedPercent: numericValue(record.percent),
  };
}

function normalizeThinkingLevel(value: unknown): PiSdkUsageMetrics["thinkingLevel"] {
  if (typeof value !== "string") return null;
  return ["off", "minimal", "low", "medium", "high", "xhigh"].includes(value)
    ? value as PiSdkUsageMetrics["thinkingLevel"]
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
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
  return numericValue(source[key]) ?? 0;
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface LoadedContextSkill {
  skill: Skill;
  role: ContextSkillRole;
}

async function createPiSdkResourceLoader(options: {
  workspaceDir: string;
  agentDir: string;
  settingsManager: SettingsManager;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  skillFiles: DiscoveredSkillFiles;
  appendSystemPrompt: string[];
  attachSkill: boolean;
  extraSkillPaths: string[];
  contextMode: EvalContextMode;
}): Promise<{ resourceLoader: ResourceLoader; contextManifest: ContextManifestJson }> {
  const ambientEnabled = options.contextMode === "ambient";
  const baseLoader = new DefaultResourceLoader({
    cwd: options.workspaceDir,
    agentDir: options.agentDir,
    settingsManager: options.settingsManager,
    noExtensions: !ambientEnabled,
    extensionFactories: [createPiSessionTelemetryObserverExtension({ skill: options.skill, caseDefinition: options.caseDefinition })],
    noSkills: !ambientEnabled,
    noPromptTemplates: !ambientEnabled,
    noThemes: !ambientEnabled,
    noContextFiles: !ambientEnabled,
  });
  await baseLoader.reload();

  const explicitSkills = loadExplicitContextSkills({
    skillFiles: options.skillFiles,
    attachSkill: options.attachSkill,
    extraSkillPaths: options.extraSkillPaths,
  });
  const contextManifest = buildActualContextManifest({
    mode: options.contextMode,
    explicitSkills,
    ambientSkills: ambientEnabled ? baseLoader.getSkills().skills : [],
  });

  return {
    resourceLoader: {
      getExtensions: () => baseLoader.getExtensions(),
      getSkills: () => {
        const base = ambientEnabled ? baseLoader.getSkills() : { skills: [], diagnostics: [] };
        const skills = dedupeLoadedContextSkills([
          ...explicitSkills,
          ...base.skills.map((skill): LoadedContextSkill => ({ skill, role: "ambient" })),
        ]).map((entry) => entry.skill);

        return { skills, diagnostics: base.diagnostics };
      },
      getPrompts: () => baseLoader.getPrompts(),
      getThemes: () => baseLoader.getThemes(),
      getAgentsFiles: () => ambientEnabled ? baseLoader.getAgentsFiles() : { agentsFiles: [] },
      getSystemPrompt: () => baseLoader.getSystemPrompt(),
      getAppendSystemPrompt: () => [
        ...(ambientEnabled ? baseLoader.getAppendSystemPrompt() : []),
        ...options.appendSystemPrompt,
      ],
      extendResources: (paths) => baseLoader.extendResources(paths),
      reload: async () => { await baseLoader.reload(); },
    },
    contextManifest,
  };
}

function loadExplicitContextSkills(options: {
  skillFiles: DiscoveredSkillFiles;
  attachSkill: boolean;
  extraSkillPaths: string[];
}): LoadedContextSkill[] {
  const explicitSkills: LoadedContextSkill[] = [];

  if (options.attachSkill) {
    explicitSkills.push({ skill: loadSdkSkill(options.skillFiles), role: "target" });
  }

  for (const skillPath of options.extraSkillPaths) {
    for (const skill of loadSdkSkillsFromPath(skillPath)) {
      explicitSkills.push({ skill, role: "extra" });
    }
  }

  return dedupeLoadedContextSkills(explicitSkills);
}

function loadSdkSkillsFromPath(skillPath: string): Skill[] {
  const resolvedPath = path.resolve(skillPath);
  const skillDir = path.basename(resolvedPath) === "SKILL.md" ? path.dirname(resolvedPath) : resolvedPath;
  const loaded = loadSkillsFromDir({
    dir: skillDir,
    source: "arc-skill-eval-extra",
  });

  if (loaded.skills.length === 0) {
    throw new Error(`Unable to load extra Pi skill from ${skillPath}. Expected a skill directory, SKILL.md file, or directory containing skills.`);
  }

  return loaded.skills;
}

function buildActualContextManifest(args: {
  mode: EvalContextMode;
  explicitSkills: LoadedContextSkill[];
  ambientSkills: Skill[];
}): ContextManifestJson {
  const attachedSkills = dedupeLoadedContextSkills([
    ...args.explicitSkills,
    ...args.ambientSkills.map((skill): LoadedContextSkill => ({ skill, role: "ambient" })),
  ]).map(toContextSkillAttachment);

  return {
    runtime: "pi",
    mode: args.mode,
    attached_skills: attachedSkills,
    available_tools: [...PI_BUILTIN_TOOLS],
    active_tools: [...PI_DEFAULT_ACTIVE_TOOLS],
    mcp_tools: [],
    mcp_servers: [],
    ambient: {
      extensions: args.mode === "ambient",
      skills: args.mode === "ambient",
      prompt_templates: args.mode === "ambient",
      themes: args.mode === "ambient",
      context_files: args.mode === "ambient",
    },
  };
}

function buildRequestedContextManifest(args: {
  skillFiles: DiscoveredSkillFiles;
  attachSkill: boolean;
  extraSkillPaths: string[];
  contextMode: EvalContextMode;
}): ContextManifestJson {
  const attachedSkills: ContextSkillAttachment[] = [];

  if (args.attachSkill) {
    attachedSkills.push({
      name: args.skillFiles.skillName,
      path: args.skillFiles.skillDefinitionPath,
      role: "target",
    });
  }

  for (const extraSkillPath of args.extraSkillPaths) {
    const resolvedPath = path.resolve(extraSkillPath);
    const skillPath = path.basename(resolvedPath) === "SKILL.md"
      ? resolvedPath
      : path.join(resolvedPath, "SKILL.md");
    const skillName = path.basename(path.basename(resolvedPath) === "SKILL.md" ? path.dirname(resolvedPath) : resolvedPath);
    attachedSkills.push({ name: skillName, path: skillPath, role: "extra" });
  }

  return {
    runtime: "pi",
    mode: args.contextMode,
    attached_skills: attachedSkills,
    available_tools: [...PI_BUILTIN_TOOLS],
    active_tools: [...PI_DEFAULT_ACTIVE_TOOLS],
    mcp_tools: [],
    mcp_servers: [],
    ambient: {
      extensions: args.contextMode === "ambient",
      skills: args.contextMode === "ambient",
      prompt_templates: args.contextMode === "ambient",
      themes: args.contextMode === "ambient",
      context_files: args.contextMode === "ambient",
    },
  };
}

function dedupeLoadedContextSkills(skills: LoadedContextSkill[]): LoadedContextSkill[] {
  const seen = new Set<string>();
  const deduped: LoadedContextSkill[] = [];

  for (const entry of skills) {
    const key = path.resolve(entry.skill.filePath);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function toContextSkillAttachment(entry: LoadedContextSkill): ContextSkillAttachment {
  return {
    name: entry.skill.name,
    path: entry.skill.filePath,
    role: entry.role,
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

function toParityCase(
  contract: NormalizedSkillEvalContract,
  definition: ParityCase,
) {
  return {
    kind: "cli-parity",
    lane: "cli-parity",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  } as const;
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

async function maybeMaterializeCaseFixture(
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkRunnableCase,
): Promise<MaterializedFixture | null> {
  if (caseDefinition.kind === "routing") {
    return null;
  }

  const fixture = caseDefinition.definition.fixture;

  if (!fixture) {
    return null;
  }

  return await materializeFixture({
    skillFiles: skill.files,
    fixture,
  });
}

function createPiSdkCodingTools(workspaceDir: string, env: Record<string, string>) {
  if (Object.keys(env).length === 0) {
    return createCodingTools(workspaceDir);
  }

  return createCodingTools(workspaceDir, {
    bash: {
      spawnHook: (context) => ({
        ...context,
        env: {
          ...context.env,
          ...env,
        },
      }),
    },
  });
}

function createCaseCleanup(
  environment: PiSdkRunEnvironment,
  materializedFixture: MaterializedFixture | null,
): () => Promise<PiSdkCaseCleanupResult> {
  let cleanupPromise: Promise<PiSdkCaseCleanupResult> | undefined;

  return async () => {
    cleanupPromise ??= (async () => {
      const fixture = materializedFixture ? await materializedFixture.cleanup() : null;
      const environmentResult = await environment.cleanup();
      return {
        fixture,
        environment: environmentResult,
      };
    })();

    return await cleanupPromise;
  };
}

function createSkillCleanup(
  results: PiSdkCaseRunResult[],
  environment: PiSdkRunEnvironment,
): () => Promise<PiSdkSkillCleanupResult> {
  let cleanupPromise: Promise<PiSdkSkillCleanupResult> | undefined;

  return async () => {
    cleanupPromise ??= (async () => {
      const cases: PiSdkSkillCleanupResult["cases"] = [];
      let agentDirRemoved = false;

      for (const result of results) {
        const caseCleanup = await result.cleanup();
        cases.push({
          caseId: result.caseDefinition.caseId,
          fixture: caseCleanup.fixture,
        });
        agentDirRemoved ||= caseCleanup.environment.agentDirRemoved;
      }

      if (!agentDirRemoved) {
        agentDirRemoved = (await environment.cleanup()).agentDirRemoved;
      }

      return {
        cases,
        environment: { agentDirRemoved },
      };
    })();

    return await cleanupPromise;
  };
}

function snapshotFixture(materializedFixture: MaterializedFixture | null): PiSdkCaseRunResult["fixture"] {
  if (!materializedFixture) {
    return null;
  }

  return {
    kind: materializedFixture.kind,
    sourcePath: materializedFixture.sourcePath,
    workspaceDir: materializedFixture.workspaceDir,
    env: snapshotValue(materializedFixture.env),
    setup: snapshotValue(materializedFixture.setup),
    git: snapshotValue(materializedFixture.git),
    external: snapshotValue(materializedFixture.external),
    initialSnapshot: snapshotValue(materializedFixture.initialSnapshot),
  };
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
