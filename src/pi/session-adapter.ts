import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

import type { ModelSelection } from "../contracts/types.js";

export interface PiSessionBootstrapOptions {
  /** Directory used as SettingsManager runtime root (workspace or temp agent dir). */
  runtimeDir: string;
  /** Eval-owned Pi credentials directory. Defaults to {@link getAgentDir}. */
  credentialsAgentDir?: string;
}

export interface PiSessionBootstrap {
  credentialsAgentDir: string;
  settingsManager: SettingsManager;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

/** Shared AuthStorage / ModelRegistry / SettingsManager bootstrap for Pi sessions. */
export function createPiSessionBootstrap(options: PiSessionBootstrapOptions): PiSessionBootstrap {
  const credentialsAgentDir = path.resolve(options.credentialsAgentDir ?? getAgentDir());
  const settingsManager = SettingsManager.create(options.runtimeDir, credentialsAgentDir);
  settingsManager.applyOverrides({ compaction: { enabled: false } });
  const authStorage = AuthStorage.create(path.join(credentialsAgentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(
    authStorage,
    path.join(credentialsAgentDir, "models.json"),
  );

  return { credentialsAgentDir, settingsManager, authStorage, modelRegistry };
}

export function resolvePiModel(
  modelRegistry: ModelRegistry,
  selection: ModelSelection,
): { sdkModel: NonNullable<ReturnType<ModelRegistry["find"]>>; selection: ModelSelection } {
  const sdkModel = modelRegistry.find(selection.provider, selection.id);

  if (!sdkModel) {
    throw new Error(`Unable to resolve Pi model ${selection.provider}/${selection.id}.`);
  }

  return { sdkModel, selection };
}

export interface CreatePiAgentSessionOptions {
  bootstrap: PiSessionBootstrap;
  cwd: string;
  agentDir: string;
  sessionDir: string;
  model?: ReturnType<ModelRegistry["find"]>;
  thinkingLevel?: ModelSelection["thinking"];
  resourceLoader: ResourceLoader;
  noTools?: "all";
  tools?: string[];
  customTools?: ToolDefinition[];
}

export async function createPiAgentSession(options: CreatePiAgentSessionOptions) {
  const { bootstrap } = options;
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir: options.agentDir,
    authStorage: bootstrap.authStorage,
    modelRegistry: bootstrap.modelRegistry,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    noTools: options.noTools,
    tools: options.tools,
    customTools: options.customTools,
    resourceLoader: options.resourceLoader,
    sessionManager: SessionManager.create(options.cwd, options.sessionDir),
    settingsManager: bootstrap.settingsManager,
  });

  return { session };
}

export const ISOLATED_PI_SESSION_RESOURCE_CONFIG = {
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
} as const;

export async function createIsolatedNoSkillsResourceLoader(options: {
  cwd: string;
  agentDir: string;
  settingsManager: SettingsManager;
}): Promise<ResourceLoader> {
  const baseLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager: options.settingsManager,
    ...ISOLATED_PI_SESSION_RESOURCE_CONFIG,
  });
  await baseLoader.reload();
  return baseLoader;
}

export interface RunPiJudgePromptOptions {
  model: ModelSelection;
  credentialsAgentDir?: string;
  prompt: string;
}

async function runPiJudgePromptImpl(options: RunPiJudgePromptOptions): Promise<string> {
  const agentDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-judge-"));

  try {
    const bootstrap = piJudgeSessionDeps.createPiSessionBootstrap({
      runtimeDir: agentDir,
      credentialsAgentDir: options.credentialsAgentDir,
    });
    const { sdkModel } = piJudgeSessionDeps.resolvePiModel(bootstrap.modelRegistry, options.model);
    const resourceLoader = await piJudgeSessionDeps.createIsolatedResourceLoader({
      cwd: agentDir,
      agentDir,
      settingsManager: bootstrap.settingsManager,
    });
    const { session } = await piJudgeSessionDeps.createPiAgentSession({
      bootstrap,
      cwd: agentDir,
      agentDir,
      sessionDir: path.join(agentDir, "sessions"),
      model: sdkModel,
      resourceLoader,
    });

    let assistantText = "";
    const unsubscribe = session.subscribe((event: unknown) => {
      if (isTextDeltaEvent(event)) {
        assistantText += event.assistantMessageEvent.delta;
      }
    });

    try {
      await session.prompt(options.prompt);
    } finally {
      unsubscribe();
      session.dispose();
    }

    if (assistantText.trim().length === 0) {
      throw new Error(
        `Judge model ${options.model.provider}/${options.model.id} returned no output — ` +
          "check that the provider is authenticated, or pass --judge-model.",
      );
    }

    return assistantText;
  } finally {
    await rm(agentDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Mutable seam so tests can mock judge Pi sessions without network. */
export const piJudgeSessionRunner = {
  run: runPiJudgePromptImpl,
};

/** Mutable dependency seam for verifying isolated judge resource loading in tests. */
export const piJudgeSessionDeps = {
  createPiSessionBootstrap,
  resolvePiModel,
  createIsolatedResourceLoader: createIsolatedNoSkillsResourceLoader,
  createPiAgentSession,
};

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
