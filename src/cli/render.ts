import type { RunEvalsCommandResult } from "./run-evals-command.js";
import type { CliRenderOptions } from "./types.js";

export function formatRunEvalsResult(result: RunEvalsCommandResult, options: CliRenderOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `Run: ${result.runId}`,
    ...(result.iteration ? [`Iteration: ${result.iteration}`] : []),
    `Skills evaluated: ${result.skills.length}`,
    `Cases: ${result.summary.totalCases} (passed ${result.summary.passedCases}, failed ${result.summary.failedCases})`,
    `Assertions: ${result.summary.totalAssertions} (passed ${result.summary.passedAssertions}, failed ${result.summary.failedAssertions})`,
    `Assertion pass rate: ${formatFractionPercent(result.summary.assertionPassRate)}`,
  ];

  for (const skill of result.skills) {
    lines.push("", `${skill.skillName}  →  ${skill.outputDir}`);
    if (skill.benchmark) {
      lines.push(`  Benchmark delta: ${formatSignedFractionPercent(skill.benchmark.summary.delta)} (${skill.benchmarkPath})`);
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
      lines.push(`  [${verdict}] ${caseArt.caseId}: ${s.passed}/${s.total} assertions (${formatTimingSummary(caseArt.timing)}, ${formatToolSummary(caseArt.toolSummary)}${comparison})`);
    }
    for (const err of skill.errors) {
      lines.push(`  [ERROR] ${err.caseId}: ${err.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
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
