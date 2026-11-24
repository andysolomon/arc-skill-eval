import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { checkCoverage } from "../evals/coverage-map.js";
import { EvalsJsonValidationError, readEvalsJson } from "../evals/loader.js";
import { nullRunCase } from "../evals/null-run.js";
import { checkSyncRecord, SYNC_RECORD_RELATIVE_PATH } from "../evals/sync-record.js";
import { parseFrontmatter } from "../skills/intake.js";
import { CliCommandError } from "./types.js";

export interface AuditCommandOptions {
  input: string;
  json?: boolean;
  output?: string;
}

export type AuditSeverity = "info" | "warn" | "high";

export interface SkillAuditFinding {
  severity: AuditSeverity;
  category: string;
  message: string;
  path?: string;
}

export interface SkillAuditRecord {
  name: string;
  skillDir: string;
  skillPath: string;
  description?: string;
  disableModelInvocation: boolean;
  lineCount: number;
  hasEvals: boolean;
  findings: SkillAuditFinding[];
}

export interface AuditCommandResult {
  input: string;
  skills: SkillAuditRecord[];
  summary: {
    skillCount: number;
    findingCount: number;
    highCount: number;
    warnCount: number;
    infoCount: number;
  };
  outputPath?: string;
}

export async function auditCommand(options: AuditCommandOptions): Promise<AuditCommandResult> {
  const input = path.resolve(options.input);
  const skillPaths = await discoverSkillPaths(input);
  if (skillPaths.length === 0) {
    throw new CliCommandError(`No SKILL.md files found under ${input}.`);
  }

  const skills = await Promise.all(skillPaths.map((skillPath) => auditSkill(skillPath)));
  skills.sort((a, b) => a.skillDir.localeCompare(b.skillDir));

  addDuplicateNameFindings(skills);

  const result: AuditCommandResult = {
    input,
    skills,
    summary: summarize(skills),
  };

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, options.json ? `${JSON.stringify(result, null, 2)}\n` : renderAuditMarkdown(result), "utf8");
    result.outputPath = outputPath;
  }

  return result;
}

export function renderAuditMarkdown(result: AuditCommandResult): string {
  const lines: string[] = [
    "# Skill Audit",
    "",
    `Input: ${result.input}`,
    "",
    "## Summary",
    "",
    `- Skills: ${result.summary.skillCount}`,
    `- Findings: ${result.summary.findingCount}`,
    `- High: ${result.summary.highCount}`,
    `- Warn: ${result.summary.warnCount}`,
    `- Info: ${result.summary.infoCount}`,
    "",
    "## Skills",
    "",
    "| Skill | Lines | Evals | Findings |",
    "| --- | ---: | --- | ---: |",
  ];

  for (const skill of result.skills) {
    lines.push(`| ${escapeTable(skill.name)} | ${skill.lineCount} | ${skill.hasEvals ? "yes" : "no"} | ${skill.findings.length} |`);
  }

  lines.push("");

  for (const skill of result.skills) {
    lines.push(`### ${skill.name}`, "", `Path: ${skill.skillPath}`, "", `Invocation: ${skill.disableModelInvocation ? "user-invoked" : "model-invoked"}`, "");
    if (skill.description) lines.push(`Description: ${skill.description}`, "");
    if (skill.findings.length === 0) {
      lines.push("No findings.", "");
      continue;
    }
    for (const finding of skill.findings) {
      const loc = finding.path ? ` (${finding.path})` : "";
      lines.push(`- **${finding.severity} / ${finding.category}**${loc}: ${finding.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function auditSkill(skillPath: string): Promise<SkillAuditRecord> {
  const skillDir = path.dirname(skillPath);
  const text = await readFile(skillPath, "utf8");
  const frontmatter = parseFrontmatter(text);
  const findings: SkillAuditFinding[] = [];
  const lineCount = text.split(/\r?\n/).length;
  const name = frontmatter.name ?? path.basename(skillDir);
  const hasEvals = await exists(path.join(skillDir, "evals", "evals.json"));

  if (!frontmatter.name) {
    findings.push({ severity: "warn", category: "frontmatter", message: "Missing `name` in frontmatter." });
  }
  if (!frontmatter.description) {
    findings.push({ severity: "warn", category: "description", message: "Missing `description` in frontmatter." });
  } else if (frontmatter.description.length > 500) {
    findings.push({ severity: "warn", category: "description", message: `Description is ${frontmatter.description.length} characters; consider pruning trigger branches.` });
  }

  if (lineCount > 400) {
    findings.push({ severity: "high", category: "sprawl", message: `SKILL.md has ${lineCount} lines; disclose reference behind context pointers.` });
  } else if (lineCount > 200) {
    findings.push({ severity: "warn", category: "sprawl", message: `SKILL.md has ${lineCount} lines; check for reference that should be disclosed.` });
  }

  if (!hasEvals) {
    findings.push({ severity: "info", category: "eval-coverage", message: "Missing evals/evals.json; run `arc-skill-eval create <skill-dir>` or add a custom suite." });
  } else {
    findings.push(...(await auditEvalSuite(skillDir, text)));
  }

  if (frontmatter.disableModelInvocation && frontmatter.description && looksTriggerHeavy(frontmatter.description)) {
    findings.push({ severity: "warn", category: "invocation", message: "User-invoked skill has a trigger-heavy description; keep human-facing descriptions short or verify the host hides them from model invocation." });
  }

  for (const missingLink of findMissingMarkdownLinks(text, skillDir)) {
    findings.push({ severity: "high", category: "local-link", path: missingLink, message: "SKILL.md links to a missing local markdown reference file." });
  }

  return {
    name,
    skillDir,
    skillPath,
    description: frontmatter.description,
    disableModelInvocation: frontmatter.disableModelInvocation,
    lineCount,
    hasEvals,
    findings,
  };
}

const EVALS_JSON = "evals/evals.json";

async function auditEvalSuite(skillDir: string, skillText: string): Promise<SkillAuditFinding[]> {
  const evalsDir = path.join(skillDir, "evals");
  let suite;
  try {
    suite = await readEvalsJson(path.join(evalsDir, "evals.json"));
  } catch (error) {
    const detail = error instanceof EvalsJsonValidationError ? error.issues.join("; ") : String(error);
    return [{ severity: "high", category: "eval-suite", path: EVALS_JSON, message: `evals/evals.json does not load: ${detail}` }];
  }

  const findings: SkillAuditFinding[] = [...(await auditSyncRecord(skillDir)), ...auditCoverage(skillText, suite.evals)];
  for (const evalCase of suite.evals) {
    const result = await nullRunCase({ evalCase, evalsDir, skillDir });
    if (result.setupError) {
      findings.push({ severity: "high", category: "eval-suite", path: EVALS_JSON, message: `Case "${result.caseId}": workspace setup failed: ${result.setupError}` });
      continue;
    }
    for (const assertion of result.vacuous) {
      findings.push({
        severity: "warn",
        category: "vacuous-assertion",
        path: EVALS_JSON,
        message: `Case "${result.caseId}", assertion ${assertion.index + 1} (${assertion.text}) passes before the agent runs, so it cannot show the skill did anything. Keep it only if it guards content the run must not change.`,
      });
    }
    if (result.absenceOnly) {
      findings.push({
        severity: "info",
        category: "absence-only-case",
        path: EVALS_JSON,
        message: `Case "${result.caseId}" only checks that things did not happen, so an agent that does nothing passes it. Make sure another case shows the same things happening.`,
      });
    }
  }
  return findings;
}

function auditCoverage(skillText: string, cases: Parameters<typeof checkCoverage>[1]): SkillAuditFinding[] {
  const coverage = checkCoverage(skillText, cases);
  const findings: SkillAuditFinding[] = coverage.unknown.map((entry) => ({
    severity: "warn",
    category: "eval-coverage",
    path: EVALS_JSON,
    message: `Case "${entry.caseId}" covers "${entry.covers}", but SKILL.md has no section with that name. The section was renamed or removed.`,
  }));
  if (coverage.uncovered.length > 0) {
    findings.push({
      severity: "info",
      category: "eval-coverage",
      path: EVALS_JSON,
      message: `SKILL.md sections that no case covers: ${coverage.uncovered.join("; ")}.`,
    });
  }
  return findings;
}

async function auditSyncRecord(skillDir: string): Promise<SkillAuditFinding[]> {
  const check = await checkSyncRecord(skillDir);
  const finding = (severity: AuditSeverity, message: string): SkillAuditFinding[] => [
    { severity, category: "eval-sync", path: SYNC_RECORD_RELATIVE_PATH, message },
  ];

  switch (check.status) {
    case "in_sync":
      return [];
    case "missing":
      return finding("info", "No sync record, so nothing shows which version of the skill this suite passed against. Run `arc-skill-eval run <skill-dir> --stamp`.");
    case "invalid":
      return finding("warn", `evals/sync.json cannot be read (${check.reason}). Run \`arc-skill-eval run <skill-dir> --stamp\` to rewrite it.`);
    case "stale": {
      const parts: string[] = [];
      if (check.skillChanges.length > 0) parts.push(`skill files changed: ${listPaths(check.skillChanges)}`);
      if (check.suiteChanges.length > 0) parts.push(`suite files changed: ${listPaths(check.suiteChanges)}`);
      return finding(
        "warn",
        `The suite last passed in run ${check.record.run_id} (${check.record.stamped_at}). Since then, ${parts.join("; ")}. The old pass no longer covers these. Run the suite again and stamp it.`,
      );
    }
  }
}

function listPaths(paths: string[]): string {
  const shown = paths.slice(0, 8).join(", ");
  return paths.length > 8 ? `${shown} and ${paths.length - 8} more` : shown;
}

async function discoverSkillPaths(input: string): Promise<string[]> {
  const info = await lstat(input).catch((error) => {
    throw new CliCommandError(`Could not access audit target ${input}: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (info.isFile()) {
    if (path.basename(input) !== "SKILL.md") throw new CliCommandError(`Audit file target must be named SKILL.md: ${input}`);
    return [input];
  }

  const directSkill = path.join(input, "SKILL.md");
  if (await exists(directSkill)) return [directSkill];

  const found: string[] = [];
  await walk(input, 0, found);
  return found;
}

async function walk(dir: string, depth: number, found: string[]): Promise<void> {
  if (depth > 5) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
    found.push(path.join(dir, "SKILL.md"));
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "evals-runs") continue;
    await walk(path.join(dir, entry.name), depth + 1, found);
  }
}

function findMissingMarkdownLinks(text: string, skillDir: string): string[] {
  const missing: string[] = [];
  const regex = /\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g;
  for (const match of text.matchAll(regex)) {
    const target = match[1]!;
    if (/^[a-z]+:/i.test(target)) continue;
    if (!existsSync(path.resolve(skillDir, target))) missing.push(target);
  }
  return missing;
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

function looksTriggerHeavy(description: string): boolean {
  return /\b(use when|trigger|when asked|mentions|asks about)\b/i.test(description) || description.split(/,|;|\bor\b/i).length > 4;
}

function addDuplicateNameFindings(skills: SkillAuditRecord[]): void {
  const byName = new Map<string, SkillAuditRecord[]>();
  for (const skill of skills) {
    const key = skill.name.replace(/^arc-/, "");
    const existing = byName.get(key) ?? [];
    existing.push(skill);
    byName.set(key, existing);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const names = group.map((skill) => skill.name).join(", ");
    for (const skill of group) {
      skill.findings.push({ severity: "warn", category: "duplication", message: `Potential duplicate skill family: ${names}. Consider one canonical skill plus aliases.` });
    }
  }
}

function summarize(skills: SkillAuditRecord[]): AuditCommandResult["summary"] {
  const findings = skills.flatMap((skill) => skill.findings);
  return {
    skillCount: skills.length,
    findingCount: findings.length,
    highCount: findings.filter((finding) => finding.severity === "high").length,
    warnCount: findings.filter((finding) => finding.severity === "warn").length,
    infoCount: findings.filter((finding) => finding.severity === "info").length,
  };
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|");
}
