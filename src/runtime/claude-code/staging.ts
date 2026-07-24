import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface StageClaudeSkillsOptions {
  workspaceDir: string;
  targetSkill?: {
    name: string;
    skillDir: string;
  };
  attachSkill: boolean;
  extraSkillPaths: string[];
}

/** Copy skills into Claude Code discovery tree under `.claude/skills/<name>/`. */
export async function stageClaudeSkills(options: StageClaudeSkillsOptions): Promise<string[]> {
  const workspaceRoot = path.resolve(options.workspaceDir);
  const skillsRoot = path.join(workspaceRoot, ".claude", "skills");
  const stagedPaths: string[] = [];

  if (options.attachSkill && options.targetSkill) {
    const dest = path.join(skillsRoot, options.targetSkill.name);
    await mkdir(dest, { recursive: true });
    await cp(options.targetSkill.skillDir, dest, { recursive: true, force: true });
    stagedPaths.push(dest);
  }

  for (const extraSkillPath of options.extraSkillPaths) {
    const resolvedPath = path.resolve(extraSkillPath);
    const skillDir =
      path.basename(resolvedPath) === "SKILL.md" ? path.dirname(resolvedPath) : resolvedPath;
    const skillName = path.basename(skillDir);
    const dest = path.join(skillsRoot, skillName);
    await mkdir(dest, { recursive: true });
    await cp(skillDir, dest, { recursive: true, force: true });
    stagedPaths.push(dest);
  }

  return stagedPaths;
}

export async function cleanupStagedClaudeSkills(stagedPaths: string[]): Promise<void> {
  for (const stagedPath of stagedPaths) {
    await rm(stagedPath, { recursive: true, force: true }).catch(() => undefined);
  }
}
