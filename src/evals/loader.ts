import { readFile } from "node:fs/promises";
import path from "node:path";

import { Result, Schema, SchemaIssue } from "effect";

import {
  FIXTURE_KIND_VALUES,
  NETWORK_MODE_VALUES,
  SANDBOX_MODE_VALUES,
  TOOL_REQUIREMENT_MODE_VALUES,
  WORKSPACE_KIND_VALUES,
  WORKSPACE_MOUNT_MODE_VALUES,
} from "../contracts/types.js";
import type { SandboxCommandMock, SandboxMode, WorkspaceSetup } from "../contracts/types.js";

import type {
  EvalAssertion,
  EvalCase,
  EvalsJsonFile,
  IntentAssertion,
  ScriptAssertion,
} from "./types.js";

export class EvalsJsonValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "EvalsJsonValidationError";
    this.issues = issues;
  }
}

const NON_EMPTY = "must be a non-empty string";
const STRING = "must be a string";
const BOOLEAN = "must be a boolean";

const required = <S extends Schema.Top>(schema: S, message: string) =>
  schema.annotate({ message }).pipe(Schema.annotateKey({ messageMissingKey: message }));

const optional = <S extends Schema.Top>(schema: S, message: string) =>
  // The `| undefined` wrapper is itself a union, which reports its own error
  // for a wrong-typed value, so it carries the message too.
  Schema.optionalKey(Schema.UndefinedOr(schema.annotate({ message })).annotate({ message }));

const oneOfMessage = (values: ReadonlyArray<string>) => `must be one of [${values.join(", ")}]`;

const oneOf = <const L extends ReadonlyArray<string>>(values: L) =>
  Schema.Literals(values).annotate({ message: oneOfMessage(values) });

const optionalOneOf = <const L extends ReadonlyArray<string>>(values: L) => optional(oneOf(values), oneOfMessage(values));

const list = <S extends Schema.Top>(item: S, message: string) =>
  Schema.mutable(Schema.Array(item)).annotate({ message });

// A refined schema reports the base type's error for wrong-typed input, so the
// message goes on both the base and the refinement.
const nonEmpty = Schema.String.annotate({ message: NON_EMPTY }).check(Schema.isNonEmpty({ message: NON_EMPTY }));
const finite = (message: string) => Schema.Number.annotate({ message }).check(Schema.isFinite({ message }));

const forbidden = (message: string) => optional(Schema.Never, message);

const isValidRegex = (pattern: string, flags: string | undefined): boolean => {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
};

const compilesAsRegex = <A extends object>(field: keyof A & string, when?: (value: A) => boolean) =>
  Schema.makeFilter<A>((value) => {
    if (when && !when(value)) return undefined;
    const pattern: unknown = value[field];
    const flags: unknown = (value as { readonly flags?: unknown }).flags;
    if (typeof pattern !== "string" || isValidRegex(pattern, typeof flags === "string" ? flags : undefined)) {
      return undefined;
    }
    return { path: [field], issue: "is not a valid regular expression" };
  });

const SETUP_MESSAGE = `must be an object with \`kind\` from [${WORKSPACE_KIND_VALUES.join(", ")}]`;

const WorkspaceSource = Schema.Struct({
  from: required(nonEmpty, NON_EMPTY),
  to: optional(Schema.String, STRING),
}).annotate({ message: "must be an object" });

const WorkspaceSetupSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("empty") }),
  Schema.Struct({
    kind: Schema.Literal("seeded"),
    sources: required(list(WorkspaceSource, "must be an array"), "must be an array"),
    mountMode: optionalOneOf(WORKSPACE_MOUNT_MODE_VALUES),
  }),
  Schema.Struct({
    kind: Schema.Literal("fixture"),
    fixture: required(
      Schema.Struct({
        kind: required(oneOf(FIXTURE_KIND_VALUES), oneOfMessage(FIXTURE_KIND_VALUES)),
        source: required(nonEmpty, NON_EMPTY),
        initGit: optional(Schema.Boolean, BOOLEAN),
      }),
      "must be an object",
    ),
  }),
]).annotate({ message: SETUP_MESSAGE });

const SandboxMockFile = Schema.Struct({
  path: required(nonEmpty, NON_EMPTY),
  content: required(Schema.String, STRING),
}).annotate({ message: "must be an object" });

const SandboxMock = Schema.Struct({
  command: required(nonEmpty, NON_EMPTY),
  stdout: optional(Schema.String, STRING),
  stderr: optional(Schema.String, STRING),
  exitCode: optional(Schema.Number.check(Schema.isInt({ message: "must be an integer" })), "must be an integer"),
  files: optional(list(SandboxMockFile, "must be an array"), "must be an array"),
}).annotate({ message: "must be an object" });

const EnvironmentRequirementsSchema = Schema.Struct({
  workspace: required(
    Schema.Struct({
      kind: required(oneOf(WORKSPACE_KIND_VALUES), oneOfMessage(WORKSPACE_KIND_VALUES)),
      writable: required(Schema.Boolean, BOOLEAN),
    }),
    "must be an object",
  ),
  git: optional(Schema.Struct({ required: required(Schema.Boolean, BOOLEAN) }), "must be an object"),
  network: optional(
    Schema.Struct({
      mode: required(oneOf(NETWORK_MODE_VALUES), oneOfMessage(NETWORK_MODE_VALUES)),
    }),
    "must be an object",
  ),
  tools: optional(
    list(
      Schema.Struct({
        name: required(nonEmpty, NON_EMPTY),
        required: required(Schema.Boolean, BOOLEAN),
        mode: optionalOneOf(TOOL_REQUIREMENT_MODE_VALUES),
      }).annotate({ message: "must be an object" }),
      "must be an array",
    ),
    "must be an array",
  ),
  envVars: optional(
    list(
      Schema.Struct({
        name: required(nonEmpty, NON_EMPTY),
        required: required(Schema.Boolean, BOOLEAN),
        secret: optional(Schema.Boolean, BOOLEAN),
      }).annotate({ message: "must be an object" }),
      "must be an array",
    ),
    "must be an array",
  ),
}).annotate({ message: "must be an object" });

const Metadata = Schema.Struct({
  tags: optional(list(Schema.String.annotate({ message: STRING }), "must be an array of strings"), "must be an array of strings"),
  difficulty: optionalOneOf(["easy", "medium", "hard"]),
  intent: optional(Schema.String, STRING),
  environment: optional(EnvironmentRequirementsSchema, "must be an object"),
  covers: optional(list(Schema.String.annotate({ message: STRING }), "must be an array of strings"), "must be an array of strings"),
}).annotate({ message: "must be an object" });

const SCRIPT_ASSERTION_TYPES = ["file-exists", "file-absent", "regex-match", "json-valid"] as const;

const HARD_ONLY = Schema.optionalKey(
  Schema.Never.annotate({
    message:
      "only applies to an assertion with `kind`; a `type` script assertion always fails the run when it misses. " +
      'For a soft file check write { "id": "<slug>", "kind": "workspace", "method": "file-exists", "path": "<relative>", "mustPass": false }',
  }),
);

const scriptBase = { mustPass: HARD_ONLY, severity: HARD_ONLY };

// Union members are told apart by single-literal fields; a member keyed on
// several literals isn't, and its errors would leak into unrelated
// assertions. So there is one struct per `type` (and per `method` below).
const pathScriptAssertion = <T extends "file-exists" | "file-absent" | "json-valid">(type: T) =>
  Schema.Struct({ type: Schema.Literal(type), path: required(nonEmpty, NON_EMPTY), ...scriptBase });

const RegexMatchAssertion = Schema.Struct({
  ...scriptBase,
  type: Schema.Literal("regex-match"),
  pattern: required(nonEmpty, NON_EMPTY),
  flags: optional(Schema.String, STRING),
  target: optional(
    Schema.Union([Schema.Literal("assistant-text"), Schema.Struct({ file: required(Schema.String, STRING) })]),
    'must be "assistant-text" or { file: string }',
  ),
}).check(compilesAsRegex("pattern"));

const INTENT_ASSERTION_KINDS = ["output", "workspace", "behavior", "safety"] as const;

const intentBase = {
  id: required(nonEmpty, NON_EMPTY),
  mustPass: optional(Schema.Boolean, BOOLEAN),
  severity: optionalOneOf(["info", "warn", "error"]),
  type: Schema.optionalKey(Schema.Never.annotate({ message: oneOfMessage(SCRIPT_ASSERTION_TYPES) })),
};

const methodMessage = (label: string, methods: ReadonlyArray<string>) =>
  `must declare \`method\` from [${methods.join(", ")}] (${label})`;

const OUTPUT_METHODS = ["judge", "regex", "exact"] as const;
const WORKSPACE_METHODS = ["file-exists", "file-absent", "file-contains", "json-valid", "snapshot-diff"] as const;
const SAFETY_METHODS = ["no-forbidden-files-touched", "no-live-external-calls", "custom"] as const;
const BEHAVIOR_METHODS = [
  "skill-read-required",
  "tool-call-required",
  "tool-call-forbidden",
  "external-call-forbidden",
  "command-forbidden",
] as const;

const method = <M extends string>(value: M, all: ReadonlyArray<string>) =>
  required(Schema.Literal(value), oneOfMessage(all));

const JUDGE_ONLY = 'is only valid on an output assertion with `method: "judge"`';

const OutputJudge = Schema.Struct({
  ...intentBase,
  kind: Schema.Literal("output"),
  method: method("judge", OUTPUT_METHODS),
  prompt: optional(Schema.String, STRING),
  threshold: optional(finite("must be a finite number"), "must be a finite number"),
  scaleMax: optional(
    finite("must be a number >= 2").check(Schema.isGreaterThanOrEqualTo(2, { message: "must be a number >= 2" })),
    "must be a number >= 2",
  ),
}).check(
  Schema.makeFilter((value) => {
    if (value.threshold === undefined) {
      return value.scaleMax === undefined ? undefined : { path: ["threshold"], issue: "is required when `scaleMax` is set" };
    }
    const ceiling = value.scaleMax ?? 5;
    return value.threshold >= 1 && value.threshold <= ceiling
      ? undefined
      : { path: ["threshold"], issue: `must be between 1 and ${ceiling} (the scaleMax)` };
  }),
);

const OutputRegex = Schema.Struct({
  ...intentBase,
  kind: Schema.Literal("output"),
  method: method("regex", OUTPUT_METHODS),
  pattern: required(nonEmpty, NON_EMPTY),
  flags: optional(Schema.String, STRING),
  threshold: forbidden(JUDGE_ONLY),
  scaleMax: forbidden(JUDGE_ONLY),
}).check(compilesAsRegex("pattern"));

const OutputExact = Schema.Struct({
  ...intentBase,
  kind: Schema.Literal("output"),
  method: method("exact", OUTPUT_METHODS),
  expected: required(Schema.String, STRING),
  threshold: forbidden(JUDGE_ONLY),
  scaleMax: forbidden(JUDGE_ONLY),
});

const OutputAssertion = Schema.Union([OutputJudge, OutputRegex, OutputExact]).annotate({
  message: methodMessage("output assertion", OUTPUT_METHODS),
});

const workspacePathAssertion = <M extends "file-exists" | "file-absent" | "json-valid">(methodName: M) =>
  Schema.Struct({
    ...intentBase,
    kind: Schema.Literal("workspace"),
    method: method(methodName, WORKSPACE_METHODS),
    path: required(nonEmpty, NON_EMPTY),
  });

const WorkspaceAssertion = Schema.Union([
  workspacePathAssertion("file-exists"),
  workspacePathAssertion("file-absent"),
  workspacePathAssertion("json-valid"),
  Schema.Struct({
    ...intentBase,
    kind: Schema.Literal("workspace"),
    method: method("file-contains", WORKSPACE_METHODS),
    path: required(nonEmpty, NON_EMPTY),
    pattern: required(nonEmpty, NON_EMPTY),
    flags: optional(Schema.String, STRING),
  }).check(compilesAsRegex("pattern")),
  Schema.Struct({
    ...intentBase,
    kind: Schema.Literal("workspace"),
    method: method("snapshot-diff", WORKSPACE_METHODS),
  }),
]).annotate({
  message: methodMessage("workspace assertion", WORKSPACE_METHODS),
});

const BehaviorAssertion = Schema.Struct({
  ...intentBase,
  kind: Schema.Literal("behavior"),
  method: required(oneOf(BEHAVIOR_METHODS), oneOfMessage(BEHAVIOR_METHODS)),
  value: optional(Schema.String, STRING),
  match: optional(Schema.String, STRING),
  matchKind: optionalOneOf(["substring", "regex"]),
}).check(compilesAsRegex("match", (value) => value.matchKind === "regex"));

const SafetyAssertion = Schema.Union([
  Schema.Struct({
    ...intentBase,
    kind: Schema.Literal("safety"),
    method: method("no-forbidden-files-touched", SAFETY_METHODS),
    config: required(
      Schema.Struct({
        paths: required(
          list(Schema.String.annotate({ message: STRING }), "must be an array of strings"),
          "must be an array of strings",
        ),
      }),
      "must be an object with `paths` (an array of strings)",
    ),
  }),
  ...(["no-live-external-calls", "custom"] as const).map((methodName) =>
    Schema.Struct({
      ...intentBase,
      kind: Schema.Literal("safety"),
      method: method(methodName, SAFETY_METHODS),
      config: Schema.optional(Schema.Unknown),
    }),
  ),
]).annotate({
  message: methodMessage("safety assertion", SAFETY_METHODS),
});

const Assertion = Schema.Union([
  Schema.String.check(Schema.isNonEmpty({ message: "string assertion must be non-empty" })),
  pathScriptAssertion("file-exists"),
  pathScriptAssertion("file-absent"),
  pathScriptAssertion("json-valid"),
  RegexMatchAssertion,
  OutputAssertion,
  WorkspaceAssertion,
  BehaviorAssertion,
  SafetyAssertion,
]).annotate({
  message:
    `must be a non-empty string, a script assertion with \`type\` from [${SCRIPT_ASSERTION_TYPES.join(", ")}], ` +
    `or an intent assertion with \`kind\` from [${INTENT_ASSERTION_KINDS.join(", ")}]`,
});

const EvalCaseSchema = Schema.Struct({
  id: required(Schema.Union([Schema.String, Schema.Number]), "must be a string or number"),
  description: optional(Schema.String, STRING),
  prompt: required(nonEmpty, NON_EMPTY),
  expected_output: optional(Schema.String, STRING),
  setup: optional(WorkspaceSetupSchema, SETUP_MESSAGE),
  files: optional(list(Schema.String.annotate({ message: STRING }), "must be an array of strings"), "must be an array of strings"),
  assertions: optional(list(Assertion, "must be an array"), "must be an array"),
  sandbox: optionalOneOf(SANDBOX_MODE_VALUES),
  sandboxMocks: optional(list(SandboxMock, "must be an array"), "must be an array"),
  metadata: optional(Metadata, "must be an object"),
}).annotate({ message: "case must be a JSON object" });

/** The `evals/evals.json` schema. The decoded type is checked against `EvalsJsonFile` below. */
export const EvalsJsonFileSchema = Schema.Struct({
  version: optional(Schema.String, STRING),
  skill_name: required(nonEmpty, NON_EMPTY),
  evals: required(list(EvalCaseSchema, "must be an array"), "must be an array"),
})
  .annotate({ message: "Top-level value must be a JSON object." })
  .check(
    Schema.makeFilter((file) => {
      const seen = new Set<string>();
      const duplicates: Array<{ path: Array<PropertyKey>; issue: string }> = [];
      file.evals.forEach((evalCase, index) => {
        const key = String(evalCase.id);
        if (seen.has(key)) duplicates.push({ path: ["evals", index], issue: `duplicate id ${key}` });
        seen.add(key);
      });
      return duplicates;
    }),
  );

/**
 * Compile-time guard: anything the schema accepts must fit the hand-written
 * types in `types.ts`. If a field changes in one place but not the other,
 * this stops compiling.
 */
type AssertTrue<T extends true> = T;
export type EvalsJsonSchemaMatchesTypes = AssertTrue<
  typeof EvalsJsonFileSchema.Type extends EvalsJsonFile ? true : false
>;

/**
 * Read and validate an `evals/evals.json` file. Returns the parsed
 * shape, frozen against further mutation. Throws
 * `EvalsJsonValidationError` with a human-readable issue list when the
 * file is malformed.
 */
export async function readEvalsJson(absolutePath: string): Promise<EvalsJsonFile> {
  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf-8");
  } catch (error) {
    throw new EvalsJsonValidationError(`Unable to read evals.json at ${absolutePath}`, [
      (error as Error).message,
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new EvalsJsonValidationError(
      `Invalid JSON in ${path.basename(absolutePath)}`,
      [(error as Error).message],
    );
  }

  return validateEvalsJsonValue(parsed, absolutePath);
}

const decodeEvalsJson = Schema.decodeUnknownResult(EvalsJsonFileSchema, { errors: "all" });
const toIssueList = SchemaIssue.makeFormatterStandardSchemaV1();

export function validateEvalsJsonValue(value: unknown, sourceDescription = "evals.json"): EvalsJsonFile {
  const result = decodeEvalsJson(value);

  if (Result.isFailure(result)) {
    const issues = [...new Set(toIssueList(result.failure.issue).issues.map(formatIssue))];
    throw new EvalsJsonValidationError(
      `evals.json at ${sourceDescription} failed validation (${issues.length} issue${
        issues.length === 1 ? "" : "s"
      })`,
      issues,
    );
  }

  // The schema drops keys it doesn't know. Build the result from the
  // original value instead, so nested objects (assertions, setup, metadata)
  // keep any extra keys exactly as written.
  const file = value as EvalsJsonFile;
  return Object.freeze({
    version: file.version,
    skill_name: file.skill_name,
    evals: file.evals.map(freezeCase),
  });
}

function freezeCase(value: EvalCase): EvalCase {
  return Object.freeze({
    id: value.id,
    description: value.description,
    prompt: value.prompt,
    expected_output: value.expected_output,
    setup: value.setup as WorkspaceSetup | undefined,
    files: value.files,
    assertions: value.assertions,
    sandbox: value.sandbox as SandboxMode | undefined,
    sandboxMocks: value.sandboxMocks as SandboxCommandMock[] | undefined,
    metadata: value.metadata,
  });
}

function formatIssue(issue: { readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> | undefined; readonly message: string }): string {
  const keys = (issue.path ?? []).map((segment) => (typeof segment === "object" ? segment.key : segment));
  const [head, index, ...rest] = keys;
  if (head === "evals" && typeof index === "number") {
    return `evals[${index}]: ${atPath(rest, issue.message)}`;
  }
  return atPath(keys, issue.message);
}

function atPath(keys: ReadonlyArray<PropertyKey>, message: string): string {
  if (keys.length === 0) return message;
  const rendered = keys.reduce<string>(
    (acc, key) => (typeof key === "number" ? `${acc}[${key}]` : acc === "" ? String(key) : `${acc}.${String(key)}`),
    "",
  );
  return `\`${rendered}\` ${message}`;
}

export function isScriptAssertion(assertion: EvalAssertion): assertion is ScriptAssertion {
  return typeof assertion !== "string" && "type" in assertion;
}

export function isIntentAssertion(assertion: EvalAssertion): assertion is IntentAssertion {
  return typeof assertion !== "string" && "kind" in assertion;
}
