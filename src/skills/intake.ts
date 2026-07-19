import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_IGNORED_DIRS = new Set([
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
  /** Limit directory walk depth from the repository root. Default: unlimited. */
  maxDepth?: number;
  /** Require SKILL.md adjacent to evals/evals.json. Default: true. */
  requireSkillMd?: boolean;
}

export interface ParsedSkillFrontmatter {
  name?: string;
  description?: string;
  disableModelInvocation: boolean;
}

export interface SkillFrontmatter {
  name: string;
  description?: string;
}

export interface LoadedSkillDefinition {
  skillDir: string;
  skillDefinitionPath: string;
  text: string;
  frontmatter: ParsedSkillFrontmatter;
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
  const requireSkillMd = options.requireSkillMd ?? true;
  const maxDepth = options.maxDepth;
  const discovered: DiscoveredEvalSkill[] = [];

  await walk(repositoryRoot, repositoryRoot, ignored, includeDotDirs, requireSkillMd, maxDepth, 0, discovered);

  return discovered.sort((left, right) =>
    left.relativeSkillDir.localeCompare(right.relativeSkillDir),
  );
}

async function walk(
  repositoryRoot: string,
  currentDir: string,
  ignoredDirs: Set<string>,
  includeDotDirs: boolean,
  requireSkillMd: boolean,
  maxDepth: number | undefined,
  depth: number,
  out: DiscoveredEvalSkill[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const evalsJsonPath = path.join(currentDir, "evals", "evals.json");
  let hasEvalsJson = false;
  try {
    const info = await stat(evalsJsonPath);
    hasEvalsJson = info.isFile();
  } catch {
    // no evals.json at this level.
  }

  const hasSkillMd = entries.some((e) => e.isFile() && e.name === "SKILL.md");
  const qualifies = hasEvalsJson && (!requireSkillMd || hasSkillMd);

  if (qualifies) {
    out.push({
      skillDir: currentDir,
      relativeSkillDir: toRelative(repositoryRoot, currentDir),
      skillDefinitionPath: path.join(currentDir, "SKILL.md"),
      evalsJsonPath,
    });
    return;
  }

  if (maxDepth !== undefined && depth >= maxDepth) {
    return;
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
      requireSkillMd,
      maxDepth,
      depth + 1,
      out,
    );
  }
}

function toRelative(repositoryRoot: string, skillDir: string): string {
  const relative = path.relative(repositoryRoot, skillDir);
  return relative.length > 0 ? relative : ".";
}

export function parseFrontmatter(text: string): ParsedSkillFrontmatter {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = match?.[1] ?? "";
  return {
    name: readYamlStringForAudit(frontmatter, "name"),
    description: readYamlStringForAudit(frontmatter, "description"),
    disableModelInvocation:
      readYamlBoolean(frontmatter, "disable-model-invocation")
      || readYamlBoolean(frontmatter, "disable-model-invoked-skill"),
  };
}

export function parseSkillFrontmatter(skillText: string, skillDir: string): SkillFrontmatter {
  const frontmatterMatch = skillText.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const name = readYamlStringForCreate(frontmatter, "name") ?? path.basename(skillDir);
  const description = readYamlStringForCreate(frontmatter, "description");
  return { name, description };
}

export async function loadSkillDefinition(skillDir: string): Promise<LoadedSkillDefinition> {
  const skillDefinitionPath = path.join(skillDir, "SKILL.md");
  const text = await readFile(skillDefinitionPath, "utf8");
  return {
    skillDir,
    skillDefinitionPath,
    text,
    frontmatter: parseFrontmatter(text),
  };
}

function readYamlStringForAudit(frontmatter: string, key: string): string | undefined {
  const block = readYamlBlockScalarForAudit(frontmatter, key);
  if (block !== undefined) return block;
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, "m"));
  if (!match) return undefined;
  return unquoteYamlScalar(match[1]!.trim());
}

function readYamlBlockScalarForAudit(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => new RegExp(`^${escapeRegExp(key)}\\s*:\\s*[>|]`).test(line));
  if (index === -1) return undefined;
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (/^\S[^:]*:\s*/.test(line)) break;
    if (line.trim() === "") continue;
    if (!/^\s+/.test(line)) break;
    values.push(line.trim());
  }
  const value = values.join(" ").trim();
  return value || undefined;
}

function readYamlStringForCreate(frontmatter: string, key: string): string | undefined {
  const blockValue = readYamlBlockScalarForCreate(frontmatter, key);
  if (blockValue !== undefined) return blockValue;

  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = frontmatter.match(pattern);
  if (!match) return undefined;
  return unquoteYamlScalar(match[1]!.trim());
}

function readYamlBlockScalarForCreate(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => new RegExp(`^${escapeRegExp(key)}\\s*:\\s*[>|]\\s*$`).test(line));
  if (startIndex === -1) return undefined;

  const blockLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^\S[^:]*:\s*/.test(line)) break;
    if (line.trim() === "") {
      blockLines.push("");
      continue;
    }
    if (!/^\s+/.test(line)) break;
    blockLines.push(line.replace(/^\s{2}/, ""));
  }

  const value = blockLines.join("\n").trim();
  return value ? value.replace(/\n+/g, " ") : undefined;
}

function readYamlBoolean(frontmatter: string, key: string): boolean {
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(true|false)\\s*$`, "mi"));
  return match?.[1]?.toLowerCase() === "true";
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
