import { runListCommand } from "./list-command.js";
import { runTestCommand } from "./test-command.js";
import { renderHelp, parseCliArgs } from "./argv.js";
import { formatListResult, formatTestResult, formatValidateResult } from "./render.js";
import { runValidateCommand } from "./validate-command.js";
import { CliCommandError, CliUsageError, type CliInvocationResult } from "./types.js";

export async function runCli(argv: string[]): Promise<CliInvocationResult> {
  try {
    const parsed = parseCliArgs(argv);

    switch (parsed.command) {
      case "help":
        return {
          exitCode: 0,
          stdout: `${renderHelp()}\n`,
          stderr: "",
        };
      case "list": {
        const result = await runListCommand(parsed);
        return {
          exitCode: 0,
          stdout: formatListResult(result, { json: parsed.json }),
          stderr: "",
        };
      }
      case "validate": {
        const result = await runValidateCommand(parsed);
        return {
          exitCode: result.invalidSkills.length > 0 ? 1 : 0,
          stdout: formatValidateResult(result, { json: parsed.json }),
          stderr: "",
        };
      }
      case "test": {
        const result = await runTestCommand(parsed);
        return {
          exitCode: result.report.status === "failed" || result.report.status === "partial" || result.report.invalidSkills.length > 0 ? 1 : 0,
          stdout: formatTestResult(result, { json: parsed.json }),
          stderr: "",
        };
      }
    }
  } catch (error) {
    if (error instanceof CliUsageError || error instanceof CliCommandError) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${error.message}\n`,
      };
    }

    return {
      exitCode: 1,
      stdout: "",
      stderr: `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    };
  }
}
