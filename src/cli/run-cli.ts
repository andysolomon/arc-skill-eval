import { runEvalsCommand } from "./run-evals-command.js";
import { renderHelp, parseCliArgs } from "./argv.js";
import { formatRunEvalsResult } from "./render.js";
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
      case "run": {
        const result = await runEvalsCommand({
          input: parsed.input,
          skillNames: parsed.skillNames,
          caseIds: parsed.caseIds,
          outputDirOverride: parsed.outputDir,
          iteration: parsed.iteration,
          compare: parsed.compare,
        });
        const failed = result.summary.failedCases > 0 || result.summary.failedAssertions > 0;
        return {
          exitCode: failed ? 1 : 0,
          stdout: formatRunEvalsResult(result, { json: parsed.json }),
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
