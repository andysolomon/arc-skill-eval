import path from "node:path";

import {
  createCodingTools,
  DefaultResourceLoader,
  loadSkillsFromDir,
  type ResourceLoader,
  type SettingsManager,
  type Skill,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

import { PI_BUILTIN_TOOLS, PI_DEFAULT_ACTIVE_TOOLS } from "../observability/artifacts.js";
import type {
  ContextManifestJson,
  ContextSkillAttachment,
  ContextSkillRole,
  EvalContextMode,
} from "../observability/types.js";
import type { DiscoveredSkillFiles, ValidatedSkillDiscovery } from "../load/source-types.js";
import { createPiSessionTelemetryObserverExtension } from "./observer-extension.js";
import type { PiSdkRunnableCase } from "./types.js";

interface LoadedContextSkill {
  skill: Skill;
  role: ContextSkillRole;
}

/** Internal owner for Pi context resources, explicit skills, and manifests. */
export async function createPiSdkResourceLoader(options: {
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
    agentDir: options.agentDir,
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

export function buildRequestedContextManifest(args: {
  skillFiles: DiscoveredSkillFiles;
  agentDir: string;
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

  return createContextManifest(args.contextMode, args.agentDir, attachedSkills);
}

export function createPiSdkCodingTools(
  workspaceDir: string,
  env: Record<string, string>,
): ToolDefinition[] {
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
  agentDir: string;
  explicitSkills: LoadedContextSkill[];
  ambientSkills: Skill[];
}): ContextManifestJson {
  const attachedSkills = dedupeLoadedContextSkills([
    ...args.explicitSkills,
    ...args.ambientSkills.map((skill): LoadedContextSkill => ({ skill, role: "ambient" })),
  ]).map(toContextSkillAttachment);

  return createContextManifest(args.mode, args.agentDir, attachedSkills);
}

function createContextManifest(
  mode: EvalContextMode,
  agentDir: string,
  attachedSkills: ContextSkillAttachment[],
): ContextManifestJson {
  return {
    runtime: "pi",
    agent_dir: agentDir,
    mode,
    attached_skills: attachedSkills,
    available_tools: [...PI_BUILTIN_TOOLS],
    active_tools: [...PI_DEFAULT_ACTIVE_TOOLS],
    mcp_tools: [],
    mcp_servers: [],
    ambient: {
      extensions: mode === "ambient",
      skills: mode === "ambient",
      prompt_templates: mode === "ambient",
      themes: mode === "ambient",
      context_files: mode === "ambient",
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
