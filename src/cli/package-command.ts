import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { readEvalsJson } from "../evals/loader.js";
import { parseSkillFrontmatter } from "./create-command.js";
import { CliCommandError } from "./types.js";

const execFileAsync = promisify(execFile);

export interface PackageCommandOptions {
  skillDir: string;
  output?: string;
  force?: boolean;
}

export interface PackageManifestFileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface PackageManifest {
  name: string;
  description?: string;
  files: PackageManifestFileEntry[];
  created_at: string;
  arc_skill_eval_version: string;
}

export interface PackageCommandResult {
  skillDir: string;
  skillName: string;
  outputPath: string;
  fileCount: number;
  totalBytes: number;
  manifest: PackageManifest;
}

/** Directories that never belong in a distributable skill artifact. */
const EXCLUDED_DIRECTORIES = new Set(["evals-runs", "node_modules"]);

export async function packageCommand(options: PackageCommandOptions): Promise<PackageCommandResult> {
  const skillDir = path.resolve(options.skillDir);

  // Validate everything before writing anything: a broken skill must not
  // produce a partial artifact.
  const skillPath = path.join(skillDir, "SKILL.md");
  let skillText: string;
  try {
    skillText = await readFile(skillPath, "utf8");
  } catch (error) {
    throw new CliCommandError(
      `Could not read SKILL.md at ${skillPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const frontmatter = parseSkillFrontmatter(skillText, skillDir);

  const evalsJsonPath = path.join(skillDir, "evals", "evals.json");
  try {
    await readEvalsJson(evalsJsonPath);
  } catch (error) {
    throw new CliCommandError(
      `Cannot package ${frontmatter.name}: ${describeError(error)}`,
    );
  }

  const outputPath = path.resolve(options.output ?? `${frontmatter.name}.skill.tgz`);
  if (!options.force && existsSync(outputPath)) {
    throw new CliCommandError(`Refusing to overwrite existing artifact: ${outputPath}. Re-run with --force to overwrite.`);
  }

  const relativeFiles = await collectPackageFiles(skillDir);
  const fileEntries: PackageManifestFileEntry[] = [];
  for (const relativePath of relativeFiles) {
    const absolutePath = path.join(skillDir, ...relativePath.split("/"));
    const contents = await readFile(absolutePath);
    fileEntries.push({
      path: relativePath,
      sha256: createHash("sha256").update(contents).digest("hex"),
      bytes: contents.byteLength,
    });
  }

  const manifest: PackageManifest = {
    name: frontmatter.name,
    ...(frontmatter.description !== undefined ? { description: frontmatter.description } : {}),
    files: fileEntries,
    created_at: new Date().toISOString(),
    arc_skill_eval_version: await readArcSkillEvalVersion(),
  };

  // Stage the selected files plus manifest.json under a top-level folder
  // named after the skill, then let system tar produce the artifact.
  const stagingDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-package-"));
  try {
    const stageRoot = path.join(stagingDir, frontmatter.name);
    for (const entry of fileEntries) {
      const source = path.join(skillDir, ...entry.path.split("/"));
      const destination = path.join(stageRoot, ...entry.path.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    await writeFile(path.join(stageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await mkdir(path.dirname(outputPath), { recursive: true });
    try {
      await execFileAsync("tar", ["-czf", outputPath, "-C", stagingDir, frontmatter.name]);
    } catch (error) {
      throw new CliCommandError(
        `tar failed while writing ${outputPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    skillDir,
    skillName: frontmatter.name,
    outputPath,
    fileCount: fileEntries.length,
    totalBytes: fileEntries.reduce((sum, entry) => sum + entry.bytes, 0),
    manifest,
  };
}

/**
 * Walk the skill directory and return the relative (posix-style) paths of
 * every regular file that belongs in the artifact, sorted lexicographically
 * so packaging is deterministic. Excludes evals-runs/, node_modules/, any
 * dot-prefixed file or directory, and previously built *.skill.tgz artifacts.
 */
async function collectPackageFiles(skillDir: string): Promise<string[]> {
  const found: string[] = [];
  await walk(skillDir, "", found);
  found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return found;
}

async function walk(absoluteDir: string, relativePrefix: string, found: string[]): Promise<void> {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      await walk(path.join(absoluteDir, entry.name), relativePath, found);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".skill.tgz")) continue;
    found.push(relativePath);
  }
}

async function readArcSkillEvalVersion(): Promise<string> {
  // Compiled location is dist/cli/package-command.js, so the project
  // package.json sits two directories up from this module.
  const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error && "issues" in error && Array.isArray((error as { issues: unknown }).issues)) {
    const issues = (error as unknown as { issues: string[] }).issues;
    return `${error.message}${issues.length > 0 ? ` — ${issues.join("; ")}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
