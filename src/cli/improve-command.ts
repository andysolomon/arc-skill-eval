import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { readEvalsJson } from "../evals/loader.js";
import type { EvalCase, EvalsJsonFile } from "../evals/types.js";
import { CliCommandError } from "./types.js";

export interface ImproveCommandOptions {
  feedbackPath: string;
  dryRun?: boolean;
  summary?: boolean;
  apply?: boolean;
}

export interface ImproveSuggestion {
  caseId: string;
  kind: "prompt" | "assertions" | "fixtures" | "adjacent-negative";
  recommendation: string;
  rationale: string;
}

export interface ImproveCommandResult {
  feedbackPath: string;
  runDir: string;
  evalsJsonPath: string;
  dryRun: boolean;
  applied: boolean;
  suggestions: ImproveSuggestion[];
  updatedEvals?: EvalsJsonFile;
}

interface FeedbackFile {
  schema_version?: unknown;
  run_dir?: unknown;
  cases?: unknown;
}

interface FeedbackCase {
  case_id: string;
  status?: string;
  notes?: string;
  variants: FeedbackVariant[];
}

interface FeedbackVariant {
  name?: string;
  grading_summary?: { failed?: unknown; passed?: unknown; total?: unknown } | null;
  feedback?: string;
}

export async function improveCommand(options: ImproveCommandOptions): Promise<ImproveCommandResult> {
  if (options.apply && options.dryRun) {
    throw new CliCommandError("Choose either --apply or --dry-run for improve, not both.");
  }

  const feedbackPath = path.resolve(options.feedbackPath);
  const feedback = await readFeedbackFile(feedbackPath);
  const runDir = path.resolve(path.dirname(feedbackPath), feedback.runDir);
  const evalsJsonPath = await findEvalsJsonForRun(runDir);
  const evals = await readEvalsJson(evalsJsonPath);
  const suggestions = buildSuggestions(feedback.cases, evals);
  const dryRun = options.dryRun || !options.apply;

  if (!options.apply) {
    return { feedbackPath, runDir, evalsJsonPath, dryRun: true, applied: false, suggestions };
  }

  const updatedEvals = applySuggestions(evals, suggestions);
  await validateByWritingTemp(updatedEvals, path.dirname(evalsJsonPath));
  await writeFile(evalsJsonPath, `${JSON.stringify(updatedEvals, null, 2)}\n`, "utf8");
  const validated = await readEvalsJson(evalsJsonPath);

  return { feedbackPath, runDir, evalsJsonPath, dryRun, applied: true, suggestions, updatedEvals: validated };
}

async function readFeedbackFile(feedbackPath: string): Promise<{ runDir: string; cases: FeedbackCase[] }> {
  let raw: string;
  try {
    raw = await readFile(feedbackPath, "utf8");
  } catch (error) {
    throw new CliCommandError(`Could not read feedback.json at ${feedbackPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: FeedbackFile;
  try {
    parsed = JSON.parse(raw) as FeedbackFile;
  } catch (error) {
    throw new CliCommandError(`Invalid JSON in feedback file ${feedbackPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed.run_dir !== "string" || parsed.run_dir.length === 0) {
    throw new CliCommandError("feedback.json must include a non-empty `run_dir` string.");
  }
  if (!Array.isArray(parsed.cases)) {
    throw new CliCommandError("feedback.json must include a `cases` array.");
  }

  const cases: FeedbackCase[] = [];
  for (let i = 0; i < parsed.cases.length; i++) {
    const item = parsed.cases[i];
    if (!isRecord(item) || typeof item.case_id !== "string" || item.case_id.length === 0) {
      throw new CliCommandError(`feedback.json cases[${i}] must include a non-empty case_id string.`);
    }
    const variants = Array.isArray(item.variants)
      ? item.variants.filter(isRecord).map((variant) => ({
          name: typeof variant.name === "string" ? variant.name : undefined,
          grading_summary: isRecord(variant.grading_summary) ? variant.grading_summary : null,
          feedback: typeof variant.feedback === "string" ? variant.feedback : undefined,
        }))
      : [];
    cases.push({
      case_id: item.case_id,
      status: typeof item.status === "string" ? item.status : undefined,
      notes: typeof item.notes === "string" ? item.notes : undefined,
      variants,
    });
  }

  return { runDir: parsed.run_dir, cases };
}

async function findEvalsJsonForRun(runDir: string): Promise<string> {
  let current = path.resolve(runDir);
  for (let depth = 0; depth < 8; depth++) {
    const candidate = path.join(current, "evals", "evals.json");
    if (await fileExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new CliCommandError(`Could not find evals/evals.json for feedback run directory ${runDir}.`);
}

function buildSuggestions(feedbackCases: FeedbackCase[], evals: EvalsJsonFile): ImproveSuggestion[] {
  const suggestions: ImproveSuggestion[] = [];
  const knownCases = new Set(evals.evals.map((item) => String(item.id)));

  for (const item of feedbackCases) {
    const caseId = item.case_id;
    const notes = [item.notes, ...item.variants.map((variant) => variant.feedback)].filter(Boolean).join("\n").trim();
    const failed = item.variants.reduce((total, variant) => total + numberValue(variant.grading_summary?.failed), 0);
    const statusNeedsWork = item.status !== undefined && item.status !== "approved" && item.status !== "pass";
    if (!notes && failed === 0 && !statusNeedsWork) continue;

    const baseRationale = notes
      ? `Human feedback notes: ${truncate(notes, 220)}`
      : failed > 0
        ? `Review artifacts show ${failed} failing assertion${failed === 1 ? "" : "s"}.`
        : `Case status is ${item.status}.`;

    if (/fixture|seed|input file|setup|sample data/i.test(notes)) {
      suggestions.push({
        caseId,
        kind: "fixtures",
        recommendation: "Add or revise seeded fixture files for this case so the run exercises realistic inputs instead of an empty workspace.",
        rationale: baseRationale,
      });
    }

    if (/prompt|ambiguous|unclear|instruction|wording/i.test(notes)) {
      suggestions.push({
        caseId,
        kind: "prompt",
        recommendation: "Tighten the case prompt to state the expected user intent and constraints more explicitly.",
        rationale: baseRationale,
      });
    }

    if (/negative|over.?trigger|adjacent|routing|should not/i.test(notes)) {
      suggestions.push({
        caseId,
        kind: "adjacent-negative",
        recommendation: "Add or strengthen adjacent-negative coverage that is close to this skill's domain but should not trigger it.",
        rationale: baseRationale,
      });
    }

    if (failed > 0 || /assert|judge|regex|expected|missing|failed/i.test(notes)) {
      suggestions.push({
        caseId,
        kind: "assertions",
        recommendation: "Review failed or weak assertions; prefer deterministic file/regex checks where possible and make judge rubrics concrete.",
        rationale: baseRationale,
      });
    }

    if (!knownCases.has(caseId)) {
      suggestions.push({
        caseId,
        kind: "assertions",
        recommendation: "Feedback refers to a case id that is not present in evals.json; reconcile the run artifacts with the current suite before applying content changes.",
        rationale: `Current evals.json does not contain case ${caseId}.`,
      });
    }
  }

  return dedupeSuggestions(suggestions);
}

function applySuggestions(evals: EvalsJsonFile, suggestions: ImproveSuggestion[]): EvalsJsonFile {
  const byCase = new Map<string, ImproveSuggestion[]>();
  for (const suggestion of suggestions) {
    const items = byCase.get(suggestion.caseId) ?? [];
    items.push(suggestion);
    byCase.set(suggestion.caseId, items);
  }

  const updatedCases: EvalCase[] = evals.evals.map((evalCase) => {
    const caseSuggestions = byCase.get(String(evalCase.id)) ?? [];
    if (caseSuggestions.length === 0) return evalCase;

    const metadata = { ...(evalCase.metadata ?? {}) } as NonNullable<EvalCase["metadata"]> & { improvement_suggestions?: unknown };
    const existingTags = Array.isArray(metadata.tags) ? metadata.tags : [];
    metadata.tags = Array.from(new Set([...existingTags, "needs-eval-improvement"]));
    metadata.improvement_suggestions = caseSuggestions.map((suggestion) => ({
      kind: suggestion.kind,
      recommendation: suggestion.recommendation,
      rationale: suggestion.rationale,
    }));

    return { ...evalCase, metadata };
  });

  return { version: evals.version, skill_name: evals.skill_name, evals: updatedCases };
}

async function validateByWritingTemp(evals: EvalsJsonFile, evalsDir: string): Promise<void> {
  const tempDir = path.join(evalsDir, `.tmp-improve-${process.pid}-${Date.now()}`);
  const tempPath = path.join(tempDir, "evals.json");
  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(evals, null, 2)}\n`, "utf8");
    await readEvalsJson(tempPath);
  } catch (error) {
    throw new CliCommandError(`Updated evals.json failed validation: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function dedupeSuggestions(items: ImproveSuggestion[]): ImproveSuggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.caseId}:${item.kind}:${item.recommendation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    const fileStat = await stat(file);
    return fileStat.isFile();
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
