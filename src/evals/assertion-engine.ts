/**
 * Deterministic assertion classification and grading for eval cases.
 *
 * This module deliberately has no judge or Pi runtime dependency. The caller
 * owns judge invocation; this engine owns every assertion that is not sent to
 * that judge, including trace-aware behavior/safety forms which grade against
 * the run's captured observations.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { EvalTraceObservations } from "../traces/types.js";
import type {
  PiSessionTelemetryToolCall,
} from "../pi/types.js";
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
export const DETERMINISTIC_ASSERTION_TYPES = new Set([
  "file-exists",
  "file-absent",
  "regex-match",
  "json-valid",
]);

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

/**
 * Grade one non-judge assertion without invoking an LLM or runtime adapter.
 *
 * `observations` is the run's captured trace (tool calls, skill reads, bash
 * commands, touched files, external calls). It is required for behavior/safety
 * assertions; when absent, those forms fail with a "no trace" evidence so the
 * never-throws contract holds and the miss is diagnosable.
 */
export async function gradeDeterministicAssertion(
  assertion: DeterministicAssertion,
  workspaceDir: string,
  assistantText: string,
  observations?: EvalTraceObservations,
): Promise<AssertionResult> {
  if (isScriptAssertion(assertion)) {
    return await gradeScriptAssertion(assertion, workspaceDir, assistantText);
  }

  return await gradeIntentAssertion(assertion, workspaceDir, assistantText, observations);
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
    case "file-absent":
      return await checkFileAbsent(assertion.path, workspaceDir, assertion);
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
  observations?: EvalTraceObservations,
): Promise<AssertionResult> {
  switch (assertion.kind) {
    case "output":
      return gradeOutputAssertion(assertion, assistantText);
    case "workspace":
      return await gradeWorkspaceAssertion(assertion, workspaceDir);
    case "behavior":
      return gradeBehaviorAssertion(assertion, observations);
    case "safety":
      return gradeSafetyAssertion(assertion, observations);
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
    case "file-absent":
      return await checkFileAbsent(assertion.path ?? "", workspaceDir, assertion);
    case "file-contains":
      return await gradeWorkspaceFileContains(assertion, workspaceDir);
    case "json-valid":
      return await gradeJsonValid(assertionToJsonValid(assertion), workspaceDir, assertion);
    case "snapshot-diff":
      return failed(summarizeAssertion(assertion), "snapshot-diff assertions are not implemented yet", assertion);
  }
}

/**
 * Shared core for `file-absent`, reachable both as a script assertion
 * (`{ type: "file-absent" }`) and as a workspace method
 * (`{ kind: "workspace", method: "file-absent" }`). `rawAssertion` is the
 * caller's original object so the result records the exact shape authored.
 */
async function checkFileAbsent(
  pathLabel: string,
  workspaceDir: string,
  rawAssertion: EvalAssertion,
): Promise<AssertionResult> {
  const text = `file-absent: ${pathLabel}`;
  const resolved = resolveInWorkspace(workspaceDir, pathLabel);

  if (!resolved.ok) return failed(text, resolved.evidence, rawAssertion);

  try {
    const info = await stat(resolved.absolutePath);
    // A directory at the path is not the file the author forbade, so treat it
    // as present-but-not-a-file rather than a pass.
    const kind = info.isDirectory() ? "directory" : "file";
    return failed(text, `Expected \`${pathLabel}\` to be absent, but a ${kind} exists`, rawAssertion);
  } catch {
    return { text, passed: true, evidence: `No such file: \`${pathLabel}\` (absent as required)`, assertion: rawAssertion };
  }
}

/**
 * Grade behavior assertions against the run's captured tool/skill/command
 * observations. The matcher is deliberately minimal: an exact tool/skill name
 * plus an optional substring/regex tested against a tool call's `inputSummary`.
 */
function gradeBehaviorAssertion(
  assertion: BehaviorAssertion,
  observations?: EvalTraceObservations,
): AssertionResult {
  const text = summarizeAssertion(assertion);
  if (!observations) {
    return failed(text, "No trace available for behavior grading", assertion);
  }

  switch (assertion.method) {
    case "tool-call-required": {
      const check = compileToolMatcher(assertion);
      if (!check.ok) return failed(text, check.evidence, assertion);
      const match = observations.toolCalls.find(check.predicate);
      if (match) {
        return { text, passed: true, evidence: describeToolCall("Tool called", match), assertion };
      }
      return failed(text, describeNoToolMatch(assertion, observations.toolCalls), assertion);
    }
    case "tool-call-forbidden": {
      const check = compileToolMatcher(assertion);
      if (!check.ok) return failed(text, check.evidence, assertion);
      const match = observations.toolCalls.find(check.predicate);
      if (match) {
        return failed(text, describeToolCall("Forbidden tool called", match), assertion);
      }
      const subject = assertion.value ?? "any tool";
      return { text, passed: true, evidence: `No forbidden tool call for "${subject}" observed`, assertion };
    }
    case "skill-read-required": {
      const wanted = assertion.value;
      const reads = observations.skillReads;
      const match = wanted ? reads.find((read) => read.skillName === wanted) : reads[0];
      if (match) {
        return { text, passed: true, evidence: `Skill "${match.skillName}" read from ${match.path}`, assertion };
      }
      const seen = reads.length === 0 ? "no skills read" : `read: ${reads.map((r) => r.skillName).join(", ")}`;
      const subject = wanted ? `"${wanted}"` : "any skill";
      return failed(text, `Skill ${subject} was not read (${seen})`, assertion);
    }
    case "external-call-forbidden": {
      const wanted = assertion.value;
      const calls = observations.externalCalls;
      const match = wanted
        ? calls.find((call) => renderExternalCall(call).includes(wanted))
        : calls[0];
      if (match) {
        return failed(text, `Forbidden external call: ${renderExternalCall(match)}`, assertion);
      }
      const subject = wanted ? `"${wanted}"` : "any external call";
      return { text, passed: true, evidence: `No forbidden external call for ${subject} observed`, assertion };
    }
    case "command-forbidden": {
      if (!assertion.value && !assertion.match) {
        return failed(text, "`command-forbidden` requires a `value` or `match` to forbid", assertion);
      }
      const check = compileStringMatcher(assertion.match ?? assertion.value ?? "", assertion.matchKind);
      if (!check.ok) return failed(text, check.evidence, assertion);
      const match = observations.bashCommands.find(check.predicate);
      if (match) {
        return failed(text, `Forbidden command matched: "${truncate(match, 80)}"`, assertion);
      }
      return { text, passed: true, evidence: `No forbidden command observed (${observations.bashCommands.length} run)`, assertion };
    }
  }
}

/**
 * Grade safety assertions against captured observations. `config` is read
 * defensively; malformed config fails the assertion with a clear message.
 */
function gradeSafetyAssertion(
  assertion: SafetyAssertion,
  observations?: EvalTraceObservations,
): AssertionResult {
  const text = summarizeAssertion(assertion);
  if (!observations) {
    return failed(text, "No trace available for safety grading", assertion);
  }

  switch (assertion.method) {
    case "no-forbidden-files-touched": {
      const paths = readForbiddenPaths(assertion.config);
      if (!paths.ok) return failed(text, paths.evidence, assertion);
      const touched = observations.touchedFiles;
      const hit = touched.find((file) => paths.value.some((forbidden) => pathMatchesForbidden(file.path, forbidden)));
      if (hit) {
        return failed(text, `Forbidden file touched: ${hit.path}`, assertion);
      }
      return { text, passed: true, evidence: `No forbidden files touched (${touched.length} files touched)`, assertion };
    }
    case "no-live-external-calls": {
      const calls = observations.externalCalls;
      if (calls.length > 0) {
        return failed(text, `Live external call: ${renderExternalCall(calls[0]!)}`, assertion);
      }
      return { text, passed: true, evidence: "No live external calls observed", assertion };
    }
    case "custom":
      return failed(text, "safety `custom` assertions are not implemented yet", assertion);
  }
}

type MatcherResult<T> =
  | { ok: true; predicate: (candidate: T) => boolean }
  | { ok: false; evidence: string };

/** Build a tool-call predicate from an exact name + optional input matcher. */
function compileToolMatcher(assertion: BehaviorAssertion): MatcherResult<PiSessionTelemetryToolCall> {
  const name = assertion.value;
  let inputCheck: ((summary: string) => boolean) | null = null;
  if (assertion.match !== undefined) {
    const compiled = compileStringMatcher(assertion.match, assertion.matchKind);
    if (!compiled.ok) return compiled;
    inputCheck = compiled.predicate;
  }
  return {
    ok: true,
    predicate: (call) => {
      if (name !== undefined && call.toolName !== name) return false;
      if (inputCheck) return inputCheck(call.inputSummary ?? "");
      return true;
    },
  };
}

/** Build a string predicate: substring by default, regex when `matchKind: "regex"`. */
function compileStringMatcher(needle: string, matchKind?: "substring" | "regex"): MatcherResult<string> {
  if (matchKind === "regex") {
    let regex: RegExp;
    try {
      regex = new RegExp(needle);
    } catch (error) {
      return { ok: false, evidence: `Invalid regex: ${(error as Error).message}` };
    }
    return { ok: true, predicate: (candidate) => regex.test(candidate) };
  }
  return { ok: true, predicate: (candidate) => candidate.includes(needle) };
}

function describeToolCall(prefix: string, call: PiSessionTelemetryToolCall): string {
  const input = call.inputSummary ? `: ${truncate(call.inputSummary, 80)}` : "";
  return `${prefix}: "${call.toolName}"${input}`;
}

function describeNoToolMatch(assertion: BehaviorAssertion, calls: PiSessionTelemetryToolCall[]): string {
  const subject = assertion.value ?? "any tool";
  const suffix = assertion.match ? ` matching ${assertion.matchKind ?? "substring"} "${assertion.match}"` : "";
  const seen = calls.length === 0 ? "no tool calls observed" : `${calls.length} tool calls observed`;
  return `No matching tool call for "${subject}"${suffix} (${seen})`;
}

function renderExternalCall(call: { system: string; operation: string; target?: string }): string {
  const target = call.target ? ` ${call.target}` : "";
  return `${call.system}:${call.operation}${target}`;
}

function readForbiddenPaths(config: unknown): { ok: true; value: string[] } | { ok: false; evidence: string } {
  if (typeof config !== "object" || config === null || !("paths" in config)) {
    return { ok: false, evidence: "`no-forbidden-files-touched` requires `config.paths: string[]`" };
  }
  const paths = (config as { paths: unknown }).paths;
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
    return { ok: false, evidence: "`config.paths` must be an array of strings" };
  }
  return { ok: true, value: paths as string[] };
}

/** Minimal path match: exact, or the touched path sits under a forbidden prefix. */
function pathMatchesForbidden(touched: string, forbidden: string): boolean {
  if (touched === forbidden) return true;
  const prefix = forbidden.endsWith("/") ? forbidden : `${forbidden}/`;
  if (touched.startsWith(prefix)) return true;
  return touched.includes(forbidden);
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`;
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
      case "file-absent":
        return `file-absent: ${assertion.path}`;
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
