import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CliCommandError } from "./types.js";

const PACKAGE_NAME = "arc-skill-eval";

let cachedPackageRoot: string | undefined;

/**
 * Resolve the installed package root (directory containing package.json).
 */
export function resolvePackageRoot(): string {
  if (cachedPackageRoot) {
    return cachedPackageRoot;
  }

  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const raw = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string };
        if (raw.name === PACKAGE_NAME) {
          cachedPackageRoot = current;
          return current;
        }
      } catch {
        // Keep walking — malformed or unrelated package.json.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new CliCommandError(
    `Unable to locate the ${PACKAGE_NAME} package root. Reinstall with: npm install --global ${PACKAGE_NAME}`,
  );
}

/**
 * List bundled skill directory names that contain SKILL.md.
 */
export async function listBundledSkills(): Promise<string[]> {
  const skillsDir = path.join(resolvePackageRoot(), "skills");
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch (error) {
    throw new CliCommandError(
      `Bundled skills directory is missing at ${skillsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
    if (existsSync(skillMd)) {
      names.push(entry.name);
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve an absolute path to a bundled skill directory.
 */
export function resolveBundledSkillPath(skillName: string): string {
  const normalized = skillName.trim();
  if (!normalized || normalized.includes(path.sep) || normalized.includes("/")) {
    throw new CliCommandError(`Invalid bundled skill name: ${skillName}`);
  }

  const skillDir = path.join(resolvePackageRoot(), "skills", normalized);
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) {
    throw new CliCommandError(
      `Bundled skill not found: ${normalized}. Run \`arc-skill-eval bundled\` to list available skills.`,
    );
  }

  return skillDir;
}

export interface BundledSkillEntry {
  name: string;
  path: string;
}

export async function listBundledSkillEntries(): Promise<BundledSkillEntry[]> {
  const names = await listBundledSkills();
  return names.map((name) => ({
    name,
    path: resolveBundledSkillPath(name),
  }));
}
