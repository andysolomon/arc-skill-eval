import type { RunEvalsCommandResult } from "./run-evals-command.js";
import type { CliRenderOptions } from "./types.js";

export function formatRunEvalsResult(result: RunEvalsCommandResult, options: CliRenderOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `Run: ${result.runId}`,
    `Skills evaluated: ${result.skills.length}`,
    `Cases: ${result.summary.totalCases} (passed ${result.summary.passedCases}, failed ${result.summary.failedCases})`,
    `Assertions: ${result.summary.totalAssertions} (passed ${result.summary.passedAssertions}, failed ${result.summary.failedAssertions})`,
    `Assertion pass rate: ${formatFractionPercent(result.summary.assertionPassRate)}`,
  ];

  for (const skill of result.skills) {
    lines.push("", `${skill.skillName}  →  ${skill.outputDir}`);
    if (skill.cases.length === 0 && skill.errors.length === 0) {
      lines.push("  (no cases selected)");
      continue;
    }
    for (const caseArt of skill.cases) {
      const s = caseArt.grading.summary;
      const verdict = s.failed === 0 && s.total > 0 ? "PASS" : s.total === 0 ? "NO-OP" : "FAIL";
      lines.push(`  [${verdict}] ${caseArt.caseId}: ${s.passed}/${s.total} assertions (${caseArt.timing.duration_ms}ms)`);
    }
    for (const err of skill.errors) {
      lines.push(`  [ERROR] ${err.caseId}: ${err.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatFractionPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}
