import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { loadAndValidateLocalRepo, loadLocalRepo } from "./local-loader.js";
import type {
  GitRepoInput,
  GitRepoLoadResult,
  GitRepoRequest,
  ValidatedGitRepoLoadResult,
} from "./source-types.js";

interface ResolvedGitRepoRequest {
  cloneUrl: string;
  displayName: string;
  input: string;
  requestedRef: string | null;
}

export async function loadGitRepo(input: GitRepoInput): Promise<GitRepoLoadResult> {
  const request = resolveGitRepoRequest(input);
  const tempDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-git-loader-"));
  const cloneDir = path.join(tempDir, "repo");

  try {
    cloneRepository(cloneDir, request.cloneUrl, request.requestedRef);
    const loadedRepo = await loadLocalRepo(cloneDir);

    return {
      ...loadedRepo,
      source: {
        ...loadedRepo.source,
        kind: "git",
        input: request.input,
        displayName: request.displayName,
      },
      tempDir,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw toGitLoadError(request, error);
  }
}

export async function loadAndValidateGitRepo(input: GitRepoInput): Promise<ValidatedGitRepoLoadResult> {
  const request = resolveGitRepoRequest(input);
  const tempDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-git-loader-"));
  const cloneDir = path.join(tempDir, "repo");

  try {
    cloneRepository(cloneDir, request.cloneUrl, request.requestedRef);
    const loadedRepo = await loadAndValidateLocalRepo(cloneDir);

    return {
      ...loadedRepo,
      source: {
        ...loadedRepo.source,
        kind: "git",
        input: request.input,
        displayName: request.displayName,
      },
      tempDir,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw toGitLoadError(request, error);
  }
}

function cloneRepository(targetDir: string, cloneUrl: string, requestedRef: string | null): void {
  runGit(["clone", cloneUrl, targetDir]);

  if (requestedRef !== null) {
    runGit(["checkout", requestedRef], targetDir);
  }
}

function resolveGitRepoRequest(input: GitRepoInput): ResolvedGitRepoRequest {
  if (typeof input === "string") {
    return resolveGitRepoString(input);
  }

  return {
    cloneUrl: normalizeCloneUrl(input.url),
    displayName: input.displayName ?? inferDisplayName(input.url),
    input: input.ref ? `${input.url}@${input.ref}` : input.url,
    requestedRef: input.ref ?? null,
  };
}

function resolveGitRepoString(input: string): ResolvedGitRepoRequest {
  if (input.startsWith("github:")) {
    const repoSpec = input.slice("github:".length);
    const separatorIndex = repoSpec.indexOf("@");
    const ownerAndRepo = separatorIndex >= 0 ? repoSpec.slice(0, separatorIndex) : repoSpec;
    const requestedRef = separatorIndex >= 0 ? repoSpec.slice(separatorIndex + 1) : null;

    return {
      cloneUrl: `https://github.com/${ownerAndRepo}.git`,
      displayName: ownerAndRepo,
      input,
      requestedRef,
    };
  }

  return {
    cloneUrl: normalizeCloneUrl(input),
    displayName: inferDisplayName(input),
    input,
    requestedRef: null,
  };
}

function normalizeCloneUrl(url: string): string {
  return url.startsWith("git+") ? url.slice(4) : url;
}

function inferDisplayName(url: string): string {
  const normalizedUrl = normalizeCloneUrl(url).replace(/\/$/, "");
  const lastPathSegment = normalizedUrl.split(/[/:]/).filter(Boolean).at(-1) ?? normalizedUrl;
  return lastPathSegment.endsWith(".git") ? lastPathSegment.slice(0, -4) : lastPathSegment;
}

function runGit(args: string[], cwd?: string): void {
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function toGitLoadError(request: ResolvedGitRepoRequest, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`Failed to load git repo ${request.input}: ${error.message}`);
  }

  return new Error(`Failed to load git repo ${request.input}.`);
}
