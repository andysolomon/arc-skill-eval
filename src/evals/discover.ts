import { readdir, stat } from "node:fs/promises";
import path from "node:path";

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

export interface DiscoveredEvalSkill {
  /** Skill directory (parent of SKILL.md). */
  skillDir: string;
  /** `path.relative(repositoryRoot, skillDir)` — or "." when they match. */
  relativeSkillDir: string;
  /** Absolute path to SKILL.md. */
  skillDefinitionPath: string;
  /** Absolute path to evals/evals.json. */
  evalsJsonPath: string;
}

export interface DiscoverEvalSkillsOptions {
  /** Override the default ignored directory set. */
  ignoredDirs?: Iterable<string>;
  /** Also descend into dot-prefixed directories (e.g. `.claude/`). Default: false. */
  includeDotDirs?: boolean;
}

/**
 * Walk a repository and collect skill directories that ship an
 * adjacent `evals/evals.json`. Intentionally separate from the legacy
 * `discoverParticipatingSkills` in `src/load/` so the two formats can
 * coexist until the TS-contract path is retired.
 */
export async function discoverEvalSkills(
  repositoryRoot: string,
  options: DiscoverEvalSkillsOptions = {},
): Promise<DiscoveredEvalSkill[]> {
  const ignored = new Set(options.ignoredDirs ?? DEFAULT_IGNORED_DIRS);
  const includeDotDirs = options.includeDotDirs ?? false;
  const discovered: DiscoveredEvalSkill[] = [];

  await walk(repositoryRoot, repositoryRoot, ignored, includeDotDirs, discovered);

  return discovered.sort((left, right) =>
    left.relativeSkillDir.localeCompare(right.relativeSkillDir),
  );
}

async function walk(
  repositoryRoot: string,
  currentDir: string,
  ignoredDirs: Set<string>,
  includeDotDirs: boolean,
  out: DiscoveredEvalSkill[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const hasSkillMd = entries.some((e) => e.isFile() && e.name === "SKILL.md");
  const evalsDir = entries.find((e) => e.isDirectory() && e.name === "evals");

  if (hasSkillMd && evalsDir) {
    const evalsJsonPath = path.join(currentDir, "evals", "evals.json");
    try {
      const info = await stat(evalsJsonPath);
      if (info.isFile()) {
        out.push({
          skillDir: currentDir,
          relativeSkillDir: toRelative(repositoryRoot, currentDir),
          skillDefinitionPath: path.join(currentDir, "SKILL.md"),
          evalsJsonPath,
        });
        return;
      }
    } catch {
      // no evals.json — keep walking, a deeper dir may still qualify.
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (ignoredDirs.has(entry.name)) continue;
    if (!includeDotDirs && entry.name.startsWith(".")) continue;
    await walk(
      repositoryRoot,
      path.join(currentDir, entry.name),
      ignoredDirs,
      includeDotDirs,
      out,
    );
  }
}

function toRelative(repositoryRoot: string, skillDir: string): string {
  const relative = path.relative(repositoryRoot, skillDir);
  return relative.length > 0 ? relative : ".";
}
