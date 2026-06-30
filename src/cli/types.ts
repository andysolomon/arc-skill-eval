import type { ModelSelection } from "../contracts/types.js";

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
  extraSkillPaths?: string[];
  contextMode?: "isolated" | "ambient";
  model?: ModelSelection;
  judgeModel?: ModelSelection;
}

export interface InitRuntimeCliOptions {
  targetDir: string;
  provider: string;
  model: string;
  force?: boolean;
}

export interface ReviewCliOptions {
  runDir: string;
  output?: string;
  force?: boolean;
}

export interface ImproveCliOptions {
  feedbackPath: string;
  dryRun?: boolean;
  summary?: boolean;
  apply?: boolean;
}

export interface CreateCliOptions {
  skillDir: string;
  force?: boolean;
  dryRun?: boolean;
  summary?: boolean;
  guided?: boolean;
  interactive?: boolean;
  model?: ModelSelection;
  agentDir?: string;
}

export interface BrowseCliOptions {
  input?: string;
  noBaseline?: boolean;
}

export interface AuditCliOptions {
  input: string;
  json?: boolean;
  output?: string;
}

export interface CliRenderOptions {
  json?: boolean;
}

export interface CliInvocationResult {
  exitCode: 0 | 1;
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
  | ({ command: "audit" } & AuditCliOptions);

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
