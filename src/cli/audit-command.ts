import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

interface SkillFrontmatter {
  name?: string;
  description?: string;
  disableModelInvocation: boolean;
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

function parseFrontmatter(text: string): SkillFrontmatter {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = match?.[1] ?? "";
  return {
    name: readYamlString(frontmatter, "name"),
    description: readYamlString(frontmatter, "description"),
    disableModelInvocation: readYamlBoolean(frontmatter, "disable-model-invocation") || readYamlBoolean(frontmatter, "disable-model-invoked-skill"),
  };
}

function readYamlString(frontmatter: string, key: string): string | undefined {
  const block = readYamlBlockScalar(frontmatter, key);
  if (block !== undefined) return block;
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, "m"));
  if (!match) return undefined;
  return unquote(match[1]!.trim());
}

function readYamlBlockScalar(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => new RegExp(`^${escapeRegExp(key)}\\s*:\\s*[>|]`).test(line));
  if (index === -1) return undefined;
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (/^\S[^:]*:\s*/.test(line)) break;
    if (line.trim() === "") continue;
    if (!/^\s+/.test(line)) break;
    values.push(line.trim());
  }
  const value = values.join(" ").trim();
  return value || undefined;
}

function readYamlBoolean(frontmatter: string, key: string): boolean {
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(true|false)\\s*$`, "mi"));
  return match?.[1]?.toLowerCase() === "true";
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|");
}
