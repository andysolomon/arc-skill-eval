import type { CliRenderOptions, ListCommandResult, TestCommandResult, ValidateCommandResult } from "./types.js";
import { formatIssueList } from "./shared.js";

export function formatListResult(result: ListCommandResult, options: CliRenderOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `Source: ${result.source.displayName} (${result.source.kind})`,
    `Repository root: ${result.source.repositoryRoot}`,
    `Participating skills: ${result.skills.length}`,
  ];

  if (result.skills.length === 0) {
    lines.push("", "No participating skills found.");
  } else {
    lines.push("", "Skills:");
    lines.push(...result.skills.map((skill) => `- ${skill.skillName} (${skill.relativeSkillDir})`));
  }

  return `${lines.join("\n")}\n`;
}

export function formatValidateResult(result: ValidateCommandResult, options: CliRenderOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `Source: ${result.source.displayName} (${result.source.kind})`,
    `Discovered skills: ${result.skills.length}`,
    `Valid skills: ${result.validSkills.length}`,
    `Invalid skills: ${result.invalidSkills.length}`,
  ];

  if (result.validSkills.length > 0) {
    lines.push("", "Valid skills:");
    lines.push(...result.validSkills.map((skill) => `- ${skill.files.skillName} (${skill.files.relativeSkillDir})`));
  }

  if (result.invalidSkills.length > 0) {
    lines.push("", "Invalid skills:");
    lines.push(...formatIssueList(result.invalidSkills));
  }

  return `${lines.join("\n")}\n`;
}

export function formatTestResult(result: TestCommandResult, options: CliRenderOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify(result.report, null, 2)}\n`;
  }

  const lines = [
    `Run: ${result.report.runId}`,
    `Source: ${result.report.source.displayName} (${result.report.source.kind})`,
    `Status: ${result.report.status}`,
    `Scored skills: ${result.report.summary.scoredSkillCount}`,
    `Invalid skills: ${result.report.summary.invalidSkillCount}`,
    `Executed cases: ${result.report.summary.executedCaseCount}`,
    `Scored cases: ${result.report.summary.caseCount}`,
    `Unscored cases: ${result.report.summary.unscoredCaseCount}`,
    `Report JSON: ${result.artifacts.jsonReportPath}`,
  ];

  if (result.artifacts.htmlReportPath) {
    lines.push(`Report HTML: ${result.artifacts.htmlReportPath}`);
  }

  if (result.report.skills.length > 0) {
    lines.push("", "Skill results:");
    lines.push(
      ...result.report.skills.map(
        (skill) =>
          `- ${skill.skill}: ${skill.status} (scored ${skill.cases.length}, unscored ${skill.unscoredCases.length}, overall ${formatPercent(skill.lanes.overall.scorePercent)})`,
      ),
    );
  }

  if (result.report.invalidSkills.length > 0) {
    lines.push("", "Invalid skills:");
    lines.push(
      ...result.report.invalidSkills.map((skill) => `- ${skill.skill} (${skill.relativeSkillDir})`),
    );
  }

  if (result.report.runIssues.length > 0) {
    lines.push("", "Run issues:");
    lines.push(
      ...result.report.runIssues.map((issue) => `- ${issue.severity}: ${issue.code} — ${issue.message}`),
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)}%`;
}
