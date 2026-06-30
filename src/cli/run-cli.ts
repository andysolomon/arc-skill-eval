import { auditCommand, renderAuditMarkdown } from "./audit-command.js";
import { browseCommand } from "./browse-command.js";
import { createCommand, type CreateCommandResult } from "./create-command.js";
import { improveCommand, type ImproveCommandResult } from "./improve-command.js";
import { initRuntimeCommand } from "./init-runtime-command.js";
import { reviewCommand } from "./review-command.js";
import { runEvalsCommand } from "./run-evals-command.js";
import { renderHelp, parseCliArgs } from "./argv.js";
import { formatRunEvalsResult } from "./render.js";
import { CliCommandError, CliUsageError, type CliInvocationResult } from "./types.js";

function formatImproveSummary(result: ImproveCommandResult): string {
  const lines = [
    `${result.applied ? "Applied" : "Proposed"} ${result.suggestions.length} eval improvement suggestion${result.suggestions.length === 1 ? "" : "s"}`,
    "",
    `Feedback: ${result.feedbackPath}`,
    `Eval suite: ${result.evalsJsonPath}`,
    "",
    "Suggestions:",
    ...(result.suggestions.length > 0
      ? result.suggestions.map((suggestion) => `- ${suggestion.caseId} [${suggestion.kind}]: ${suggestion.recommendation}\n  Why: ${suggestion.rationale}`)
      : ["- none"]),
    "",
    result.applied ? "Updated evals/evals.json and validated it." : "No files changed. Re-run with --apply to write validated improvement metadata.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function formatCreateSummary(result: CreateCommandResult): string {
  const deterministicAssertions: string[] = [];
  const judgeAssertions: string[] = [];

  for (const evalCase of result.evals.evals) {
    for (const assertion of evalCase.assertions ?? []) {
      if (typeof assertion === "string") {
        judgeAssertions.push(`${evalCase.id}: ${assertion}`);
      } else if ("type" in assertion) {
        deterministicAssertions.push(`${evalCase.id}: ${assertion.type}${"path" in assertion ? ` ${assertion.path}` : ""}`);
      } else if (assertion.method === "judge") {
        judgeAssertions.push(`${evalCase.id}: ${assertion.id}`);
      } else {
        deterministicAssertions.push(`${evalCase.id}: ${assertion.kind}/${assertion.method}${"path" in assertion && assertion.path ? ` ${assertion.path}` : ""}`);
      }
    }
  }

  const lines = [
    `${result.dryRun ? "Generated" : "Created"} ${result.guided ? "guided" : "starter"} eval suite for ${result.evals.skill_name}`,
    "",
    "Cases:",
    ...result.evals.evals.map((evalCase) => `- ${evalCase.id}`),
    "",
    "Fixture inputs:",
    ...(result.fixtureInputs.length > 0 ? result.fixtureInputs.map((item) => `- ${item}`) : ["- none inferred yet"]),
    "",
    "Adjacent negative assumption:",
    `- ${result.adjacentNegativeAssumption}`,
    "",
    "Rationale:",
    ...(result.rationale.length > 0 ? result.rationale.map((item) => `- ${item}`) : ["- none provided"]),
    "",
    "Deterministic assertions:",
    ...(deterministicAssertions.length > 0 ? deterministicAssertions.map((item) => `- ${item}`) : ["- none inferred yet"]),
    "",
    "Judge assertions:",
    ...(judgeAssertions.length > 0 ? judgeAssertions.map((item) => `- ${item}`) : ["- none"]),
    "",
    result.dryRun ? `Dry run only; no files written. Target path: ${result.evalsJsonPath}` : `Wrote: ${result.evalsJsonPath}`,
    "",
    "Review before committing:",
    "- Prompts are starter scaffolds.",
    "- Add fixtures for real execution paths.",
    "- Replace generic judge assertions where deterministic checks are possible.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

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
      case "improve": {
        const result = await improveCommand({
          feedbackPath: parsed.feedbackPath,
          dryRun: parsed.dryRun,
          summary: parsed.summary,
          apply: parsed.apply,
        });
        if (!parsed.summary) {
          return { exitCode: 0, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: "" };
        }
        return {
          exitCode: 0,
          stdout: formatImproveSummary(result),
          stderr: "",
        };
      }
      case "create": {
        const result = await createCommand({
          skillDir: parsed.skillDir,
          force: parsed.force,
          dryRun: parsed.dryRun,
          guided: parsed.guided,
          interactive: parsed.interactive,
          model: parsed.model,
          agentDir: parsed.agentDir,
          authoringSkillPath: parsed.authoringSkillPath,
        });
        if (result.dryRun && !parsed.summary) {
          return { exitCode: 0, stdout: `${JSON.stringify(result.evals, null, 2)}\n`, stderr: "" };
        }
        return {
          exitCode: 0,
          stdout: formatCreateSummary(result),
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
          sandbox: parsed.sandbox,
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
      case "browse": {
        // Interactive: the Ink TUI renders directly to the terminal and owns
        // stdout for its lifetime, so it bypasses the buffered stdout/stderr path.
        const code = await browseCommand({ input: parsed.input, showWithout: !parsed.noBaseline });
        return {
          exitCode: code === 0 ? 0 : 1,
          stdout: "",
          stderr: "",
        };
      }
      case "audit": {
        const result = await auditCommand({ input: parsed.input, json: parsed.json, output: parsed.output });
        const stdout = parsed.json ? `${JSON.stringify(result, null, 2)}\n` : renderAuditMarkdown(result);
        const outputNote = result.outputPath ? `\nWrote audit report: ${result.outputPath}\n` : "";
        return {
          exitCode: 0,
          stdout: `${stdout}${outputNote}`,
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
