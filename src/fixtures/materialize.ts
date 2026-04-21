import { cp, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { applyGitFixtureState } from "./git-state.js";
import type {
  FixtureCleanupResult,
  HookExecutionResult,
  MaterializeFixtureOptions,
  MaterializedFixture,
  ResolveFixtureSourcePathOptions,
  RunFixtureHookOptions,
} from "./types.js";
import { FixtureMaterializationError } from "./types.js";

export async function materializeFixture(options: MaterializeFixtureOptions): Promise<MaterializedFixture> {
  const sourcePath = resolveFixtureSourcePath(options);
  const sourceStats = await lstat(sourcePath).catch(() => null);

  if (!sourceStats) {
    throw new Error(`Fixture source does not exist: ${sourcePath}`);
  }

  if (!sourceStats.isDirectory()) {
    throw new Error(`Fixture source must be a directory: ${sourcePath}`);
  }

  const workspaceDir = options.workspaceDir
    ? path.resolve(options.workspaceDir)
    : await mkdtemp(path.join(tmpdir(), "arc-skill-eval-fixture-"));
  const ownsWorkspaceDir = options.workspaceDir === undefined;
  const env = { ...(options.fixture.env ?? {}) };
  const mergedEnv = {
    ...(options.baseEnv ?? process.env),
    ...env,
  };

  await mkdir(workspaceDir, { recursive: true });
  await copyDirectoryContents(sourcePath, workspaceDir);

  const git = await applyGitFixtureState({
    workspaceDir,
    initGit: options.fixture.initGit,
    git: options.fixture.git,
    env: mergedEnv,
  });

  let cleanupResult: FixtureCleanupResult | undefined;
  const materialized: MaterializedFixture = {
    kind: options.fixture.kind,
    sourcePath,
    workspaceDir,
    env,
    setup: null,
    git,
    external: options.fixture.external,
    cleanup: async () => {
      if (cleanupResult) {
        return cleanupResult;
      }

      const teardown = options.fixture.teardown
        ? await runFixtureHook({
            phase: "teardown",
            command: options.fixture.teardown,
            workspaceDir,
            env: mergedEnv,
          })
        : null;

      if (ownsWorkspaceDir) {
        await rm(workspaceDir, { recursive: true, force: true });
      }

      cleanupResult = {
        workspaceDir,
        teardown,
        workspaceRemoved: ownsWorkspaceDir,
      };

      return cleanupResult;
    },
  };

  if (options.fixture.setup) {
    materialized.setup = await runFixtureHook({
      phase: "setup",
      command: options.fixture.setup,
      workspaceDir,
      env: mergedEnv,
    });

    if (materialized.setup.failed) {
      throw new FixtureMaterializationError(
        `Fixture setup hook failed for ${options.skillFiles.skillName}: ${options.fixture.setup}`,
        {
          fixture: materialized,
          hookResult: materialized.setup,
        },
      );
    }
  }

  return materialized;
}

export function resolveFixtureSourcePath(options: ResolveFixtureSourcePathOptions): string {
  const source = options.fixture.source;
  return path.isAbsolute(source) ? path.resolve(source) : path.resolve(options.skillFiles.skillDir, source);
}

export async function runFixtureHook(options: RunFixtureHookOptions): Promise<HookExecutionResult> {
  const shell = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : process.env.SHELL ?? "/bin/sh";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", options.command] : ["-lc", options.command];
  const startedAt = new Date();

  const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(shell, args, {
      cwd: options.workspaceDir,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });

  const finishedAt = new Date();

  return {
    phase: options.phase,
    command: options.command,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.exitCode !== 0,
  };
}

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  const entries = await readdir(sourceDir);

  for (const entry of entries) {
    await cp(path.join(sourceDir, entry), path.join(targetDir, entry), {
      recursive: true,
      force: true,
    });
  }
}
