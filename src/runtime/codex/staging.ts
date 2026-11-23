import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { copySkillForAgent } from "../stage-skill.js";

export interface StageCodexSkillsOptions {
  workspaceDir: string;
  targetSkill?: {
    name: string;
    skillDir: string;
  };
  attachSkill: boolean;
  extraSkillPaths: string[];
}

/** Copy skills into Codex discovery tree under `.agents/skills/<name>/`. */
export async function stageCodexSkills(options: StageCodexSkillsOptions): Promise<string[]> {
  const workspaceRoot = path.resolve(options.workspaceDir);
  const skillsRoot = path.join(workspaceRoot, ".agents", "skills");
  const stagedPaths: string[] = [];

  if (options.attachSkill && options.targetSkill) {
    const dest = path.join(skillsRoot, options.targetSkill.name);
    await mkdir(dest, { recursive: true });
    await copySkillForAgent(options.targetSkill.skillDir, dest);
    stagedPaths.push(dest);
  }

  for (const extraSkillPath of options.extraSkillPaths) {
    const resolvedPath = path.resolve(extraSkillPath);
    const skillDir =
      path.basename(resolvedPath) === "SKILL.md" ? path.dirname(resolvedPath) : resolvedPath;
    const skillName = path.basename(skillDir);
    const dest = path.join(skillsRoot, skillName);
    await mkdir(dest, { recursive: true });
    await copySkillForAgent(skillDir, dest);
    stagedPaths.push(dest);
  }

  return stagedPaths;
}

export async function cleanupStagedCodexSkills(stagedPaths: string[]): Promise<void> {
  for (const stagedPath of stagedPaths) {
    await rm(stagedPath, { recursive: true, force: true }).catch(() => undefined);
  }
}
