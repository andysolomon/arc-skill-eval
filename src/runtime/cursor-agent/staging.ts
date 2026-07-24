import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface StageCursorSkillsOptions {
  workspaceDir: string;
  targetSkill?: {
    name: string;
    skillDir: string;
  };
  attachSkill: boolean;
  extraSkillPaths: string[];
}

/**
 * Stage skills into Cursor discovery trees.
 * Writes both `.cursor/skills/<name>/` and `.agents/skills/<name>/` until the
 * installed CLI skill contract is fully documented.
 */
export async function stageCursorSkills(options: StageCursorSkillsOptions): Promise<string[]> {
  const workspaceRoot = path.resolve(options.workspaceDir);
  const roots = [
    path.join(workspaceRoot, ".cursor", "skills"),
    path.join(workspaceRoot, ".agents", "skills"),
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

export async function cleanupStagedCursorSkills(stagedPaths: string[]): Promise<void> {
  for (const stagedPath of stagedPaths) {
    await rm(stagedPath, { recursive: true, force: true }).catch(() => undefined);
  }
}
