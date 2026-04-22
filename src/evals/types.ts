/**
 * Types for the Anthropic-standard `evals/evals.json` format and our
 * runtime-side extensions (script assertions + grading output).
 *
 * Shape reference: https://platform.claude.com/docs/en/agents-and-tools/agent-skills
 */

/** Top-level shape of a `<skill-dir>/evals/evals.json` file. */
export interface EvalsJsonFile {
  /** Matches the parent skill's `name` in SKILL.md frontmatter. */
  skill_name: string;
  /** Ordered list of cases to run. */
  evals: EvalCase[];
}

/** One test case inside `evals.json`. */
export interface EvalCase {
  /** Stable case identifier — number or string. Unique within the file. */
  id: string | number;
  /** The user-facing prompt the skill must handle. */
  prompt: string;
  /** Human-readable description of success. Optional but strongly encouraged. */
  expected_output?: string;
  /**
   * Paths to input fixtures, relative to the `evals/` directory. The
   * loader does not validate existence; the runner materializes them
   * into the per-case workspace at execution time.
   */
  files?: string[];
  /**
   * Assertions to grade against the run output. String entries are
   * LLM-judged. Object entries are deterministic script assertions.
   */
  assertions?: EvalAssertion[];
}

/**
 * An assertion is either a natural-language string (graded by an
 * LLM-judge) or a typed script assertion (graded deterministically).
 */
export type EvalAssertion = string | ScriptAssertion;

export type ScriptAssertion =
  | FileExistsAssertion
  | RegexMatchAssertion
  | JsonValidAssertion;

/** Passes iff the file exists at `path` (relative to the case workspace) after the run. */
export interface FileExistsAssertion {
  type: "file-exists";
  path: string;
}

/**
 * Passes iff `pattern` matches `target`. `target` defaults to
 * `"assistant-text"` (the final assistant message). Can also target a
 * file path read from the case workspace.
 */
export interface RegexMatchAssertion {
  type: "regex-match";
  pattern: string;
  flags?: string;
  target?: "assistant-text" | { file: string };
}

/** Passes iff the file at `path` parses as JSON. */
export interface JsonValidAssertion {
  type: "json-valid";
  path: string;
}

/** Stable tag for rendering + grading-result join. Derived from the case. */
export type EvalCaseId = string;

/**
 * One graded assertion result inside `grading.json`.
 */
export interface AssertionResult {
  /** Exact text for a string assertion, or a short summary for a script assertion. */
  text: string;
  passed: boolean;
  /** Concrete quote / file reference / script output — never an opinion. */
  evidence: string;
  /** The raw assertion the result was computed from. */
  assertion: EvalAssertion;
}

/** Shape of `grading.json` emitted per case. */
export interface GradingJson {
  case_id: EvalCaseId;
  assertion_results: AssertionResult[];
  summary: {
    passed: number;
    failed: number;
    total: number;
    /** 0..1. `null` when `total === 0`. */
    pass_rate: number | null;
  };
}

/** Shape of `timing.json` emitted per run. */
export interface TimingJson {
  total_tokens: number;
  duration_ms: number;
}
