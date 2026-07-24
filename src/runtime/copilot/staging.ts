import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface StageCopilotSkillsOptions {
  workspaceDir: string;
  targetSkill?: {
    name: string;
    skillDir: string;
  };
  attachSkill: boolean;
  extraSkillPaths: string[];
}

/**
 * Stage skills into Copilot discovery trees.
 * Writes `.github/skills`, `.agents/skills`, and `.claude/skills` per GitHub docs.
 */
export async function stageCopilotSkills(options: StageCopilotSkillsOptions): Promise<string[]> {
  const workspaceRoot = path.resolve(options.workspaceDir);
  const roots = [
    path.join(workspaceRoot, ".github", "skills"),
    path.join(workspaceRoot, ".agents", "skills"),
    path.join(workspaceRoot, ".claude", "skills"),
  ];
  const stagedPaths: string[] = [];

  const stageOne = async (skillName: string, skillDir: string) => {
    for (const skillsRoot of roots) {
      const dest = path.join(skillsRoot, skillName);
      await mkdir(dest, { recursive: true });
      await cp(skillDir, dest, { recursive: true, force: true });
      stagedPaths.push(dest);
    }
  };

  if (options.attachSkill && options.targetSkill) {
    await stageOne(options.targetSkill.name, options.targetSkill.skillDir);
  }

  for (const extraSkillPath of options.extraSkillPaths) {
    const resolvedPath = path.resolve(extraSkillPath);
    const skillDir =
      path.basename(resolvedPath) === "SKILL.md" ? path.dirname(resolvedPath) : resolvedPath;
    await stageOne(path.basename(skillDir), skillDir);
  }

  return stagedPaths;
}

export async function cleanupStagedCopilotSkills(stagedPaths: string[]): Promise<void> {
  for (const stagedPath of stagedPaths) {
    await rm(stagedPath, { recursive: true, force: true }).catch(() => undefined);
  }
}
