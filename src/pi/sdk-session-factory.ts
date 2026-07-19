import { createJustBashCodingTools } from "./just-bash-sandbox.js";
import { createPiSdkCodingTools, createPiSdkResourceLoader } from "./sdk-context-resources.js";
import { normalizeSessionModel } from "./sdk-run-observation.js";
import type { PiSdkSessionFactoryOptions, PiSdkSessionFactoryResult } from "./sdk-runner.js";
import {
  createPiAgentSession,
  createPiSessionBootstrap,
  resolvePiModel,
} from "./session-adapter.js";

/** Internal owner for default SDK session construction at the Pi adapter boundary. */
export async function createDefaultPiSdkSession(
  options: PiSdkSessionFactoryOptions,
): Promise<PiSdkSessionFactoryResult> {
  const bootstrap = createPiSessionBootstrap({
    runtimeDir: options.workspaceDir,
    credentialsAgentDir: options.configAgentDir,
  });
  const { resourceLoader, contextManifest } = await createPiSdkResourceLoader({
    workspaceDir: options.workspaceDir,
    agentDir: options.agentDir,
    settingsManager: bootstrap.settingsManager,
    skillFiles: options.skillFiles,
    caseDefinition: options.caseDefinition,
    telemetryContext: options.telemetryContext,
    appendSystemPrompt: options.appendSystemPrompt,
    attachSkill: options.attachSkill,
    extraSkillPaths: options.extraSkillPaths,
    contextMode: options.contextMode,
  });
  const resolvedModel = options.requestedModel === undefined
    ? undefined
    : resolvePiModel(bootstrap.modelRegistry, options.requestedModel);

  const { session } = await createPiAgentSession({
    bootstrap,
    cwd: options.workspaceDir,
    agentDir: options.agentDir,
    sessionDir: options.sessionDir,
    model: resolvedModel?.sdkModel,
    thinkingLevel: resolvedModel?.selection.thinking,
    noTools: "all",
    tools: ["read", "bash", "edit", "write"],
    customTools:
      options.sandbox === "just-bash"
        ? createJustBashCodingTools(options.workspaceDir, options.env, options.sandboxMocks)
        : createPiSdkCodingTools(options.workspaceDir, options.env),
    resourceLoader,
  });

  return {
    session,
    model: normalizeSessionModel(session.model, session.thinkingLevel) ?? resolvedModel?.selection ?? null,
    contextManifest,
  };
}
