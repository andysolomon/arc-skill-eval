export interface CommandSelectionOptions {
  skillNames?: string[];
}

export interface RunEvalsCliOptions extends CommandSelectionOptions {
  input: string;
  caseIds?: string[];
  outputDir?: string;
  iteration?: string;
  compare?: boolean;
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
