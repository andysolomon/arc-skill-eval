/**
 * Eval case workspace preparation — single owner for temp-dir creation,
 * setup/files materialization, and idempotent cleanup for every evals.json case.
 */

import { cp, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SeededWorkspaceSetup, WorkspaceSetup } from "../contracts/types.js";
import { materializeFixture } from "../fixtures/materialize.js";
import type { MaterializedFixture } from "../fixtures/types.js";
import type { DiscoveredSkillFiles } from "../load/source-types.js";

export interface PreparedCaseWorkspace {
  workspaceDir: string;
  /** Present when setup.kind === "fixture"; owns fixture env + teardown hooks. */
  materializedFixture?: MaterializedFixture;
  /** Idempotent: fixture teardown + rm of the temp workspace. */
  cleanup: () => Promise<void>;
}

/**
 * Create a temp workspace and materialize `setup` / legacy `files` for one eval case.
 * Caller owns {@link PreparedCaseWorkspace.cleanup} once downstream work finishes.
 */
export async function prepareCaseWorkspace(options: {
  evalsDir: string;
  setup?: WorkspaceSetup;
  files?: string[];
  skillFiles: DiscoveredSkillFiles;
}): Promise<PreparedCaseWorkspace> {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-case-"));
  let workspaceCleaned = false;
  let materializedFixture: MaterializedFixture | undefined;

  const cleanup = async () => {
    if (!workspaceCleaned) {
      workspaceCleaned = true;
      await materializedFixture?.cleanup().catch(() => undefined);
      await rm(workspaceDir, { recursive: true, force: true });
    }
  };

  try {
    if (options.setup) {
      materializedFixture = await materializeWorkspaceSetup({
        evalsDir: options.evalsDir,
        setup: options.setup,
        workspaceDir,
        skillFiles: options.skillFiles,
      });
    }

    if (options.files && options.files.length > 0) {
      await materializeCaseFiles({
        evalsDir: options.evalsDir,
        files: options.files,
        workspaceDir,
      });
    }
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  return {
    workspaceDir,
    materializedFixture,
    cleanup,
  };
}

async function materializeCaseFiles(options: {
  evalsDir: string;
  files: string[];
  workspaceDir: string;
}): Promise<void> {
  await materializeSeededWorkspace({
    evalsDir: options.evalsDir,
    workspaceDir: options.workspaceDir,
    setup: {
      kind: "seeded",
      sources: options.files.map((file) => ({ from: file, to: file })),
      mountMode: "preserve-path",
    },
  });
}

async function materializeWorkspaceSetup(options: {
  evalsDir: string;
  setup: WorkspaceSetup;
  workspaceDir: string;
  skillFiles: DiscoveredSkillFiles;
}): Promise<MaterializedFixture | undefined> {
  switch (options.setup.kind) {
    case "empty":
      return undefined;
    case "seeded":
      await materializeSeededWorkspace({
        evalsDir: options.evalsDir,
        setup: options.setup,
        workspaceDir: options.workspaceDir,
      });
      return undefined;
    case "fixture":
      return await materializeFixture({
        fixture: options.setup.fixture,
        skillFiles: options.skillFiles,
        workspaceDir: options.workspaceDir,
      });
  }
}

async function materializeSeededWorkspace(options: {
  evalsDir: string;
  setup: SeededWorkspaceSetup;
  workspaceDir: string;
}): Promise<void> {
  const mountMode = options.setup.mountMode ?? "preserve-path";

  for (const source of options.setup.sources) {
    const sourcePath = path.resolve(options.evalsDir, source.from);
    const defaultDestination = mountMode === "flatten-contents" ? "." : source.from;
    const destination = source.to ?? defaultDestination;
    const destPath = resolveWorkspaceDestination(options.workspaceDir, destination);

    if (mountMode === "flatten-contents") {
      await copyFlattened(sourcePath, destPath);
    } else {
      await mkdir(path.dirname(destPath), { recursive: true });
      await cp(sourcePath, destPath, { recursive: true, force: true });
    }
  }
}

async function copyFlattened(sourcePath: string, destPath: string): Promise<void> {
  const stats = await lstat(sourcePath);
  if (!stats.isDirectory()) {
    const destStats = await lstat(destPath).catch(() => null);
    const fileDest = destStats?.isDirectory() ? path.join(destPath, path.basename(sourcePath)) : destPath;
    await mkdir(path.dirname(fileDest), { recursive: true });
    await cp(sourcePath, fileDest, { recursive: true, force: true });
    return;
  }

  await mkdir(destPath, { recursive: true });
  const entries = await readdir(sourcePath);
  for (const entry of entries) {
    await cp(path.join(sourcePath, entry), path.join(destPath, entry), {
      recursive: true,
      force: true,
    });
  }
}

function resolveWorkspaceDestination(workspaceDir: string, relativePath: string): string {
  const root = path.resolve(workspaceDir);
  const absolute = path.resolve(root, relativePath);
  const rel = path.relative(root, absolute);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Workspace setup destination escapes workspace: ${relativePath}`);
  }

  return absolute;
}
