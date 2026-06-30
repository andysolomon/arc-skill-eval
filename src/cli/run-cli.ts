import { initRuntimeCommand } from "./init-runtime-command.js";
import { reviewCommand } from "./review-command.js";
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
      case "init-runtime": {
        const result = await initRuntimeCommand({
          targetDir: parsed.targetDir,
          provider: parsed.provider,
          model: parsed.model,
          force: parsed.force,
        });
        const action = result.overwritten ? "Updated" : "Created";
        return {
          exitCode: 0,
          stdout: `${action} eval runtime at ${result.targetDir}\n- ${result.modelsPath}\n- ${result.settingsPath}\n\nRun with:\narc-skill-eval run <skill-dir> --agent-dir ${result.targetDir}\n`,
          stderr: "",
        };
      }
      case "review": {
        const result = await reviewCommand({ runDir: parsed.runDir, output: parsed.output, force: parsed.force });
        return {
          exitCode: 0,
          stdout: `Created review for ${result.caseCount} case(s) at ${result.reviewPath}\nFeedback template: ${result.feedbackPath}\n`,
          stderr: "",
        };
      }
      case "run": {
        const result = await runEvalsCommand({
          input: parsed.input,
          skillNames: parsed.skillNames,
          caseIds: parsed.caseIds,
          outputDirOverride: parsed.outputDir,
          iteration: parsed.iteration,
          agentDir: parsed.agentDir,
          compare: parsed.compare,
          extraSkillPaths: parsed.extraSkillPaths,
          contextMode: parsed.contextMode,
          model: parsed.model,
          judgeModel: parsed.judgeModel,
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
