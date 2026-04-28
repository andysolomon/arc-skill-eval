/**
 * Types for the Anthropic-standard `evals/evals.json` format and our
 * runtime-side extensions (script assertions + grading output).
 *
 * Shape reference: https://platform.claude.com/docs/en/agents-and-tools/agent-skills
 */

import type {
  EnvironmentRequirements,
  ModelSelection,
  SkillDefinition,
  ThinkingLevel,
  WorkspaceSetup,
} from "../contracts/types.js";

/** Top-level shape of a `<skill-dir>/evals/evals.json` file. */
export interface EvalsJsonFile {
  /** Optional schema/content version for forward-compatible eval suites. */
  version?: string;
  /** Matches the parent skill's `name` in SKILL.md frontmatter. */
  skill_name: string;
  /** Ordered list of cases to run. */
  evals: EvalCase[];
}

/** Domain-level eval suite used by `SkillDefinition` aggregates. */
export interface EvalSuite {
  version: string;
  cases: EvalCase[];
}

/** First-class skill aggregate with an attached eval suite. */
export type SkillEvalDefinition = SkillDefinition<EvalSuite>;

/** One test case inside `evals.json`. */
export interface EvalCase {
  /** Stable case identifier — number or string. Unique within the file. */
  id: string | number;
  /** Optional author-facing case description. */
  description?: string;
  /** The user-facing prompt the skill must handle. */
  prompt: string;
  /** Human-readable description of success. Optional but strongly encouraged. */
  expected_output?: string;
  /**
   * Explicit workspace setup. Prefer this for new cases because it
   * disambiguates whether fixture paths are preserved or flattened.
   */
  setup?: WorkspaceSetup;
  /**
   * Legacy paths to input fixtures, relative to the `evals/` directory.
   * Prefer `setup: { kind: "seeded", sources: ... }` for new cases.
   */
  files?: string[];
  /** Assertions to grade against the run output, workspace, behavior, or safety. */
  assertions?: EvalAssertion[];
  /** Optional metadata for filtering/reporting. */
  metadata?: EvalCaseMetadata;
}

export interface EvalCaseMetadata {
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
  intent?: string;
  environment?: EnvironmentRequirements;
}

/**
 * An assertion can be a legacy natural-language string / script object,
 * or a domain-level intent assertion. Legacy forms remain supported so
 * existing `evals.json` files do not need to migrate immediately.
 */
export type EvalAssertion = string | ScriptAssertion | IntentAssertion;

export type ScriptAssertion =
  | FileExistsAssertion
  | RegexMatchAssertion
  | JsonValidAssertion;

export type IntentAssertion =
  | OutputAssertion
  | WorkspaceAssertion
  | BehaviorAssertion
  | SafetyAssertion;

export type Assertion = IntentAssertion;

export interface BaseAssertion {
  id: string;
  mustPass?: boolean;
  severity?: "info" | "warn" | "error";
}

export interface OutputAssertion extends BaseAssertion {
  kind: "output";
  method: "judge" | "regex" | "exact";
  prompt?: string;
  pattern?: string;
  flags?: string;
  expected?: string;
}

export interface WorkspaceAssertion extends BaseAssertion {
  kind: "workspace";
  method: "file-exists" | "file-contains" | "json-valid" | "snapshot-diff";
  path?: string;
  pattern?: string;
  flags?: string;
}

export interface BehaviorAssertion extends BaseAssertion {
  kind: "behavior";
  method:
    | "skill-read-required"
    | "tool-call-required"
    | "tool-call-forbidden"
    | "external-call-forbidden"
    | "command-forbidden";
  value?: string;
}

export interface SafetyAssertion extends BaseAssertion {
  kind: "safety";
  method: "no-forbidden-files-touched" | "no-live-external-calls" | "custom";
  config?: unknown;
}

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

export type EvalRunVariant = "with_skill" | "without_skill";

export interface BenchmarkJson {
  benchmark_version: "1";
  run_id: string;
  skill_name: string;
  generated_at: string;
  summary: BenchmarkSummary;
  cases: BenchmarkCaseResult[];
  errors: BenchmarkCaseError[];
  metadata?: BenchmarkMetadata;
}

export interface BenchmarkSummary {
  total_cases: number;
  errored_cases: number;
  cases_with_delta: number;
  with_skill_pass_rate: number | null;
  without_skill_pass_rate: number | null;
  delta: number | null;
}

export interface BenchmarkVariantSummary {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number | null;
}

export interface BenchmarkCaseResult {
  case_id: EvalCaseId;
  with_skill: BenchmarkVariantSummary;
  without_skill: BenchmarkVariantSummary;
  delta: number | null;
}

export interface BenchmarkCaseError {
  case_id: EvalCaseId;
  message: string;
}

export interface BenchmarkMetadata {
  runtime: "pi";
  extensions: {
    artifact_root: string;
    variants: EvalRunVariant[];
    case_artifacts: Record<EvalCaseId, Partial<Record<EvalRunVariant, BenchmarkVariantArtifacts>>>;
  };
}

export interface BenchmarkVariantArtifacts {
  assistant_path: string;
  outputs_dir: string;
  timing_path: string;
  grading_path: string;
  total_tokens: number;
  duration_ms: number;
  model: ModelSelection | null;
  thinking_level: ThinkingLevel | null;
  estimated_cost_usd: number;
  context_window_tokens: number | null;
  context_window_used_percent: number | null;
}

export interface TokenUsageJson {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
}

/** Shape of `timing.json` emitted per run. */
export interface TimingJson {
  /** Back-compat summary; equal to `token_usage.total_tokens`. */
  total_tokens: number;
  duration_ms: number;
  model: ModelSelection | null;
  thinking_level: ThinkingLevel | null;
  token_usage: TokenUsageJson;
  estimated_cost_usd: number;
  context_window_tokens: number | null;
  /** Percentage from 0..100, or null when the context window is unknown. */
  context_window_used_percent: number | null;
}
