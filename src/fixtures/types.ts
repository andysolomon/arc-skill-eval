import type { ExternalFixtureSpec, FixtureKind, FixtureRef, GitFixtureSpec } from "../contracts/types.js";
import type { DiscoveredSkillFiles } from "../load/source-types.js";

export interface HookExecutionResult {
  phase: "setup" | "teardown";
  command: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failed: boolean;
}

export interface FixtureCleanupResult {
  workspaceDir: string;
  teardown: HookExecutionResult | null;
  workspaceRemoved: boolean;
}

export interface GitFixtureApplicationResult {
  enabled: boolean;
  defaultBranch: string;
  currentBranch: string;
  commitCount: number;
  remoteNames: string[];
  tagNames: string[];
}

export interface MaterializedFixtureDetails {
  kind: FixtureKind;
  sourcePath: string;
  workspaceDir: string;
  env: Record<string, string>;
  setup: HookExecutionResult | null;
  git: GitFixtureApplicationResult | null;
  external: ExternalFixtureSpec | undefined;
}

export interface MaterializedFixture extends MaterializedFixtureDetails {
  cleanup: () => Promise<FixtureCleanupResult>;
}

export interface MaterializeFixtureOptions {
  skillFiles: DiscoveredSkillFiles;
  fixture: FixtureRef;
  workspaceDir?: string;
  baseEnv?: NodeJS.ProcessEnv;
}

export interface ResolveFixtureSourcePathOptions {
  skillFiles: DiscoveredSkillFiles;
  fixture: FixtureRef;
}

export interface RunFixtureHookOptions {
  phase: HookExecutionResult["phase"];
  command: string;
  workspaceDir: string;
  env?: NodeJS.ProcessEnv;
}

export interface ApplyGitFixtureStateOptions {
  workspaceDir: string;
  initGit?: boolean;
  git?: GitFixtureSpec;
  env?: NodeJS.ProcessEnv;
}

export class FixtureMaterializationError extends Error {
  readonly fixture?: MaterializedFixture;
  readonly hookResult?: HookExecutionResult;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      fixture?: MaterializedFixture;
      hookResult?: HookExecutionResult;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "FixtureMaterializationError";
    this.fixture = options?.fixture;
    this.hookResult = options?.hookResult;
  }
}
