/**
 * Grader for an `evals/evals.json` case. Given a run's assistant text,
 * its workspace directory, and the case's assertions, produces a
 * `GradingJson` with per-assertion `{ passed, evidence }` pairs.
 *
 * String assertions are graded by an LLM-judge (Pi SDK by default, but
 * tests inject their own `judge` function). Script assertions
 * (`file-exists`, `regex-match`, `json-valid`) are graded deterministically.
 *
 * Reference: `docs/evals-json-pivot.md`, section "Assertion grading contract".
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import { piJudgeSessionRunner } from "../pi/session-adapter.js";

import type {
  AssertionResult,
  BehaviorAssertion,
  EvalAssertion,
  EvalCase,
  EvalCaseId,
  FileExistsAssertion,
  GradingJson,
  IntentAssertion,
  JsonValidAssertion,
  OutputAssertion,
  RegexMatchAssertion,
  SafetyAssertion,
  ScriptAssertion,
  WorkspaceAssertion,
} from "./types.js";

export interface LlmJudgeInput {
  /** Final assistant text from the run. The judge grades this against assertions. */
  assistantText: string;
  /** Only the string assertions the judge must grade, in source order. */
  assertions: string[];
}

export interface LlmJudgeOutput {
  /** Per-assertion result in the same order as `input.assertions`. */
  results: Array<{ passed: boolean; evidence: string }>;
}

export type LlmJudgeFn = (input: LlmJudgeInput) => Promise<LlmJudgeOutput>;

export interface GradeEvalCaseOptions {
  /** The case (with assertions) to grade. */
  case: EvalCase;
  /** Workspace where the run produced files — used by script assertions. */
  workspaceDir: string;
  /** Final assistant text from the run — default target for `regex-match`. */
  assistantText: string;
  /**
   * Model to use for the LLM-judge. The run command falls back to the
   * resolved runner model when this is absent; {@link DEFAULT_JUDGE_MODEL}
   * is the last resort.
   */
  judgeModel?: ModelSelection;
  /** Eval-owned Pi agent directory for judge model registry/settings/auth. */
  agentDir?: string;
  /** Test-injection point for the judge call. Omit to use the default Pi-backed judge. */
  judge?: LlmJudgeFn;
}

/**
 * Last-resort judge model, chosen for low cost. Only used when neither
 * `--judge-model` nor a resolved runner model is available — it requires
 * mistral credentials, which many environments do not have, so the run
 * command prefers the runner's own (already-working) model.
 */
export const DEFAULT_JUDGE_MODEL: ModelSelection = {
  provider: "mistral",
  id: "ministral-8b-latest",
};

const JUDGE_MALFORMED_EVIDENCE = "Judge returned unparseable output";

type JudgeOutputAssertion = OutputAssertion & { method: "judge" };

/**
 * Grade a single eval case's assertions. Returns a `GradingJson` suitable
 * for writing to disk. Never throws — assertion-level failures become
 * failed `AssertionResult`s.
 */
export async function gradeEvalCase(options: GradeEvalCaseOptions): Promise<GradingJson> {
  const assertions = options.case.assertions ?? [];
  const caseId = toCaseId(options.case.id);

  // Pre-allocate slots so we can fill them in input order regardless of
  // whether the result comes from the judge or a script check.
  const results: (AssertionResult | undefined)[] = new Array(assertions.length);
  const judgeAssertionSlots: Array<{ index: number; text: string; assertion: EvalAssertion }> = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i]!;
    if (isJudgeAssertion(assertion)) {
      judgeAssertionSlots.push({ index: i, text: judgePromptForAssertion(assertion), assertion });
    } else {
      results[i] = await gradeDeterministicAssertion(assertion, options.workspaceDir, options.assistantText);
    }
  }

  const resolvedJudgeModel = options.judgeModel ?? DEFAULT_JUDGE_MODEL;

  if (judgeAssertionSlots.length > 0) {
    const judge = options.judge ?? createDefaultLlmJudge({ model: resolvedJudgeModel, agentDir: options.agentDir });
    const judgeResults = await runJudgeSafely(judge, {
      assistantText: options.assistantText,
      assertions: judgeAssertionSlots.map((slot) => slot.text),
    });

    for (let j = 0; j < judgeAssertionSlots.length; j++) {
      const slot = judgeAssertionSlots[j]!;
      const judged = judgeResults[j] ?? { passed: false, evidence: JUDGE_MALFORMED_EVIDENCE };
      results[slot.index] = {
        text: slot.text,
        passed: judged.passed,
        evidence: judged.evidence,
        assertion: slot.assertion,
      };
    }
  }

  const assertionResults: AssertionResult[] = results.map((result, index) => {
    if (result) return result;
    // Defensive fallback: should never happen because every index is filled above.
    const assertion = assertions[index]!;
    return {
      text: summarizeAssertion(assertion),
      passed: false,
      evidence: "Grader did not produce a result",
      assertion,
    };
  });

  const passed = assertionResults.filter((r) => r.passed).length;
  const failed = assertionResults.length - passed;
  const total = assertionResults.length;

  return {
    case_id: caseId,
    assertion_results: assertionResults,
    ...(judgeAssertionSlots.length > 0
      ? { judge_model: { provider: resolvedJudgeModel.provider, id: resolvedJudgeModel.id } }
      : {}),
    summary: {
      passed,
      failed,
      total,
      pass_rate: total === 0 ? null : passed / total,
    },
  };
}

/**
 * Invokes the judge and normalizes its output into a per-assertion array
 * of length N. A judge that THROWS marks every assertion failed with the
 * thrown message ("Judge error: ..."), so misconfiguration (e.g. an
 * unauthenticated judge provider) is distinguishable from a judge that
 * responded with malformed output. Never throws itself.
 */
async function runJudgeSafely(
  judge: LlmJudgeFn,
  input: LlmJudgeInput,
): Promise<Array<{ passed: boolean; evidence: string }>> {
  const fallback = (evidence: string = JUDGE_MALFORMED_EVIDENCE) =>
    input.assertions.map(() => ({ passed: false, evidence }));

  let output: LlmJudgeOutput;
  try {
    output = await judge(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallback(`Judge error: ${message}`);
  }

  if (!output || !Array.isArray(output.results) || output.results.length !== input.assertions.length) {
    return fallback();
  }

  const normalized: Array<{ passed: boolean; evidence: string }> = [];
  for (const entry of output.results) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.passed !== "boolean" ||
      typeof entry.evidence !== "string"
    ) {
      return fallback();
    }
    normalized.push({ passed: entry.passed, evidence: entry.evidence });
  }

  return normalized;
}

function isScriptAssertion(assertion: EvalAssertion): assertion is ScriptAssertion {
  return typeof assertion !== "string" && "type" in assertion;
}

function isIntentAssertion(assertion: EvalAssertion): assertion is IntentAssertion {
  return typeof assertion !== "string" && "kind" in assertion;
}

function isJudgeAssertion(assertion: EvalAssertion): assertion is string | JudgeOutputAssertion {
  return typeof assertion === "string" || (isIntentAssertion(assertion) && assertion.kind === "output" && assertion.method === "judge");
}

function judgePromptForAssertion(assertion: string | JudgeOutputAssertion): string {
  if (typeof assertion === "string") return assertion;
  return assertion.prompt ?? assertion.expected ?? `Output assertion ${assertion.id} must pass`;
}

async function gradeDeterministicAssertion(
  assertion: Exclude<EvalAssertion, string | JudgeOutputAssertion>,
  workspaceDir: string,
  assistantText: string,
): Promise<AssertionResult> {
  if (isScriptAssertion(assertion)) {
    return await gradeScriptAssertion(assertion, workspaceDir, assistantText);
  }

  return await gradeIntentAssertion(assertion, workspaceDir, assistantText);
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
  assertion: Exclude<IntentAssertion, OutputAssertion> | OutputAssertion,
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

function gradeOutputAssertion(assertion: OutputAssertion, assistantText: string): AssertionResult {
  const text = summarizeAssertion(assertion);
  switch (assertion.method) {
    case "judge":
      return failed(text, "Output judge assertion was not sent to the judge", assertion);
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

  if (!resolved.ok) {
    return failed(text, resolved.evidence, rawAssertion);
  }

  try {
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) {
      return failed(text, `Not a file: \`${assertion.path}\``, rawAssertion);
    }
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
    if (!resolved.ok) {
      return failed(text, resolved.evidence, assertion);
    }
    try {
      haystack = await readFile(resolved.absolutePath, "utf-8");
    } catch {
      return failed(text, `No such file: \`${assertion.target.file}\``, assertion);
    }
  } else {
    haystack = assistantText;
  }

  const match = regex.exec(haystack);
  if (!match) {
    return failed(text, `No match in ${targetDescription}`, assertion);
  }

  const window = quoteMatchWindow(haystack, match.index, match[0].length);
  return {
    text,
    passed: true,
    evidence: `Match near: ${window}`,
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

  if (!resolved.ok) {
    return failed(text, resolved.evidence, assertion);
  }

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
  if (!match) {
    return failed(text, `No match in ${pathLabel}`, assertion);
  }

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

  if (!resolved.ok) {
    return failed(text, resolved.evidence, rawAssertion);
  }

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

/**
 * Resolve `relativePath` against `workspaceDir` and guarantee that the
 * resolved path stays inside `workspaceDir`. Returns a failure evidence
 * string if a path-traversal attempt is detected.
 */
function resolveInWorkspace(
  workspaceDir: string,
  relativePath: string,
): { ok: true; absolutePath: string } | { ok: false; evidence: string } {
  const root = path.resolve(workspaceDir);
  const absolute = path.resolve(root, relativePath);
  const rel = path.relative(root, absolute);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, evidence: "Path escapes workspace" };
  }

  return { ok: true, absolutePath: absolute };
}

function describeRegexTarget(assertion: RegexMatchAssertion): string {
  if (assertion.target && typeof assertion.target === "object" && "file" in assertion.target) {
    return assertion.target.file;
  }
  return "assistant-text";
}

/**
 * Quote a small window of text (40 chars) around a regex match so the
 * evidence string carries concrete context without being unbounded.
 */
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

function summarizeAssertion(assertion: EvalAssertion): string {
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

function toCaseId(id: string | number): EvalCaseId {
  return String(id);
}

/**
 * Build the default Pi-backed LLM-judge. Constructed lazily so tests
 * that always pass a custom `judge` never touch Pi. The judge sends a
 * single prompt per grading call and parses the model's JSON response.
 */
export function createDefaultLlmJudge(options: { model: ModelSelection; agentDir?: string }): LlmJudgeFn {
  return async (input) => {
    const prompt = buildJudgePrompt(input);
    const rawResponse = await piJudgeSessionRunner.run({
      model: options.model,
      credentialsAgentDir: options.agentDir,
      prompt,
    });
    return parseJudgeResponse(rawResponse, input.assertions.length);
  };
}

/**
 * Build the judge prompt. Instructions mirror Anthropic's guidance:
 * require concrete evidence for PASS (quote or file reference), never
 * an opinion. Output must be a JSON array in assertion order.
 */
export function buildJudgePrompt(input: LlmJudgeInput): string {
  const assertionList = input.assertions
    .map((assertion, i) => `${i + 1}. ${assertion}`)
    .join("\n");

  return [
    "You are an assertion grader for an agent-skill evaluation harness.",
    "",
    "You will be given the final assistant text from a run plus a numbered list of assertions.",
    "For each assertion, decide if it is satisfied by the assistant text.",
    "",
    "Rules:",
    "- Require CONCRETE evidence for PASS. Quote directly from the assistant text or cite a",
    "  specific file reference in the text. Never pass on vibes, inference, or benefit of the doubt.",
    "- If evidence is missing, weak, or ambiguous, mark the assertion as FAILED.",
    "- Evidence must be a short, literal string: either a quoted excerpt (<= 120 chars) or a brief",
    '  factual note like "No mention of .releaserc.json in the output."',
    "- Never include opinions, suggestions, or meta-commentary.",
    "",
    "Output format:",
    "Return ONLY a JSON object of the form:",
    `{ "results": [ { "passed": boolean, "evidence": string }, ... ] }`,
    `The results array must have exactly ${input.assertions.length} entries, in the same order`,
    "as the numbered assertions below.",
    "",
    "=== ASSISTANT TEXT ===",
    input.assistantText,
    "=== END ASSISTANT TEXT ===",
    "",
    "=== ASSERTIONS ===",
    assertionList,
    "=== END ASSERTIONS ===",
  ].join("\n");
}

/**
 * Parse a judge model's response text into a per-assertion array.
 * Accepts either a bare JSON object `{ results: [...] }` or a fenced
 * JSON block. Returns malformed-fallback results on any parse issue.
 */
export function parseJudgeResponse(
  rawResponse: string,
  expectedCount: number,
): LlmJudgeOutput {
  const fallback: LlmJudgeOutput = {
    results: new Array(expectedCount).fill(null).map(() => ({
      passed: false,
      evidence: JUDGE_MALFORMED_EVIDENCE,
    })),
  };

  const jsonBlob = extractJsonBlob(rawResponse);
  if (jsonBlob === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlob);
  } catch {
    return fallback;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { results?: unknown }).results)
  ) {
    return fallback;
  }

  const rawResults = (parsed as { results: unknown[] }).results;
  if (rawResults.length !== expectedCount) return fallback;

  const results: LlmJudgeOutput["results"] = [];
  for (const entry of rawResults) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { passed?: unknown }).passed !== "boolean" ||
      typeof (entry as { evidence?: unknown }).evidence !== "string"
    ) {
      return fallback;
    }
    results.push({
      passed: (entry as { passed: boolean }).passed,
      evidence: (entry as { evidence: string }).evidence,
    });
  }

  return { results };
}

/** Strip common formatting (code fences, leading prose) and isolate the first JSON object. */
function extractJsonBlob(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Handle ```json ... ``` or ``` ... ``` fences.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  // Find the first balanced JSON object in the string.
  const start = trimmed.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return null;
}
