import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { validateAndNormalizeSkillEvalContract } from "../contracts/normalize.js";
import type { ValidationIssue } from "../contracts/types.js";
import { discoverParticipatingSkills } from "./discover-skills.js";
import { loadSkillEvalContractModule } from "./load-skill-contract.js";
import type {
  GitResolutionMetadata,
  LocalRepoLoadResult,
  RepoSourceDescriptor,
  ValidatedLocalRepoLoadResult,
} from "./source-types.js";

export async function loadLocalRepo(inputPath: string): Promise<LocalRepoLoadResult> {
  const requestedPath = await resolveDirectoryPath(inputPath);
  const source = buildLocalSourceDescriptor(inputPath, requestedPath);
  const skills = await discoverParticipatingSkills(source.repositoryRoot);

  return {
    source,
    skills,
  };
}

export async function loadAndValidateLocalRepo(inputPath: string): Promise<ValidatedLocalRepoLoadResult> {
  const loadedRepo = await loadLocalRepo(inputPath);
  const validSkills: ValidatedLocalRepoLoadResult["validSkills"] = [];
  const invalidSkills: ValidatedLocalRepoLoadResult["invalidSkills"] = [];

  for (const skill of loadedRepo.skills) {
    try {
      const rawContract = await loadSkillEvalContractModule(skill.evalDefinitionPath);
      const validationResult = validateAndNormalizeSkillEvalContract(rawContract);

      if (validationResult.ok) {
        validSkills.push({
          files: skill,
          contract: validationResult.value,
        });
        continue;
      }

      invalidSkills.push({
        files: skill,
        issues: validationResult.issues,
      });
    } catch (error) {
      invalidSkills.push({
        files: skill,
        issues: [toLoadFailureIssue(error)],
      });
    }
  }

  return {
    ...loadedRepo,
    validSkills,
    invalidSkills,
  };
}

async function resolveDirectoryPath(inputPath: string): Promise<string> {
  const resolvedPath = await realpath(inputPath);
  const pathStats = await stat(resolvedPath);

  if (!pathStats.isDirectory()) {
    throw new Error(`Local repo path must resolve to a directory: ${inputPath}`);
  }

  return resolvedPath;
}

function buildLocalSourceDescriptor(inputPath: string, requestedPath: string): RepoSourceDescriptor {
  const git = resolveGitMetadata(requestedPath);
  const repositoryRoot = git?.rootDir ?? requestedPath;

  return {
    kind: "local",
    input: inputPath,
    repositoryRoot,
    displayName: path.basename(repositoryRoot),
    resolvedRef: git?.commitSha ?? null,
    git,
  };
}

function resolveGitMetadata(startDir: string): GitResolutionMetadata | null {
  const rootDir = runGit(startDir, ["rev-parse", "--show-toplevel"]);

  if (rootDir === null) {
    return null;
  }

  return {
    rootDir,
    commitSha: runGit(rootDir, ["rev-parse", "HEAD"]),
    branch: normalizeBranchName(runGit(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"])),
    originUrl: runGit(rootDir, ["remote", "get-url", "origin"]),
  };
}

function runGit(cwd: string, args: string[]): string | null {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function normalizeBranchName(branch: string | null): string | null {
  if (branch === null || branch === "HEAD") {
    return null;
  }

  return branch;
}

function toLoadFailureIssue(error: unknown): ValidationIssue {
  if (error instanceof Error) {
    return {
      path: "$",
      code: "load.failed",
      message: error.message,
    };
  }

  return {
    path: "$",
    code: "load.failed",
    message: "Unknown error while loading local skill contract.",
  };
}
