import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

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
  /** Pi model catalog plus credentials (`auth.json`) and `models.json` overrides. */
  modelRuntime: ModelRuntime;
}

export type PiSdkModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

/** Shared ModelRuntime / SettingsManager bootstrap for Pi sessions. */
export async function createPiSessionBootstrap(options: PiSessionBootstrapOptions): Promise<PiSessionBootstrap> {
  const credentialsAgentDir = path.resolve(options.credentialsAgentDir ?? getAgentDir());
  const settingsManager = SettingsManager.create(options.runtimeDir, credentialsAgentDir);
  settingsManager.applyOverrides({ compaction: { enabled: false } });
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(credentialsAgentDir, "auth.json"),
    modelsPath: path.join(credentialsAgentDir, "models.json"),
  });

  return { credentialsAgentDir, settingsManager, modelRuntime };
}

export function resolvePiModel(
  modelRuntime: Pick<ModelRuntime, "getModel" | "getModels">,
  selection: ModelSelection,
): { sdkModel: PiSdkModel; selection: ModelSelection } {
  const sdkModel = modelRuntime.getModel(selection.provider, selection.id);

  if (!sdkModel) {
    throw new Error(describeUnresolvedModel(modelRuntime, selection));
  }

  return { sdkModel, selection };
}

/** "Unable to resolve" plus the models Pi does know for that provider, so the fix is obvious. */
export function describeUnresolvedModel(
  modelRuntime: Pick<ModelRuntime, "getModels">,
  selection: Pick<ModelSelection, "provider" | "id">,
): string {
  const known = modelRuntime.getModels(selection.provider).map((model) => model.id);
  const base = `Unable to resolve Pi model ${selection.provider}/${selection.id}.`;
  if (known.length === 0) {
    return `${base} Pi knows no models for provider "${selection.provider}". ` +
      "Check the provider name, or register it in models.json (see Runtime and models in the docs).";
  }
  const shown = known.slice(0, 12).join(", ");
  const more = known.length > 12 ? `, … (${known.length - 12} more)` : "";
  return `${base} Known ${selection.provider} models: ${shown}${more}. ` +
    "For a model newer than the bundled catalog, register it in models.json (see Runtime and models in the docs).";
}

export interface CreatePiAgentSessionOptions {
  bootstrap: PiSessionBootstrap;
  cwd: string;
  agentDir: string;
  sessionDir: string;
  model?: PiSdkModel;
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
    modelRuntime: bootstrap.modelRuntime,
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
    const bootstrap = await piJudgeSessionDeps.createPiSessionBootstrap({
      runtimeDir: agentDir,
      credentialsAgentDir: options.credentialsAgentDir,
    });
    const { sdkModel } = piJudgeSessionDeps.resolvePiModel(bootstrap.modelRuntime, options.model);
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
