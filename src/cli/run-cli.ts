import path from "node:path";

import { auditCommand, renderAuditMarkdown } from "./audit-command.js";
import { bundledCommand } from "./bundled-command.js";
import { browseCommand } from "./browse-command.js";
import { createCommand, type CreateCommandResult } from "./create-command.js";
import { emitCommand } from "./emit-command.js";
import { improveCommand, type ImproveCommandResult } from "./improve-command.js";
import { initRuntimeCommand } from "./init-runtime-command.js";
import { optimizeDescriptionCommand, type OptimizeDescriptionRunResult, type ScoreDescriptionResult } from "./optimize-description-command.js";
import { packageCommand } from "./package-command.js";
import { reviewCommand } from "./review-command.js";
import { runEvalsCommand } from "./run-evals-command.js";
import { renderHelp, parseCliArgs } from "./argv.js";
import { formatRunEvalsResult } from "./render.js";
import { resolveLaminarConfig } from "./laminar-config.js";
import { createLaminarSink } from "../observability/sinks/laminar.js";
import { assertRuntimeReady, resolveRuntime } from "../runtime/registry.js";
import { CliCommandError, CliUsageError, type CliInvocationResult } from "./types.js";

function formatDescriptionScore(result: ScoreDescriptionResult): string {
  const pct = (value: number): string => `${Math.round(value * 100)}%`;
  const split = (label: string, s: { correct: number; total: number; accuracy: number }): string =>
    `${label}  ${s.correct}/${s.total} (${pct(s.accuracy)})`;
  const lines = [
    `Description routing score — ${result.skillName}`,
    `eval set: ${result.evalSetPath}`,
    `distractors: ${result.distractors.length > 0 ? result.distractors.join(", ") : "none"}`,
    `probes: ${result.probeCount}${result.probeModel ? ` · model ${result.probeModel}` : ""}${result.totalTokens > 0 ? ` · ${result.totalTokens} tokens · $${result.totalCostUsd.toFixed(4)}` : ""}`,
    "",
    split("TRAIN", result.score.train),
    split("TEST ", result.score.test),
    "",
  ];
  for (const verdict of result.score.verdicts) {
    const got = verdict.got ?? "unparseable answer";
    lines.push(`${verdict.correct ? "✓" : "✗"} ${verdict.id} [${verdict.split}, ${verdict.expect}] → ${got}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatOptimizationReport(result: OptimizeDescriptionRunResult): string {
  const pct = (value: number): string => `${Math.round(value * 100)}%`;
  const fmt = (s: { correct: number; total: number; accuracy: number }): string => `${s.correct}/${s.total} (${pct(s.accuracy)})`;
  const { report } = result;
  const lines = [
    `Description optimization — ${result.skillName}`,
    `eval set: ${result.evalSetPath}`,
    `distractors: ${result.distractors.length > 0 ? result.distractors.join(", ") : "none"}`,
    `probes: ${result.probeCount}${result.probeModel ? ` · model ${result.probeModel}` : ""}${result.totalTokens > 0 ? ` · ${result.totalTokens} tokens · $${result.totalCostUsd.toFixed(4)}` : ""}`,
    "",
    `baseline  TRAIN ${fmt(report.baseline.train)} · TEST ${fmt(report.baseline.test)}`,
  ];
  for (const iteration of report.iterations) {
    if (iteration.description === null) {
      lines.push(`iter ${iteration.iteration}    proposal failed: ${iteration.proposalError}`);
      continue;
    }
    const test = iteration.test ? ` · TEST ${fmt(iteration.test)}` : " · (did not beat baseline on train — test not evaluated)";
    lines.push(`iter ${iteration.iteration}    TRAIN ${fmt(iteration.train!)}${test}`);
  }
  lines.push("");
  if (report.winner) {
    lines.push(
      `winner: iteration ${report.winner.iteration} — held-out TEST ${fmt(report.baseline.test)} → ${fmt(report.winner.test)}`,
      "",
      "before:",
      `  ${report.baseline.description}`,
      "after:",
      `  ${report.winner.description}`,
      "",
      result.applied
        ? `Applied the winning description to ${result.skillPath} (verified it reads back cleanly).`
        : "SKILL.md was not modified. Re-run with --apply to write the winning description.",
    );
  } else {
    lines.push(
      "No candidate beat the current description on the held-out test split — keep the current description.",
      "Consider expanding the eval set (more near-miss negatives) before optimizing again.",
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

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
        // Resolve Laminar config before running so missing credentials fail
        // fast (resolveLaminarConfig throws CliUsageError naming the key).
        const laminarConfig = resolveLaminarConfig({ enabled: parsed.laminar, env: process.env });
        const laminarSink = laminarConfig ? createLaminarSink(laminarConfig) : undefined;
        const observabilitySinks = laminarSink ? [laminarSink] : undefined;

        let result;
        try {
          try {
            await assertRuntimeReady(parsed.runtime, process.env);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new CliCommandError(message);
          }
          const runtime = resolveRuntime(parsed.runtime);
          result = await runEvalsCommand({
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
            observabilitySinks,
            model: parsed.model,
            judgeModel: parsed.judgeModel,
            runtime,
          });
        } finally {
          // Drain sinks before the process exits so in-flight exports (e.g.
          // Laminar spans) actually reach their backend. A teardown failure
          // must never mask the run result, so errors are swallowed.
          for (const sink of observabilitySinks ?? []) {
            await Promise.resolve(sink.shutdown?.()).catch(() => undefined);
          }
        }
        const failed =
          result.summary.failedCases > 0 ||
          result.summary.failedAssertions > 0 ||
          (parsed.strict && result.summary.softFailedAssertions > 0);
        const laminarUrls = laminarSink?.evaluationUrls() ?? [];
        const laminarNote =
          laminarConfig && !parsed.json
            ? `Laminar export: enabled (sink: laminar)\n${laminarUrls.map((url) => `- ${url}\n`).join("")}`
            : "";
        return {
          exitCode: failed ? 1 : 0,
          stdout: `${formatRunEvalsResult(result, { json: parsed.json })}${laminarNote}`,
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
      case "optimize-description": {
        const result = await optimizeDescriptionCommand({
          skillDir: parsed.skillDir,
          generateOnly: parsed.generateOnly,
          evalSetPath: parsed.evalSetPath,
          output: parsed.output,
          force: parsed.force,
          model: parsed.model,
          agentDir: parsed.agentDir,
          maxIterations: parsed.maxIterations,
          apply: parsed.apply,
          distractorDirs: parsed.distractorDirs,
        });
        if (result.mode === "generate-only") {
          return {
            exitCode: 0,
            stdout: [
              `Wrote routing eval set: ${result.evalSetPath}`,
              `- ${result.triggerCount} should-trigger, ${result.noTriggerCount} should-not-trigger prompts`,
              `- split: ${result.trainCount} train / ${result.testCount} test`,
              "",
              "Review the prompts (especially the near-miss negatives) before optimizing:",
              `arc-skill-eval optimize-description ${parsed.skillDir} --eval-set ${result.evalSetPath}`,
              "",
            ].join("\n"),
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: result.mode === "score" ? formatDescriptionScore(result) : formatOptimizationReport(result),
          stderr: "",
        };
      }
      case "package": {
        const result = await packageCommand({
          skillDir: parsed.skillDir,
          output: parsed.output,
          force: parsed.force,
        });
        return {
          exitCode: 0,
          stdout: [
            `Packaged ${result.skillName} → ${result.outputPath}`,
            `- files: ${result.fileCount}`,
            `- total bytes: ${result.totalBytes}`,
            `- manifest: ${result.manifest.files.length} files, sha256 recorded`,
            "",
          ].join("\n"),
          stderr: "",
        };
      }
      case "emit": {
        const result = await emitCommand({
          from: parsed.from,
          out: parsed.out,
          skillDir: parsed.skillDir,
          check: parsed.check,
        });
        const relFrom = path.relative(process.cwd(), result.fromPath) || result.fromPath;
        const relOut = path.relative(process.cwd(), result.outPath) || result.outPath;
        const cases = `${result.caseCount} case${result.caseCount === 1 ? "" : "s"}`;
        if (result.check) {
          if (result.changed) {
            return {
              exitCode: 1,
              stdout: "",
              stderr: `${relOut} is out of date with ${relFrom}. Run \`arc-skill-eval emit\` to regenerate it.\n`,
            };
          }
          return {
            exitCode: 0,
            stdout: `${relOut} is up to date with ${relFrom} (${result.skillName}, ${cases}).\n`,
            stderr: "",
          };
        }
        const verb = result.changed ? "Wrote" : "Up to date";
        const suffix = result.changed ? "" : " (unchanged)";
        return {
          exitCode: 0,
          stdout: `${verb} ${relOut} from ${relFrom} — ${result.skillName}, ${cases}${suffix}.\n`,
          stderr: "",
        };
      }
      case "bundled": {
        const result = await bundledCommand({
          skillName: parsed.skillName,
          json: parsed.json,
        });
        if (parsed.json) {
          return {
            exitCode: 0,
            stdout: `${JSON.stringify(result.entries, null, 2)}\n`,
            stderr: "",
          };
        }
        if (parsed.skillName) {
          return {
            exitCode: 0,
            stdout: `${result.entries[0]!.path}\n`,
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: `${result.entries.map((entry) => entry.path).join("\n")}\n`,
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
