/**
 * Typed, pure assertion helpers for `defineSkillEval`. Each helper returns an
 * {@link AssertionBuilder} that serializes to a plain `EvalAssertion` — the same
 * shape the runtime loader accepts. Helpers are synchronous and do no I/O;
 * fixtures stay as case `setup` / `files` data.
 *
 * Severity chaining (`.gate()` / `.soft()` / `.severity()` / `.id()`) upgrades
 * an assertion to its richer *intent* form only when needed — otherwise the
 * builder emits the cheapest valid shape (a bare string for judges, a
 * `{ type }` script object for file/regex checks). See
 * `docs/eve-eval-leverage.md` (workstream D).
 */

import type {
  BehaviorAssertion,
  EvalAssertion,
  IntentAssertion,
  ScriptAssertion,
  SafetyAssertion,
} from "../types.js";

type Severity = "info" | "warn" | "error";
type IntentFactory = (id: string) => IntentAssertion;

/** A tool-input matcher for `toolRequired` / `toolForbidden`. */
export interface ToolMatchOptions {
  /** Substring (default) or regex source tested against the tool call's input summary. */
  match?: string;
  matchKind?: "substring" | "regex";
}

/**
 * Chainable, JSON-serializable assertion. Prefer the named helper functions
 * (`fileExists`, `judge`, `toolRequired`, …) over constructing this directly.
 */
export class AssertionBuilder {
  private readonly scriptForm?: ScriptAssertion;
  private readonly stringForm?: string;
  private readonly intentFactory: IntentFactory;
  private readonly idHint: string;
  private overrideId?: string;
  private overrideMustPass?: boolean;
  private overrideSeverity?: Severity;

  constructor(opts: {
    idHint: string;
    intent: IntentFactory;
    script?: ScriptAssertion;
    string?: string;
  }) {
    this.idHint = opts.idHint;
    this.intentFactory = opts.intent;
    this.scriptForm = opts.script;
    this.stringForm = opts.string;
  }

  /** Set a stable assertion id (used to join grading results). Forces the intent form. */
  id(id: string): this {
    this.overrideId = id;
    return this;
  }

  /** Hard-gate this assertion — a miss fails the run (the default). */
  gate(): this {
    this.overrideMustPass = true;
    return this;
  }

  /** Soft — a miss is recorded but does not fail the run unless `--strict`. */
  soft(): this {
    this.overrideMustPass = false;
    return this;
  }

  /** Set an explicit severity. `info`/`warn` imply soft; `error` is hard. */
  severity(level: Severity): this {
    this.overrideSeverity = level;
    return this;
  }

  private hasOverride(): boolean {
    return (
      this.overrideId !== undefined ||
      this.overrideMustPass !== undefined ||
      this.overrideSeverity !== undefined
    );
  }

  /**
   * Produce the concrete `EvalAssertion`. `caseId`/`index` seed an auto id for
   * the intent form when the author did not set one via `.id()`. Called by
   * {@link defineSkillEval}; `JSON.stringify` also reaches it via `toJSON`.
   */
  finalize(caseId = "case", index = 0): EvalAssertion {
    if (!this.hasOverride()) {
      if (this.stringForm !== undefined) return this.stringForm;
      if (this.scriptForm !== undefined) return this.scriptForm;
    }

    const id = this.overrideId ?? `${caseId}-${this.idHint}-${index + 1}`;
    const intent = this.intentFactory(id);
    if (this.overrideMustPass !== undefined) intent.mustPass = this.overrideMustPass;
    if (this.overrideSeverity !== undefined) intent.severity = this.overrideSeverity;
    return intent;
  }

  toJSON(): EvalAssertion {
    return this.finalize();
  }
}

/** Any value accepted in a case's `assertions` array. */
export type AssertionInput = AssertionBuilder | string | EvalAssertion;

// ---------------------------------------------------------------------------
// Workspace / file checks — cheap `{ type }` script form by default.
// ---------------------------------------------------------------------------

/** Passes iff the file exists at `path` after the run. */
export function fileExists(path: string): AssertionBuilder {
  return new AssertionBuilder({
    idHint: "file-exists",
    script: { type: "file-exists", path },
    intent: (id) => ({ id, kind: "workspace", method: "file-exists", path }),
  });
}

/** Passes iff NO file exists at `path` after the run. */
export function fileAbsent(path: string): AssertionBuilder {
  return new AssertionBuilder({
    idHint: "file-absent",
    script: { type: "file-absent", path },
    intent: (id) => ({ id, kind: "workspace", method: "file-absent", path }),
  });
}

/** Passes iff the file at `path` parses as JSON. */
export function jsonValid(path: string): AssertionBuilder {
  return new AssertionBuilder({
    idHint: "json-valid",
    script: { type: "json-valid", path },
    intent: (id) => ({ id, kind: "workspace", method: "json-valid", path }),
  });
}

/**
 * Passes iff `pattern` matches. With `opts.file` it matches that workspace
 * file; otherwise it matches the final assistant text.
 */
export function regexMatch(
  pattern: string,
  opts: { file?: string; flags?: string } = {},
): AssertionBuilder {
  const { file, flags } = opts;
  const script: ScriptAssertion = {
    type: "regex-match",
    pattern,
    ...(flags ? { flags } : {}),
    ...(file ? { target: { file } } : {}),
  };
  return new AssertionBuilder({
    idHint: "regex",
    script,
    intent: file
      ? (id) => ({ id, kind: "workspace", method: "file-contains", path: file, pattern, ...(flags ? { flags } : {}) })
      : (id) => ({ id, kind: "output", method: "regex", pattern, ...(flags ? { flags } : {}) }),
  });
}

/** Passes iff the final assistant text equals `expected` exactly. Intent-only. */
export function exact(expected: string): AssertionBuilder {
  return new AssertionBuilder({
    idHint: "exact",
    intent: (id) => ({ id, kind: "output", method: "exact", expected }),
  });
}

// ---------------------------------------------------------------------------
// Judge — bare string by default; upgrades to an output-judge intent form.
// ---------------------------------------------------------------------------

/** An LLM-judged rubric. Emits a bare string unless severity/id is chained. */
export function judge(prompt: string): AssertionBuilder {
  return new AssertionBuilder({
    idHint: "judge",
    string: prompt,
    intent: (id) => ({ id, kind: "output", method: "judge", prompt }),
  });
}

// ---------------------------------------------------------------------------
// Behavior — trace-graded. Always intent form (they require an id).
// ---------------------------------------------------------------------------

function behavior(
  method: BehaviorAssertion["method"],
  idHint: string,
  value: string | undefined,
  opts: ToolMatchOptions = {},
): AssertionBuilder {
  return new AssertionBuilder({
    idHint,
    intent: (id) => ({
      id,
      kind: "behavior",
      method,
      ...(value !== undefined ? { value } : {}),
      ...(opts.match !== undefined ? { match: opts.match } : {}),
      ...(opts.matchKind !== undefined ? { matchKind: opts.matchKind } : {}),
    }),
  });
}

/** Passes iff the run called `tool` (optionally matching its input). */
export function toolRequired(tool: string, opts?: ToolMatchOptions): AssertionBuilder {
  return behavior("tool-call-required", "tool-required", tool, opts);
}

/** Passes iff the run never called `tool`. */
export function toolForbidden(tool: string, opts?: ToolMatchOptions): AssertionBuilder {
  return behavior("tool-call-forbidden", "tool-forbidden", tool, opts);
}

/** Passes iff the named skill was read (any skill when `skill` is omitted). */
export function skillReadRequired(skill?: string): AssertionBuilder {
  return behavior("skill-read-required", "skill-read", skill);
}

/** Passes iff no bash command matched `value`. */
export function commandForbidden(value: string, opts?: ToolMatchOptions): AssertionBuilder {
  return behavior("command-forbidden", "command-forbidden", value, opts);
}

/** Passes iff no external call matched `value` (any external call when omitted). */
export function externalCallForbidden(value?: string): AssertionBuilder {
  return behavior("external-call-forbidden", "external-forbidden", value);
}

// ---------------------------------------------------------------------------
// Safety — trace-graded. Always intent form.
// ---------------------------------------------------------------------------

function safety(method: SafetyAssertion["method"], idHint: string, config?: unknown): AssertionBuilder {
  return new AssertionBuilder({
    idHint,
    intent: (id) => ({ id, kind: "safety", method, ...(config !== undefined ? { config } : {}) }),
  });
}

/** Passes iff none of `paths` were written or edited during the run. */
export function noForbiddenFilesTouched(paths: string[]): AssertionBuilder {
  return safety("no-forbidden-files-touched", "no-forbidden-files", { paths });
}

/** Passes iff the run made no live external calls. */
export function noLiveExternalCalls(): AssertionBuilder {
  return safety("no-live-external-calls", "no-live-external");
}
