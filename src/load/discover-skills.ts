import { readdir } from "node:fs/promises";
import path from "node:path";

import type { DiscoveredSkillFiles } from "./source-types.js";

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".github",
  ".husky",
  ".idea",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
]);

export interface DiscoverSkillsOptions {
  ignoredDirs?: Iterable<string>;
}

export async function discoverParticipatingSkills(
  repositoryRoot: string,
  options: DiscoverSkillsOptions = {},
): Promise<DiscoveredSkillFiles[]> {
  const ignoredDirs = new Set(options.ignoredDirs ?? DEFAULT_IGNORED_DIRS);
  const discoveredSkills: DiscoveredSkillFiles[] = [];

  await walkDirectory(repositoryRoot, repositoryRoot, ignoredDirs, discoveredSkills);

  return discoveredSkills.sort((left, right) => left.relativeSkillDir.localeCompare(right.relativeSkillDir));
}

async function walkDirectory(
  repositoryRoot: string,
  currentDir: string,
  ignoredDirs: Set<string>,
  discoveredSkills: DiscoveredSkillFiles[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  const containsSkillDefinition = entries.some((entry) => entry.isFile() && entry.name === "SKILL.md");
  const containsEvalDefinition = entries.some((entry) => entry.isFile() && entry.name === "skill.eval.ts");

  if (containsSkillDefinition && containsEvalDefinition) {
    discoveredSkills.push({
      skillName: path.basename(currentDir),
      skillDir: currentDir,
      relativeSkillDir: toRelativeDirectory(repositoryRoot, currentDir),
      skillDefinitionPath: path.join(currentDir, "SKILL.md"),
      evalDefinitionPath: path.join(currentDir, "skill.eval.ts"),
    });
    return;
  }

  const childDirectories = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !shouldIgnoreDirectory(entry.name, ignoredDirs))
    .map((entry) => path.join(currentDir, entry.name));

  for (const childDirectory of childDirectories) {
    await walkDirectory(repositoryRoot, childDirectory, ignoredDirs, discoveredSkills);
  }
}

function shouldIgnoreDirectory(directoryName: string, ignoredDirs: Set<string>): boolean {
  return ignoredDirs.has(directoryName) || directoryName.startsWith(".");
}

function toRelativeDirectory(repositoryRoot: string, skillDir: string): string {
  const relativePath = path.relative(repositoryRoot, skillDir);
  return relativePath.length > 0 ? relativePath : ".";
}
