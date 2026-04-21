import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ApplyGitFixtureStateOptions, GitFixtureApplicationResult } from "./types.js";

const execFileAsync = promisify(execFile);

export const FIXTURE_GIT_USER_NAME = "arc-skill-eval";
export const FIXTURE_GIT_USER_EMAIL = "arc-skill-eval@local.test";
export const DEFAULT_FIXTURE_GIT_BRANCH = "main";

export async function applyGitFixtureState(
  options: ApplyGitFixtureStateOptions,
): Promise<GitFixtureApplicationResult | null> {
  const shouldInitializeGit = options.initGit === true || options.git?.enabled === true;

  if (!shouldInitializeGit) {
    return null;
  }

  const git = options.git;
  const env = options.env;
  const defaultBranch = git?.defaultBranch ?? DEFAULT_FIXTURE_GIT_BRANCH;
  const currentBranch = git?.currentBranch ?? defaultBranch;
  const commits = git?.commits ?? [];
  const remotes = git?.remotes ?? [];
  const tagNames: string[] = [];

  await runGit(options.workspaceDir, ["init", "-b", defaultBranch], env);
  await runGit(options.workspaceDir, ["config", "user.name", FIXTURE_GIT_USER_NAME], env);
  await runGit(options.workspaceDir, ["config", "user.email", FIXTURE_GIT_USER_EMAIL], env);

  for (const commit of commits) {
    const paths = Object.keys(commit.files);

    for (const [relativePath, contents] of Object.entries(commit.files)) {
      await writeWorkspaceFile(options.workspaceDir, relativePath, contents);
    }

    if (paths.length > 0) {
      await runGit(options.workspaceDir, ["add", "--", ...paths], env);
    }

    await runGit(options.workspaceDir, ["commit", "--allow-empty", "--no-gpg-sign", "-m", commit.message], env);

    for (const tag of commit.tags ?? []) {
      await runGit(options.workspaceDir, ["tag", tag], env);
      tagNames.push(tag);
    }
  }

  if (currentBranch !== defaultBranch) {
    if (commits.length > 0) {
      await runGit(options.workspaceDir, ["checkout", "-B", currentBranch], env);
    } else {
      await runGit(options.workspaceDir, ["symbolic-ref", "HEAD", `refs/heads/${currentBranch}`], env);
    }
  }

  for (const remote of remotes) {
    await runGit(options.workspaceDir, ["remote", "add", remote.name, remote.url], env);
  }

  for (const [relativePath, contents] of Object.entries(git?.dirtyFiles ?? {})) {
    await writeWorkspaceFile(options.workspaceDir, relativePath, contents);
  }

  if ((git?.stagedFiles?.length ?? 0) > 0) {
    await runGit(options.workspaceDir, ["add", "--", ...(git?.stagedFiles ?? [])], env);
  }

  return {
    enabled: true,
    defaultBranch,
    currentBranch,
    commitCount: commits.length,
    remoteNames: remotes.map((remote) => remote.name),
    tagNames,
  };
}

async function runGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    env,
  });

  return result.stdout.trim();
}

async function writeWorkspaceFile(workspaceDir: string, relativePath: string, contents: string): Promise<void> {
  const absolutePath = path.resolve(workspaceDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}
