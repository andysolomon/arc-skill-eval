/**
 * Grader for an `evals/evals.json` case. Given a run's assistant text,
 * its workspace directory, and the case's assertions, produces a
 * `GradingJson` with per-assertion `{ passed, evidence }` pairs.
 *
 * String and output-judge assertions are graded by an LLM judge (Pi SDK by
 * default, but tests inject their own `judge` function). Every other script
 * and intent assertion is graded deterministically by the assertion engine.
 *
 * Reference: `docs/evals-json-pivot.md`, section "Assertion grading contract".
 */

import type { ModelSelection } from "../contracts/types.js";
import { piJudgeSessionRunner } from "../pi/session-adapter.js";
import {
  gradeDeterministicAssertion,
  isJudgeAssertion,
  judgePromptForAssertion,
  summarizeAssertion,
  type DeterministicAssertion,
} from "./assertion-engine.js";

import type { EvalTraceObservations } from "../traces/types.js";
import type {
  AssertionResult,
  EvalAssertion,
  EvalCase,
  EvalCaseId,
  GradingJson,
} from "./types.js";

/** A scored-judge rubric for the assertion at `index` in {@link LlmJudgeInput.assertions}. */
export interface JudgeRubric {
  /** Position within the batched `assertions` array this rubric applies to. */
  index: number;
  /** Rubric ceiling — the judge rates the claim on a `1..scaleMax` scale. */
  scaleMax: number;
}

export interface LlmJudgeInput {
  /** Final assistant text from the run. The judge grades this against assertions. */
  assistantText: string;
  /** Only the string assertions the judge must grade, in source order. */
  assertions: string[];
  /**
   * Sparse rubrics for scored assertions. Present only when the batch contains
   * scored judges; absent for a purely binary batch (so existing judges that
   * ignore it are unaffected).
   */
  rubrics?: JudgeRubric[];
}

export interface LlmJudgeOutput {
  /**
   * Per-assertion result in the same order as `input.assertions`. `score` is
   * present only for scored assertions (an integer on the rubric's scale); the
   * grader turns it into `passed` via the assertion's `threshold`.
   */
  results: Array<{ passed: boolean; evidence: string; score?: number }>;
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
   * Captured run trace (tool calls, skill reads, commands, touched files,
   * external calls). Required for behavior/safety assertions; when omitted,
   * those assertions fail with a "no trace" evidence.
   */
  observations?: EvalTraceObservations;
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
  const judgeAssertionSlots: Array<{
    index: number;
    text: string;
    assertion: EvalAssertion;
    /** Scored judge threshold + ceiling, when the assertion declares `threshold`. */
    scored?: { threshold: number; scaleMax: number };
  }> = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i]!;
    if (isJudgeAssertion(assertion)) {
      judgeAssertionSlots.push({
        index: i,
        text: judgePromptForAssertion(assertion),
        assertion,
        ...(scoredRubricFor(assertion) ? { scored: scoredRubricFor(assertion)! } : {}),
      });
    } else {
      results[i] = await gradeDeterministicAssertion(
        assertion as DeterministicAssertion,
        options.workspaceDir,
        options.assistantText,
        options.observations,
      );
    }
  }

  const resolvedJudgeModel = options.judgeModel ?? DEFAULT_JUDGE_MODEL;

  if (judgeAssertionSlots.length > 0) {
    const judge = options.judge ?? createDefaultLlmJudge({ model: resolvedJudgeModel, agentDir: options.agentDir });
    const rubrics: JudgeRubric[] = judgeAssertionSlots
      .map((slot, j) => (slot.scored ? { index: j, scaleMax: slot.scored.scaleMax } : null))
      .filter((r): r is JudgeRubric => r !== null);
    const judgeResults = await runJudgeSafely(judge, {
      assistantText: options.assistantText,
      assertions: judgeAssertionSlots.map((slot) => slot.text),
      ...(rubrics.length > 0 ? { rubrics } : {}),
    });

    for (let j = 0; j < judgeAssertionSlots.length; j++) {
      const slot = judgeAssertionSlots[j]!;
      const judged = judgeResults[j] ?? { passed: false, evidence: JUDGE_MALFORMED_EVIDENCE };
      results[slot.index] = slot.scored
        ? scoredResult(slot.text, slot.assertion, slot.scored, judged)
        : { text: slot.text, passed: judged.passed, evidence: judged.evidence, assertion: slot.assertion };
    }
  }

  const assertionResults: AssertionResult[] = results.map((result, index) => {
    const assertion = assertions[index]!;
    const base = result ?? {
      // Defensive fallback: should never happen because every index is filled above.
      text: summarizeAssertion(assertion),
      passed: false,
      evidence: "Grader did not produce a result",
      assertion,
    };
    const classification = classifyAssertion(assertion);
    return {
      ...base,
      ...(classification.severity ? { severity: classification.severity } : {}),
      ...(classification.soft ? { soft: true } : {}),
    };
  });

  const passed = assertionResults.filter((r) => r.passed).length;
  // Split misses into hard failures (fail the run by default) and soft misses
  // (recorded, but fail the run only under `--strict`).
  const misses = assertionResults.filter((r) => !r.passed);
  const softFailed = misses.filter((r) => r.soft).length;
  const failed = misses.length - softFailed;
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
      soft_failed: softFailed,
      total,
      pass_rate: total === 0 ? null : passed / total,
    },
  };
}

/** Rubric ceiling used when a scored judge sets `threshold` without a `scaleMax`. */
const DEFAULT_JUDGE_SCALE_MAX = 5;

/**
 * A scored-judge rubric for an assertion, or null if it is a plain (binary)
 * judge. Scoring applies only to output judge assertions carrying a numeric
 * `threshold`; bare-string judges are always binary.
 */
function scoredRubricFor(assertion: EvalAssertion): { threshold: number; scaleMax: number } | null {
  if (typeof assertion !== "object" || assertion === null || !("kind" in assertion)) return null;
  if (assertion.kind !== "output" || assertion.method !== "judge") return null;
  if (typeof assertion.threshold !== "number") return null;
  const scaleMax = typeof assertion.scaleMax === "number" ? assertion.scaleMax : DEFAULT_JUDGE_SCALE_MAX;
  return { threshold: assertion.threshold, scaleMax };
}

/**
 * Turn a scored judge's response into an `AssertionResult`. Pass is decided by
 * the rubric threshold, not the judge's own boolean. A judge that returned no
 * numeric score falls back to its boolean verdict so a weak model never hard-
 * fails on shape alone.
 */
function scoredResult(
  text: string,
  assertion: EvalAssertion,
  scored: { threshold: number; scaleMax: number },
  judged: { passed: boolean; evidence: string; score?: number },
): AssertionResult {
  const hasScore = typeof judged.score === "number" && Number.isFinite(judged.score);
  const score = hasScore ? clampScore(judged.score as number, scored.scaleMax) : undefined;
  const passed = score !== undefined ? score >= scored.threshold : judged.passed;
  const prefix =
    score !== undefined
      ? `score ${score}/${scored.scaleMax} (need >= ${scored.threshold}) — `
      : "no score returned — ";
  return {
    text,
    passed,
    evidence: `${prefix}${judged.evidence}`,
    assertion,
    ...(score !== undefined ? { score, scoreScale: scored.scaleMax } : {}),
  };
}

/** Clamp a judge's score into `[1, scaleMax]`; scores arrive from an LLM and may drift. */
function clampScore(score: number, scaleMax: number): number {
  if (score < 1) return 1;
  if (score > scaleMax) return scaleMax;
  return score;
}

/**
 * Classify an assertion's severity and whether a miss is soft. Only intent
 * assertions (objects with a `kind`) can be soft — a bare string or a legacy
 * script (`type`) assertion is always hard. Soft applies when the assertion
 * declares `mustPass: false` or an `info`/`warn` severity.
 */
function classifyAssertion(assertion: EvalAssertion): { severity?: "info" | "warn" | "error"; soft: boolean } {
  if (typeof assertion !== "object" || !("kind" in assertion)) {
    return { soft: false };
  }
  const severity = assertion.severity;
  const soft = assertion.mustPass === false || severity === "info" || severity === "warn";
  return { ...(severity ? { severity } : {}), soft };
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
): Promise<Array<{ passed: boolean; evidence: string; score?: number }>> {
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

  const normalized: Array<{ passed: boolean; evidence: string; score?: number }> = [];
  for (const entry of output.results) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.passed !== "boolean" ||
      typeof entry.evidence !== "string"
    ) {
      return fallback();
    }
    normalized.push({
      passed: entry.passed,
      evidence: entry.evidence,
      ...(typeof entry.score === "number" && Number.isFinite(entry.score) ? { score: entry.score } : {}),
    });
  }

  return normalized;
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
  const scaleByIndex = new Map((input.rubrics ?? []).map((r) => [r.index, r.scaleMax]));
  const assertionList = input.assertions
    .map((assertion, i) => {
      const scaleMax = scaleByIndex.get(i);
      return scaleMax !== undefined
        ? `${i + 1}. [SCORED 1-${scaleMax}] ${assertion}`
        : `${i + 1}. ${assertion}`;
    })
    .join("\n");

  const scoredNote =
    scaleByIndex.size > 0
      ? [
          "",
          "Some assertions are marked [SCORED 1-N]. For those, do NOT decide pass/fail — instead",
          '  rate how fully the assistant text satisfies the claim as an integer `score` from 1',
          "  (not at all) to N (completely). Still include `passed` (your best binary read) and",
          "  `evidence`. For all other (unmarked) assertions, omit `score` and just decide `passed`.",
        ]
      : [];

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
    ...scoredNote,
    "",
    "Output format:",
    "Return ONLY a JSON object of the form:",
    `{ "results": [ { "passed": boolean, "evidence": string, "score"?: number }, ... ] }`,
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
    const rawScore = (entry as { score?: unknown }).score;
    results.push({
      passed: (entry as { passed: boolean }).passed,
      evidence: (entry as { evidence: string }).evidence,
      ...(typeof rawScore === "number" && Number.isFinite(rawScore) ? { score: rawScore } : {}),
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
