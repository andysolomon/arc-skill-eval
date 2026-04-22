import type { ModelSelection } from "../contracts/types.js";
import type {
  DiscoveredSkillFiles,
  InvalidSkillDiscovery,
  RepoSourceDescriptor,
  ValidatedSkillDiscovery,
} from "../load/source-types.js";
import type { PiCliJsonInvoker } from "../pi/types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import type { ArcSkillEvalJsonReport } from "../reporting/types.js";

export interface CommandSelectionOptions {
  skillNames?: string[];
}

export interface ListCommandOptions extends CommandSelectionOptions {
  input: string;
}

export interface ValidateCommandOptions extends CommandSelectionOptions {
  input: string;
}

export interface TestCommandOptions extends CommandSelectionOptions {
  input: string;
  caseIds?: string[];
  includeLiveSmoke?: boolean;
  outputDir?: string;
  html?: boolean;
  model?: ModelSelection;
  appendSystemPrompt?: string[];
  runId?: string;
  generatedAt?: string;
  createSession?: PiSdkSessionFactory;
  invokePiCli?: PiCliJsonInvoker;
}

export interface ListCommandResult {
  source: RepoSourceDescriptor;
  skills: DiscoveredSkillFiles[];
}

export interface ValidateCommandResult {
  source: RepoSourceDescriptor;
  skills: DiscoveredSkillFiles[];
  validSkills: ValidatedSkillDiscovery[];
  invalidSkills: InvalidSkillDiscovery[];
}

export interface TestCommandArtifacts {
  outputDir: string;
  jsonReportPath: string;
  htmlReportPath: string | null;
}

export interface TestCommandResult {
  report: ArcSkillEvalJsonReport;
  artifacts: TestCommandArtifacts;
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

export interface RunEvalsCliOptions extends CommandSelectionOptions {
  input: string;
  caseIds?: string[];
  outputDir?: string;
}

export type ParsedCliCommand =
  | { command: "help" }
  | ({ command: "list"; json?: boolean } & ListCommandOptions)
  | ({ command: "validate"; json?: boolean } & ValidateCommandOptions)
  | ({ command: "test"; json?: boolean } & TestCommandOptions)
  | ({ command: "run"; json?: boolean } & RunEvalsCliOptions);

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
