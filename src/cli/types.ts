import type { ModelSelection, SandboxMode } from "../contracts/types.js";

export interface CommandSelectionOptions {
  skillNames?: string[];
}

export interface RunEvalsCliOptions extends CommandSelectionOptions {
  input: string;
  caseIds?: string[];
  outputDir?: string;
  iteration?: string;
  agentDir?: string;
  compare?: boolean;
  /** Fail the run (exit 1) on soft assertion misses that otherwise only warn. */
  strict?: boolean;
  laminar?: boolean;
  extraSkillPaths?: string[];
  contextMode?: "isolated" | "ambient";
  sandbox?: SandboxMode;
  model?: ModelSelection;
  judgeModel?: ModelSelection;
  /** Harness runtime id (default pi-sdk). */
  runtime?: string;
  /** `--case-timeout <seconds>`, converted to milliseconds. */
  caseTimeoutMs?: number;
  /** `--concurrency <n>`: how many cases run at once (default 1). */
  concurrency?: number;
}

export interface InitRuntimeCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  targetDir: string;
  provider: string;
  model: string;
  force?: boolean;
}

export interface ReviewCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  runDir: string;
  output?: string;
  force?: boolean;
}

export interface ImproveCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  feedbackPath: string;
  dryRun?: boolean;
  summary?: boolean;
  apply?: boolean;
}

export interface CreateCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  skillDir: string;
  force?: boolean;
  dryRun?: boolean;
  summary?: boolean;
  guided?: boolean;
  interactive?: boolean;
  model?: ModelSelection;
  agentDir?: string;
  authoringSkillPath?: string;
}

export interface BrowseCliOptions {
  input?: string;
  noBaseline?: boolean;
}

export interface OptimizeDescriptionCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  skillDir: string;
  generateOnly?: boolean;
  evalSetPath?: string;
  output?: string;
  force?: boolean;
  model?: ModelSelection;
  agentDir?: string;
  maxIterations?: number;
  apply?: boolean;
  distractorDirs?: string[];
}

export interface AuditCliOptions {
  input: string;
  json?: boolean;
  output?: string;
}

export interface PackageCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  skillDir: string;
  output?: string;
  force?: boolean;
}

export interface BundledCliOptions {
  skillName?: string;
  json?: boolean;
}

export interface EmitCliOptions {
  /** Print a machine-readable JSON result on stdout (see docs/cli-json-contract.md). */
  json?: boolean;
  from?: string;
  out?: string;
  skillDir?: string;
  check?: boolean;
}

export interface InstallSkillsCliOptions {
  target?: string;
  harnesses: import("./install-skills-command.js").InstallHarnessId[];
  skills: string[];
  force?: boolean;
  json?: boolean;
}

export interface CliRenderOptions {
  json?: boolean;
}

export interface CliInvocationResult {
  /** 130 = cancelled with Ctrl-C (128 + SIGINT). */
  exitCode: 0 | 1 | 130;
  stdout: string;
  stderr: string;
}

export interface HelpCommandResult {
  text: string;
}

export type ParsedCliCommand =
  | { command: "help" }
  | ({ command: "run"; json?: boolean } & RunEvalsCliOptions)
  | ({ command: "init-runtime" } & InitRuntimeCliOptions)
  | ({ command: "review" } & ReviewCliOptions)
  | ({ command: "improve" } & ImproveCliOptions)
  | ({ command: "create" } & CreateCliOptions)
  | ({ command: "browse" } & BrowseCliOptions)
  | ({ command: "audit" } & AuditCliOptions)
  | ({ command: "optimize-description" } & OptimizeDescriptionCliOptions)
  | ({ command: "package" } & PackageCliOptions)
  | ({ command: "bundled" } & BundledCliOptions)
  | ({ command: "emit" } & EmitCliOptions)
  | ({ command: "install-skills" } & InstallSkillsCliOptions);

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export class CliCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliCommandError";
  }
}
