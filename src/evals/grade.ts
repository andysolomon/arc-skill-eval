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

import type {
  AssertionResult,
  EvalAssertion,
  EvalCase,
  EvalCaseId,
  FileExistsAssertion,
  GradingJson,
  JsonValidAssertion,
  RegexMatchAssertion,
  ScriptAssertion,
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
  /** Model to use for the LLM-judge. Defaults to `{ provider: "mistral", id: "ministral-8b-latest" }`. */
  judgeModel?: ModelSelection;
  /** Test-injection point for the judge call. Omit to use the default Pi-backed judge. */
  judge?: LlmJudgeFn;
}

/** Default judge model — chosen for low cost; callers can override. */
export const DEFAULT_JUDGE_MODEL: ModelSelection = {
  provider: "mistral",
  id: "ministral-8b-latest",
};

const JUDGE_MALFORMED_EVIDENCE = "Judge returned unparseable output";

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
  const stringAssertionSlots: Array<{ index: number; text: string }> = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i]!;
    if (typeof assertion === "string") {
      stringAssertionSlots.push({ index: i, text: assertion });
    } else {
      results[i] = await gradeScriptAssertion(assertion, options.workspaceDir, options.assistantText);
    }
  }

  if (stringAssertionSlots.length > 0) {
    const judge = options.judge ?? createDefaultLlmJudge({ model: options.judgeModel ?? DEFAULT_JUDGE_MODEL });
    const judgeResults = await runJudgeSafely(judge, {
      assistantText: options.assistantText,
      assertions: stringAssertionSlots.map((slot) => slot.text),
    });

    for (let j = 0; j < stringAssertionSlots.length; j++) {
      const slot = stringAssertionSlots[j]!;
      const judged = judgeResults[j] ?? { passed: false, evidence: JUDGE_MALFORMED_EVIDENCE };
      results[slot.index] = {
        text: slot.text,
        passed: judged.passed,
        evidence: judged.evidence,
        assertion: slot.text,
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
 * of length N. On throw, malformed shape, or length mismatch, every
 * assertion is marked failed with "Judge returned unparseable output".
 * Never throws.
 */
async function runJudgeSafely(
  judge: LlmJudgeFn,
  input: LlmJudgeInput,
): Promise<Array<{ passed: boolean; evidence: string }>> {
  const fallback = () =>
    input.assertions.map(() => ({ passed: false, evidence: JUDGE_MALFORMED_EVIDENCE }));

  let output: LlmJudgeOutput;
  try {
    output = await judge(input);
  } catch {
    return fallback();
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

async function gradeFileExists(
  assertion: FileExistsAssertion,
  workspaceDir: string,
): Promise<AssertionResult> {
  const text = `file-exists: ${assertion.path}`;
  const resolved = resolveInWorkspace(workspaceDir, assertion.path);

  if (!resolved.ok) {
    return failed(text, resolved.evidence, assertion);
  }

  try {
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) {
      return failed(text, `Not a file: \`${assertion.path}\``, assertion);
    }
    return {
      text,
      passed: true,
      evidence: `Found \`${assertion.path}\` (${info.size} bytes)`,
      assertion,
    };
  } catch {
    return failed(text, `No such file: \`${assertion.path}\``, assertion);
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

async function gradeJsonValid(
  assertion: JsonValidAssertion,
  workspaceDir: string,
): Promise<AssertionResult> {
  const text = `json-valid: ${assertion.path}`;
  const resolved = resolveInWorkspace(workspaceDir, assertion.path);

  if (!resolved.ok) {
    return failed(text, resolved.evidence, assertion);
  }

  let raw: string;
  try {
    raw = await readFile(resolved.absolutePath, "utf-8");
  } catch {
    return failed(text, `No such file: \`${assertion.path}\``, assertion);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      text,
      passed: true,
      evidence: `Valid JSON (${summarizeJsonValue(parsed)})`,
      assertion,
    };
  } catch (error) {
    return failed(text, `Parse error: ${(error as Error).message}`, assertion);
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
  switch (assertion.type) {
    case "file-exists":
      return `file-exists: ${assertion.path}`;
    case "json-valid":
      return `json-valid: ${assertion.path}`;
    case "regex-match":
      return `regex-match: /${assertion.pattern}/${assertion.flags ?? ""} in ${describeRegexTarget(assertion)}`;
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
export function createDefaultLlmJudge(options: { model: ModelSelection }): LlmJudgeFn {
  return async (input) => {
    const prompt = buildJudgePrompt(input);
    const rawResponse = await invokePiJudge({ model: options.model, prompt });
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

/**
 * Invoke Pi to grade a batch of string assertions. Kept as a thin seam
 * so tests that want to avoid Pi altogether can pass their own `judge`.
 * The default judge constructs a Pi agent session with no skills
 * attached and sends a single prompt.
 */
async function invokePiJudge(options: { model: ModelSelection; prompt: string }): Promise<string> {
  const pi = await import("@mariozechner/pi-coding-agent");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  const agentDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-judge-"));

  try {
    const settingsManager = pi.SettingsManager.inMemory({ compaction: { enabled: false } });
    const credentialsAgentDir = pi.getAgentDir();
    const authStorage = pi.AuthStorage.create(path.join(credentialsAgentDir, "auth.json"));
    const modelRegistry = pi.ModelRegistry.create(
      authStorage,
      path.join(credentialsAgentDir, "models.json"),
    );
    const sdkModel = modelRegistry.find(options.model.provider, options.model.id);
    if (!sdkModel) {
      throw new Error(`Unable to resolve Pi judge model ${options.model.provider}/${options.model.id}.`);
    }

    const baseLoader = new pi.DefaultResourceLoader({
      cwd: agentDir,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await baseLoader.reload();

    const { session } = await pi.createAgentSession({
      cwd: agentDir,
      agentDir,
      authStorage,
      modelRegistry,
      model: sdkModel,
      resourceLoader: baseLoader,
      sessionManager: pi.SessionManager.create(agentDir, path.join(agentDir, "sessions")),
      settingsManager,
    });

    let assistantText = "";
    const unsubscribe = session.subscribe((event: unknown) => {
      if (isTextDeltaEvent(event)) {
        assistantText += event.assistantMessageEvent.delta;
      }
    });

    try {
      await session.prompt(options.prompt);
    } finally {
      unsubscribe();
      session.dispose();
    }

    return assistantText;
  } finally {
    await rm(agentDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isTextDeltaEvent(
  event: unknown,
): event is { type: "message_update"; assistantMessageEvent: { type: "text_delta"; delta: string } } {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (event as { type?: unknown }).type === "message_update" &&
    "assistantMessageEvent" in event &&
    typeof (event as { assistantMessageEvent?: unknown }).assistantMessageEvent === "object" &&
    (event as { assistantMessageEvent?: unknown }).assistantMessageEvent !== null &&
    "type" in (event as { assistantMessageEvent: Record<string, unknown> }).assistantMessageEvent &&
    (event as { assistantMessageEvent: { type?: unknown } }).assistantMessageEvent.type === "text_delta" &&
    "delta" in (event as { assistantMessageEvent: Record<string, unknown> }).assistantMessageEvent &&
    typeof (event as { assistantMessageEvent: { delta?: unknown } }).assistantMessageEvent.delta === "string"
  );
}
