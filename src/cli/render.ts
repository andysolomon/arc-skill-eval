import { caseErrorPrefix } from "../pi/sdk-run-observation.js";
import { CLI_JSON_SCHEMA_VERSION } from "./json-output.js";
import type { RunEvalsCommandResult } from "./run-evals-command.js";
import type { CliRenderOptions } from "./types.js";

export function formatRunEvalsResult(result: RunEvalsCommandResult, options: CliRenderOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify({ schemaVersion: CLI_JSON_SCHEMA_VERSION, ...result }, null, 2)}\n`;
  }

  const lines = [
    `Run: ${result.runId}`,
    ...(result.iteration ? [`Iteration: ${result.iteration}`] : []),
    `Skills evaluated: ${result.skills.length}`,
    `Cases: ${result.summary.totalCases} (passed ${result.summary.passedCases}, failed ${result.summary.failedCases})`,
    `Assertions: ${result.summary.totalAssertions} (passed ${result.summary.passedAssertions}, failed ${result.summary.failedAssertions}${
      result.summary.softFailedAssertions > 0 ? `, soft ${result.summary.softFailedAssertions}` : ""
    })`,
    `Assertion pass rate: ${formatFractionPercent(result.summary.assertionPassRate)}`,
    ...(result.summary.softFailedAssertions > 0
      ? [`Soft misses: ${result.summary.softFailedAssertions} (non-failing; use --strict to gate)`]
      : []),
    ...formatSelfJudged(result.summary),
  ];

  for (const skill of result.skills) {
    lines.push("", `${skill.skillName}  →  ${skill.outputDir}`);
    if (skill.benchmark) {
      lines.push(`  Benchmark delta: ${formatSignedFractionPercent(skill.benchmark.summary.delta)} (${skill.benchmarkPath})`);
      const { assertions_passing_in_both: inBoth, assertions_compared: compared } = skill.benchmark.summary;
      if (inBoth > 0) {
        lines.push(`  ${inBoth} of ${compared} assertions passed without the skill too, so they do not show the skill helped.`);
      }
    }
    if (skill.trials) {
      lines.push(...formatTrials(skill.trials, skill.trialsPath));
    }
    if (skill.sync) {
      lines.push(skill.sync.stamped ? `  Sync record written: ${skill.sync.path}` : `  Sync record not written: ${skill.sync.reason}`);
    }
    if (skill.cases.length === 0 && skill.errors.length === 0) {
      lines.push("  (no cases selected)");
      continue;
    }
    for (const caseArt of skill.cases) {
      const s = caseArt.grading.summary;
      const verdict = s.failed === 0 && s.total > 0 ? "PASS" : s.total === 0 ? "NO-OP" : "FAIL";
      const comparison = caseArt.comparison
        ? `, delta ${formatSignedFractionPercent(caseArt.comparison.delta)}`
        : "";
      lines.push(`  [${verdict}] ${caseArt.caseId}: ${s.passed}/${s.total} assertions (${formatTimingSummary(caseArt.timing)}, ${formatToolSummary(caseArt.toolSummary)}, ${formatContextSummary(caseArt.contextManifest)}${comparison})`);
    }
    for (const group of groupErrorsByMessage(skill.errors)) {
      lines.push(`  [ERROR] ${group.caseIds.join(", ")}: ${group.message}`);
    }
  }

  lines.push(...formatAllCasesErroredDiagnosis(result));

  return `${lines.join("\n")}\n`;
}

function formatTrials(trials: NonNullable<RunEvalsCommandResult["skills"][number]["trials"]>, trialsPath?: string): string[] {
  const lines: string[] = [];
  const delta = trials.delta;
  if (delta && delta.median !== null) {
    const verdict = delta.measurable
      ? "The gap is larger than the run-to-run spread."
      : "The gap is no larger than the run-to-run spread, so this is not a measured difference.";
    lines.push(
      `  Across ${trials.trials} trials: median delta ${formatSignedFractionPercent(delta.median)}, range ${formatSignedFractionPercent(delta.min)} to ${formatSignedFractionPercent(delta.max)}. ${verdict}`,
    );
  } else {
    lines.push(`  Across ${trials.trials} trials${trialsPath ? ` (${trialsPath})` : ""}:`);
  }
  for (const trialCase of trials.cases) {
    if (trialCase.errored_trials > 0) {
      lines.push(`  [ERROR] ${trialCase.case_id}: ${trialCase.errored_trials} of ${trials.trials} trials crashed`);
    }
    for (const assertion of trialCase.assertions) {
      if (assertion.flaky) {
        lines.push(`  [FLAKY] ${trialCase.case_id}: ${assertion.text} passed ${assertion.passed_trials} of ${assertion.graded_trials} trials`);
      }
    }
  }
  return lines;
}

/** A model that grades its own output tends to pass it; say when that happened. */
function formatSelfJudged(summary: RunEvalsCommandResult["summary"]): string[] {
  if (summary.selfJudgedCases === 0) return [];
  const one = summary.selfJudgedCases === 1;
  const model = summary.selfJudgeModel ? ` (${summary.selfJudgeModel.provider}/${summary.selfJudgeModel.id})` : "";
  return [
    `Self-judged: ${summary.selfJudgedCases} ${one ? "case was" : "cases were"} graded by the model that ran ${one ? "it" : "them"}${model}. Pass --judge-model to grade with a different one.`,
  ];
}

function groupErrorsByMessage(errors: Array<{ caseId: string; message: string }>) {
  const groups = new Map<string, string[]>();
  for (const error of errors) {
    const prefix = caseErrorPrefix(error.caseId);
    const message = error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message;
    const caseIds = groups.get(message) ?? [];
    caseIds.push(error.caseId);
    groups.set(message, caseIds);
  }
  return Array.from(groups, ([message, caseIds]) => ({ message, caseIds }));
}

/** When nothing ran far enough to be graded, say so plainly instead of leaving "Assertions: 0". */
function formatAllCasesErroredDiagnosis(result: RunEvalsCommandResult): string[] {
  const errors = result.skills.flatMap((skill) => skill.errors);
  const gradedCases = result.skills.reduce((count, skill) => count + skill.cases.length, 0);
  if (errors.length === 0 || gradedCases > 0) return [];

  const lines = [
    "",
    `All ${errors.length} case${errors.length === 1 ? "" : "s"} errored before producing output, so nothing was graded.`,
  ];
  if (errors.every((error) => /\bmodel\b/iu.test(error.message))) {
    lines.push("If the model is unavailable to your account, pick another with --model (`pi --list-models` shows what Pi offers).");
  }
  return lines;
}

function formatTimingSummary(timing: { duration_ms: number; total_tokens: number; estimated_cost_usd?: number; context_window_used_percent?: number | null; model?: { provider: string; id: string } | null; thinking_level?: string | null }): string {
  const parts = [`${timing.duration_ms}ms`, `${timing.total_tokens} tokens`];
  if (typeof timing.estimated_cost_usd === "number") {
    parts.push(`$${timing.estimated_cost_usd.toFixed(4)}`);
  }
  if (timing.context_window_used_percent !== undefined) {
    parts.push(`ctx ${formatPercentValue(timing.context_window_used_percent)}`);
  }
  if (timing.model) {
    const thinking = timing.thinking_level ? `, thinking ${timing.thinking_level}` : "";
    parts.push(`${timing.model.provider}/${timing.model.id}${thinking}`);
  }
  return parts.join(", ");
}

function formatContextSummary(contextManifest: { mode: string; attached_skills: unknown[]; mcp_tools: unknown[] }): string {
  const parts = [`context ${contextManifest.mode}`, `${contextManifest.attached_skills.length} skills`];
  if (contextManifest.mcp_tools.length > 0) {
    parts.push(`${contextManifest.mcp_tools.length} mcp tools`);
  }
  return parts.join(", ");
}

function formatToolSummary(toolSummary: { tool_call_count: number; tool_error_count: number; skill_read_count: number; mcp_tool_call_count: number }): string {
  const parts = [`tools ${toolSummary.tool_call_count}`];
  if (toolSummary.tool_error_count > 0) {
    parts.push(`${toolSummary.tool_error_count} errors`);
  }
  if (toolSummary.skill_read_count > 0) {
    parts.push(`skill reads ${toolSummary.skill_read_count}`);
  }
  if (toolSummary.mcp_tool_call_count > 0) {
    parts.push(`mcp ${toolSummary.mcp_tool_call_count}`);
  }
  return parts.join(", ");
}

function formatPercentValue(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

function formatFractionPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatSignedFractionPercent(value: number | null): string {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}
