import { access, readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadAndValidateGitRepo,
  loadAndValidateLocalRepo,
  loadGitRepo,
  loadLocalRepo,
  type DiscoveredSkillFiles,
  type InvalidSkillDiscovery,
  type LocalRepoLoadResult,
  type ValidatedLocalRepoLoadResult,
  type ValidatedSkillDiscovery,
} from "../load/index.js";
import { CliCommandError } from "./types.js";

interface ManagedCommandLoad<T> {
  result: T;
  cleanup: () => Promise<void>;
}

export async function loadRepoForList(input: string): Promise<ManagedCommandLoad<LocalRepoLoadResult>> {
  if (await isExistingLocalPath(input)) {
    return {
      result: await loadLocalRepo(input),
      cleanup: async () => {},
    };
  }

  if (isGitLikeInput(input)) {
    const result = await loadGitRepo(input);
    return {
      result,
      cleanup: result.cleanup,
    };
  }

  throw new CliCommandError(
    `Unable to resolve source ${input}. Pass an existing local path or a supported git reference such as github:owner/repo@ref.`,
  );
}

export async function loadRepoForValidation(input: string): Promise<ManagedCommandLoad<ValidatedLocalRepoLoadResult>> {
  if (await isExistingLocalPath(input)) {
    return {
      result: await loadAndValidateLocalRepo(input),
      cleanup: async () => {},
    };
  }

  if (isGitLikeInput(input)) {
    const result = await loadAndValidateGitRepo(input);
    return {
      result,
      cleanup: result.cleanup,
    };
  }

  throw new CliCommandError(
    `Unable to resolve source ${input}. Pass an existing local path or a supported git reference such as github:owner/repo@ref.`,
  );
}

export function selectDiscoveredSkills(
  skills: DiscoveredSkillFiles[],
  requestedSkillNames: string[] | undefined,
): DiscoveredSkillFiles[] {
  validateRequestedSkillNames(skills.map((skill) => skill.skillName), requestedSkillNames);

  if (!requestedSkillNames?.length) {
    return skills;
  }

  const requested = new Set(requestedSkillNames);
  return skills.filter((skill) => requested.has(skill.skillName));
}

export function selectValidatedSkills(
  result: Pick<ValidatedLocalRepoLoadResult, "skills" | "validSkills" | "invalidSkills">,
  requestedSkillNames: string[] | undefined,
): Pick<ValidatedLocalRepoLoadResult, "skills" | "validSkills" | "invalidSkills"> {
  validateRequestedSkillNames(result.skills.map((skill) => skill.skillName), requestedSkillNames);

  if (!requestedSkillNames?.length) {
    return result;
  }

  const requested = new Set(requestedSkillNames);

  return {
    skills: result.skills.filter((skill) => requested.has(skill.skillName)),
    validSkills: result.validSkills.filter((skill) => requested.has(skill.files.skillName)),
    invalidSkills: result.invalidSkills.filter((skill) => requested.has(skill.files.skillName)),
  };
}

export function ensureNonEmptySelection(
  skills: DiscoveredSkillFiles[],
  message: string,
): void {
  if (skills.length === 0) {
    throw new CliCommandError(message);
  }
}

export function collectMissingCaseIds(
  validSkills: ValidatedSkillDiscovery[],
  requestedCaseIds: string[] | undefined,
  includeLiveSmoke: boolean,
  collectCases: (skill: ValidatedSkillDiscovery, includeLiveSmoke: boolean) => string[],
): string[] {
  if (!requestedCaseIds?.length) {
    return [];
  }

  const availableCaseIds = new Set(
    validSkills.flatMap((skill) => collectCases(skill, includeLiveSmoke)),
  );

  return requestedCaseIds.filter((caseId) => !availableCaseIds.has(caseId));
}

export async function resolveFrameworkVersion(): Promise<string | null> {
  try {
    const packageFile = await readFile(new URL("../../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(packageFile) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

export function resolveReportOutputDir(outputDir: string | undefined, runId: string): string {
  return path.resolve(outputDir ?? path.join(process.cwd(), ".arc-skill-eval", "reports", runId));
}

export function formatIssueList(invalidSkills: InvalidSkillDiscovery[]): string[] {
  const lines: string[] = [];

  for (const skill of invalidSkills) {
    lines.push(`- ${skill.files.skillName} (${skill.files.relativeSkillDir})`);

    for (const issue of skill.issues) {
      lines.push(`    - ${issue.path}: ${issue.code} — ${issue.message}`);
    }
  }

  return lines;
}

async function isExistingLocalPath(input: string): Promise<boolean> {
  try {
    await access(input);
    return true;
  } catch {
    return false;
  }
}

function validateRequestedSkillNames(allSkillNames: string[], requestedSkillNames: string[] | undefined): void {
  if (!requestedSkillNames?.length) {
    return;
  }

  const available = new Set(allSkillNames);
  const missing = requestedSkillNames.filter((name) => !available.has(name));

  if (missing.length > 0) {
    throw new CliCommandError(`Unknown skill name(s): ${missing.join(", ")}.`);
  }
}

function isGitLikeInput(input: string): boolean {
  return (
    input.startsWith("github:") ||
    /^(?:git\+)?https?:\/\//u.test(input) ||
    /^(?:git|ssh):\/\//u.test(input) ||
    /^git@[^:]+:[^\s]+$/u.test(input) ||
    /\.git(?:#.*)?$/u.test(input)
  );
}
