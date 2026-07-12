/**
 * Deterministic assertion classification and grading for eval cases.
 *
 * This module deliberately has no judge or Pi runtime dependency. The caller
 * owns judge invocation; this engine owns every assertion that is not sent to
 * that judge, including deterministic failures for trace-aware forms that are
 * not implemented yet.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  AssertionResult,
  BehaviorAssertion,
  EvalAssertion,
  FileExistsAssertion,
  IntentAssertion,
  JsonValidAssertion,
  OutputAssertion,
  RegexMatchAssertion,
  SafetyAssertion,
  ScriptAssertion,
  WorkspaceAssertion,
} from "./types.js";

export type JudgeOutputAssertion = OutputAssertion & { method: "judge" };
export type JudgeAssertion = string | JudgeOutputAssertion;
export type DeterministicAssertion =
  | ScriptAssertion
  | (OutputAssertion & { method: "regex" | "exact" })
  | Exclude<IntentAssertion, OutputAssertion>;

/** Legacy script-type view retained for artifact consumers; classification stays in this engine. */
export const DETERMINISTIC_ASSERTION_TYPES = new Set(["file-exists", "regex-match", "json-valid"]);

/** The authoritative boundary between judge-backed and deterministic assertions. */
export function isJudgeAssertion(assertion: unknown): assertion is JudgeAssertion {
  return (
    typeof assertion === "string" ||
    (isIntentAssertion(assertion) && assertion.kind === "output" && assertion.method === "judge")
  );
}

/** Returns the prompt text for an assertion already classified as judge-backed. */
export function judgePromptForAssertion(assertion: JudgeAssertion): string {
  if (typeof assertion === "string") return assertion;
  return assertion.prompt ?? assertion.expected ?? `Output assertion ${assertion.id} must pass`;
}

/** Grade one non-judge assertion without invoking an LLM or runtime adapter. */
export async function gradeDeterministicAssertion(
  assertion: DeterministicAssertion,
  workspaceDir: string,
  assistantText: string,
): Promise<AssertionResult> {
  if (isScriptAssertion(assertion)) {
    return await gradeScriptAssertion(assertion, workspaceDir, assistantText);
  }

  return await gradeIntentAssertion(assertion, workspaceDir, assistantText);
}

function isScriptAssertion(assertion: EvalAssertion): assertion is ScriptAssertion {
  return typeof assertion !== "string" && "type" in assertion;
}

function isIntentAssertion(assertion: unknown): assertion is IntentAssertion {
  return typeof assertion === "object" && assertion !== null && "kind" in assertion;
}

async function gradeScriptAssertion(
  assertion: ScriptAssertion,
  workspaceDir: string,
  assistantText: string,
): Promise<AssertionResult> {
  switch (assertion.type) {
    case "file-exists":
      return await gradeFileExists(assertion, workspaceDir);
    case "regex-match":
      return await gradeRegexMatch(assertion, workspaceDir, assistantText);
    case "json-valid":
      return await gradeJsonValid(assertion, workspaceDir);
  }
}

async function gradeIntentAssertion(
  assertion: Exclude<IntentAssertion, OutputAssertion> | (OutputAssertion & { method: "regex" | "exact" }),
  workspaceDir: string,
  assistantText: string,
): Promise<AssertionResult> {
  switch (assertion.kind) {
    case "output":
      return gradeOutputAssertion(assertion, assistantText);
    case "workspace":
      return await gradeWorkspaceAssertion(assertion, workspaceDir);
    case "behavior":
      return gradeBehaviorAssertion(assertion);
    case "safety":
      return gradeSafetyAssertion(assertion);
  }
}

function gradeOutputAssertion(
  assertion: OutputAssertion & { method: "regex" | "exact" },
  assistantText: string,
): AssertionResult {
  const text = summarizeAssertion(assertion);
  switch (assertion.method) {
    case "regex": {
      let regex: RegExp;
      try {
        regex = new RegExp(assertion.pattern ?? "", assertion.flags);
      } catch (error) {
        return failed(text, `Invalid regex: ${(error as Error).message}`, assertion);
      }
      const match = regex.exec(assistantText);
      if (!match) return failed(text, "No match in assistant-text", assertion);
      return {
        text,
        passed: true,
        evidence: `Match near: ${quoteMatchWindow(assistantText, match.index, match[0].length)}`,
        assertion,
      };
    }
    case "exact": {
      const expected = assertion.expected ?? "";
      if (assistantText === expected) {
        return { text, passed: true, evidence: "Assistant text exactly matched expected output", assertion };
      }
      return failed(text, "Assistant text did not exactly match expected output", assertion);
    }
  }
}

async function gradeWorkspaceAssertion(
  assertion: WorkspaceAssertion,
  workspaceDir: string,
): Promise<AssertionResult> {
  switch (assertion.method) {
    case "file-exists":
      return await gradeFileExists(assertionToFileExists(assertion), workspaceDir, assertion);
    case "file-contains":
      return await gradeWorkspaceFileContains(assertion, workspaceDir);
    case "json-valid":
      return await gradeJsonValid(assertionToJsonValid(assertion), workspaceDir, assertion);
    case "snapshot-diff":
      return failed(summarizeAssertion(assertion), "snapshot-diff assertions are not implemented yet", assertion);
  }
}

function gradeBehaviorAssertion(assertion: BehaviorAssertion): AssertionResult {
  return failed(
    summarizeAssertion(assertion),
    "Behavior assertions require trace-aware grading and are not implemented yet",
    assertion,
  );
}

function gradeSafetyAssertion(assertion: SafetyAssertion): AssertionResult {
  return failed(
    summarizeAssertion(assertion),
    "Safety assertions require trace-aware grading and are not implemented yet",
    assertion,
  );
}

function assertionToFileExists(assertion: WorkspaceAssertion): FileExistsAssertion {
  return { type: "file-exists", path: assertion.path ?? "" };
}

function assertionToJsonValid(assertion: WorkspaceAssertion): JsonValidAssertion {
  return { type: "json-valid", path: assertion.path ?? "" };
}

async function gradeFileExists(
  assertion: FileExistsAssertion,
  workspaceDir: string,
  rawAssertion: EvalAssertion = assertion,
): Promise<AssertionResult> {
  const text = `file-exists: ${assertion.path}`;
  const resolved = resolveInWorkspace(workspaceDir, assertion.path);

  if (!resolved.ok) return failed(text, resolved.evidence, rawAssertion);

  try {
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) return failed(text, `Not a file: \`${assertion.path}\``, rawAssertion);
    return {
      text,
      passed: true,
      evidence: `Found \`${assertion.path}\` (${info.size} bytes)`,
      assertion: rawAssertion,
    };
  } catch {
    return failed(text, `No such file: \`${assertion.path}\``, rawAssertion);
  }
}

async function gradeRegexMatch(
  assertion: RegexMatchAssertion,
  workspaceDir: string,
  assistantText: string,
): Promise<AssertionResult> {
  const targetDescription = describeRegexTarget(assertion);
  const text = `regex-match: /${assertion.pattern}/${assertion.flags ?? ""} in ${targetDescription}`;

  let regex: RegExp;
  try {
    regex = new RegExp(assertion.pattern, assertion.flags);
  } catch (error) {
    return failed(text, `Invalid regex: ${(error as Error).message}`, assertion);
  }

  let haystack: string;
  if (assertion.target && typeof assertion.target === "object" && "file" in assertion.target) {
    const resolved = resolveInWorkspace(workspaceDir, assertion.target.file);
    if (!resolved.ok) return failed(text, resolved.evidence, assertion);
    try {
      haystack = await readFile(resolved.absolutePath, "utf-8");
    } catch {
      return failed(text, `No such file: \`${assertion.target.file}\``, assertion);
    }
  } else {
    haystack = assistantText;
  }

  const match = regex.exec(haystack);
  if (!match) return failed(text, `No match in ${targetDescription}`, assertion);
  return {
    text,
    passed: true,
    evidence: `Match near: ${quoteMatchWindow(haystack, match.index, match[0].length)}`,
    assertion,
  };
}

async function gradeWorkspaceFileContains(
  assertion: WorkspaceAssertion,
  workspaceDir: string,
): Promise<AssertionResult> {
  const pathLabel = assertion.path ?? "";
  const text = `file-contains: ${pathLabel}`;
  const resolved = resolveInWorkspace(workspaceDir, pathLabel);

  if (!resolved.ok) return failed(text, resolved.evidence, assertion);

  let raw: string;
  try {
    raw = await readFile(resolved.absolutePath, "utf-8");
  } catch {
    return failed(text, `No such file: \`${pathLabel}\``, assertion);
  }

  let regex: RegExp;
  try {
    regex = new RegExp(assertion.pattern ?? "", assertion.flags);
  } catch (error) {
    return failed(text, `Invalid regex: ${(error as Error).message}`, assertion);
  }

  const match = regex.exec(raw);
  if (!match) return failed(text, `No match in ${pathLabel}`, assertion);
  return {
    text,
    passed: true,
    evidence: `Match near: ${quoteMatchWindow(raw, match.index, match[0].length)}`,
    assertion,
  };
}

async function gradeJsonValid(
  assertion: JsonValidAssertion,
  workspaceDir: string,
  rawAssertion: EvalAssertion = assertion,
): Promise<AssertionResult> {
  const text = `json-valid: ${assertion.path}`;
  const resolved = resolveInWorkspace(workspaceDir, assertion.path);

  if (!resolved.ok) return failed(text, resolved.evidence, rawAssertion);

  let raw: string;
  try {
    raw = await readFile(resolved.absolutePath, "utf-8");
  } catch {
    return failed(text, `No such file: \`${assertion.path}\``, rawAssertion);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      text,
      passed: true,
      evidence: `Valid JSON (${summarizeJsonValue(parsed)})`,
      assertion: rawAssertion,
    };
  } catch (error) {
    return failed(text, `Parse error: ${(error as Error).message}`, rawAssertion);
  }
}

function failed(text: string, evidence: string, assertion: EvalAssertion): AssertionResult {
  return { text, passed: false, evidence, assertion };
}

function resolveInWorkspace(
  workspaceDir: string,
  relativePath: string,
): { ok: true; absolutePath: string } | { ok: false; evidence: string } {
  const root = path.resolve(workspaceDir);
  const absolute = path.resolve(root, relativePath);
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, evidence: "Path escapes workspace" };
  return { ok: true, absolutePath: absolute };
}

function describeRegexTarget(assertion: RegexMatchAssertion): string {
  if (assertion.target && typeof assertion.target === "object" && "file" in assertion.target) return assertion.target.file;
  return "assistant-text";
}

function quoteMatchWindow(haystack: string, matchIndex: number, matchLength: number): string {
  const windowRadius = 20;
  const start = Math.max(0, matchIndex - windowRadius);
  const end = Math.min(haystack.length, matchIndex + matchLength + windowRadius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  const slice = haystack.slice(start, end).replace(/\s+/g, " ").trim();
  return `"${prefix}${slice}${suffix}"`;
}

function summarizeJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array of ${value.length}`;
  const t = typeof value;
  if (t === "object") return `object with ${Object.keys(value as Record<string, unknown>).length} keys`;
  return t;
}

export function summarizeAssertion(assertion: EvalAssertion): string {
  if (typeof assertion === "string") return assertion;
  if (isScriptAssertion(assertion)) {
    switch (assertion.type) {
      case "file-exists":
        return `file-exists: ${assertion.path}`;
      case "json-valid":
        return `json-valid: ${assertion.path}`;
      case "regex-match":
        return `regex-match: /${assertion.pattern}/${assertion.flags ?? ""} in ${describeRegexTarget(assertion)}`;
    }
  }

  switch (assertion.kind) {
    case "output":
      return `output:${assertion.method}: ${assertion.id}`;
    case "workspace":
      return `workspace:${assertion.method}: ${assertion.path ?? assertion.id}`;
    case "behavior":
      return `behavior:${assertion.method}: ${assertion.value ?? assertion.id}`;
    case "safety":
      return `safety:${assertion.method}: ${assertion.id}`;
  }
}
