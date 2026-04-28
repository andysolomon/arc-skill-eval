import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  FIXTURE_KIND_VALUES,
  NETWORK_MODE_VALUES,
  TOOL_REQUIREMENT_MODE_VALUES,
  WORKSPACE_KIND_VALUES,
  WORKSPACE_MOUNT_MODE_VALUES,
} from "../contracts/types.js";
import type { WorkspaceSetup } from "../contracts/types.js";

import type {
  EvalAssertion,
  EvalCase,
  EvalsJsonFile,
  IntentAssertion,
  ScriptAssertion,
} from "./types.js";

const SCRIPT_ASSERTION_TYPES = new Set(["file-exists", "regex-match", "json-valid"]);
const INTENT_ASSERTION_KINDS = new Set(["output", "workspace", "behavior", "safety"]);
const OUTPUT_ASSERTION_METHODS = new Set(["judge", "regex", "exact"]);
const WORKSPACE_ASSERTION_METHODS = new Set([
  "file-exists",
  "file-contains",
  "json-valid",
  "snapshot-diff",
]);
const BEHAVIOR_ASSERTION_METHODS = new Set([
  "skill-read-required",
  "tool-call-required",
  "tool-call-forbidden",
  "external-call-forbidden",
  "command-forbidden",
]);
const SAFETY_ASSERTION_METHODS = new Set([
  "no-forbidden-files-touched",
  "no-live-external-calls",
  "custom",
]);

export class EvalsJsonValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "EvalsJsonValidationError";
    this.issues = issues;
  }
}

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

  const issues: string[] = [];
  const file = validateEvalsJsonFile(parsed, issues);

  if (issues.length > 0 || !file) {
    throw new EvalsJsonValidationError(
      `evals.json at ${absolutePath} failed validation (${issues.length} issue${
        issues.length === 1 ? "" : "s"
      })`,
      issues,
    );
  }

  return file;
}

function validateEvalsJsonFile(value: unknown, issues: string[]): EvalsJsonFile | null {
  if (!isRecord(value)) {
    issues.push("Top-level value must be a JSON object.");
    return null;
  }

  if (value.version !== undefined && typeof value.version !== "string") {
    issues.push("`version`, if present, must be a string.");
  }

  if (typeof value.skill_name !== "string" || value.skill_name.length === 0) {
    issues.push("`skill_name` must be a non-empty string.");
  }

  if (!Array.isArray(value.evals)) {
    issues.push("`evals` must be an array.");
    return null;
  }

  const seenIds = new Set<string>();
  const cases: EvalCase[] = [];

  for (let i = 0; i < value.evals.length; i++) {
    const scopedIssues: string[] = [];
    const parsedCase = validateCase(value.evals[i], i, scopedIssues);
    for (const issue of scopedIssues) {
      issues.push(`evals[${i}]: ${issue}`);
    }
    if (parsedCase) {
      const key = String(parsedCase.id);
      if (seenIds.has(key)) {
        issues.push(`evals[${i}]: duplicate id ${key}`);
      } else {
        seenIds.add(key);
        cases.push(parsedCase);
      }
    }
  }

  if (issues.length > 0) return null;

  return Object.freeze({
    version: value.version as string | undefined,
    skill_name: value.skill_name as string,
    evals: cases,
  });
}

function validateCase(value: unknown, index: number, issues: string[]): EvalCase | null {
  if (!isRecord(value)) {
    issues.push("case must be a JSON object");
    return null;
  }

  if (typeof value.id !== "string" && typeof value.id !== "number") {
    issues.push("`id` must be a string or number");
  }

  if (value.description !== undefined && typeof value.description !== "string") {
    issues.push("`description`, if present, must be a string");
  }

  if (typeof value.prompt !== "string" || value.prompt.length === 0) {
    issues.push("`prompt` must be a non-empty string");
  }

  if (value.expected_output !== undefined && typeof value.expected_output !== "string") {
    issues.push("`expected_output`, if present, must be a string");
  }

  if (value.setup !== undefined) {
    validateWorkspaceSetup(value.setup, "setup", issues);
  }

  if (value.files !== undefined) {
    if (!Array.isArray(value.files)) {
      issues.push("`files`, if present, must be an array of strings");
    } else {
      for (let f = 0; f < value.files.length; f++) {
        if (typeof value.files[f] !== "string") {
          issues.push(`files[${f}] must be a string`);
        }
      }
    }
  }

  if (value.assertions !== undefined) {
    if (!Array.isArray(value.assertions)) {
      issues.push("`assertions`, if present, must be an array");
    } else {
      for (let a = 0; a < value.assertions.length; a++) {
        const assertionIssues: string[] = [];
        validateAssertion(value.assertions[a], assertionIssues);
        for (const issue of assertionIssues) {
          issues.push(`assertions[${a}]: ${issue}`);
        }
      }
    }
  }

  if (value.metadata !== undefined) {
    validateMetadata(value.metadata, issues);
  }

  if (issues.length > 0) return null;

  return Object.freeze({
    id: value.id as string | number,
    description: value.description as string | undefined,
    prompt: value.prompt as string,
    expected_output: value.expected_output as string | undefined,
    setup: value.setup as WorkspaceSetup | undefined,
    files: value.files as string[] | undefined,
    assertions: value.assertions as EvalAssertion[] | undefined,
    metadata: value.metadata as EvalCase["metadata"],
  });
}

function validateAssertion(value: unknown, issues: string[]): void {
  if (typeof value === "string") {
    if (value.length === 0) issues.push("string assertion must be non-empty");
    return;
  }

  if (!isRecord(value)) {
    issues.push("assertion must be a string or an object");
    return;
  }

  if ("type" in value) {
    validateScriptAssertion(value, issues);
    return;
  }

  validateIntentAssertion(value, issues);
}

function validateScriptAssertion(value: Record<string, unknown>, issues: string[]): void {
  if (typeof value.type !== "string" || !SCRIPT_ASSERTION_TYPES.has(value.type)) {
    issues.push(
      `script assertion must declare \`type\` from [${Array.from(SCRIPT_ASSERTION_TYPES).join(", ")}]`,
    );
    return;
  }

  switch (value.type) {
    case "file-exists":
    case "json-valid":
      if (typeof value.path !== "string" || value.path.length === 0) {
        issues.push(`\`${value.type}\` requires a non-empty \`path\` string`);
      }
      break;
    case "regex-match": {
      if (typeof value.pattern !== "string" || value.pattern.length === 0) {
        issues.push("`regex-match` requires a non-empty `pattern` string");
      } else {
        try {
          new RegExp(value.pattern, typeof value.flags === "string" ? value.flags : undefined);
        } catch {
          issues.push("`regex-match` pattern is not a valid regular expression");
        }
      }
      if (value.flags !== undefined && typeof value.flags !== "string") {
        issues.push("`regex-match.flags`, if present, must be a string");
      }
      if (value.target !== undefined) {
        if (value.target === "assistant-text") break;
        if (!isRecord(value.target) || typeof value.target.file !== "string") {
          issues.push(`\`regex-match.target\` must be "assistant-text" or { file: string }`);
        }
      }
      break;
    }
  }
}

function validateIntentAssertion(value: Record<string, unknown>, issues: string[]): void {
  if (typeof value.kind !== "string" || !INTENT_ASSERTION_KINDS.has(value.kind)) {
    issues.push(
      `intent assertion must declare \`kind\` from [${Array.from(INTENT_ASSERTION_KINDS).join(", ")}]`,
    );
    return;
  }

  if (typeof value.id !== "string" || value.id.length === 0) {
    issues.push("intent assertion requires a non-empty `id` string");
  }

  if (value.mustPass !== undefined && typeof value.mustPass !== "boolean") {
    issues.push("intent assertion `mustPass`, if present, must be a boolean");
  }

  if (
    value.severity !== undefined &&
    value.severity !== "info" &&
    value.severity !== "warn" &&
    value.severity !== "error"
  ) {
    issues.push('intent assertion `severity`, if present, must be "info", "warn", or "error"');
  }

  switch (value.kind) {
    case "output":
      validateEnumField(value, "method", OUTPUT_ASSERTION_METHODS, "output assertion", issues);
      if (value.method === "judge" && value.prompt !== undefined && typeof value.prompt !== "string") {
        issues.push("output judge assertion `prompt`, if present, must be a string");
      }
      if (value.method === "regex") {
        validateRegexFields(value, "output regex assertion", issues);
      }
      if (value.method === "exact" && typeof value.expected !== "string") {
        issues.push("output exact assertion requires an `expected` string");
      }
      break;
    case "workspace":
      validateEnumField(value, "method", WORKSPACE_ASSERTION_METHODS, "workspace assertion", issues);
      if (value.method !== "snapshot-diff" && (typeof value.path !== "string" || value.path.length === 0)) {
        issues.push("workspace assertion requires a non-empty `path` string");
      }
      if (value.method === "file-contains") {
        validateRegexFields(value, "workspace file-contains assertion", issues);
      }
      break;
    case "behavior":
      validateEnumField(value, "method", BEHAVIOR_ASSERTION_METHODS, "behavior assertion", issues);
      if (value.value !== undefined && typeof value.value !== "string") {
        issues.push("behavior assertion `value`, if present, must be a string");
      }
      break;
    case "safety":
      validateEnumField(value, "method", SAFETY_ASSERTION_METHODS, "safety assertion", issues);
      break;
  }
}

function validateEnumField(
  value: Record<string, unknown>,
  field: string,
  allowed: Set<string>,
  label: string,
  issues: string[],
): void {
  if (typeof value[field] !== "string" || !allowed.has(value[field] as string)) {
    issues.push(`${label} must declare \`${field}\` from [${Array.from(allowed).join(", ")}]`);
  }
}

function validateRegexFields(value: Record<string, unknown>, label: string, issues: string[]): void {
  if (typeof value.pattern !== "string" || value.pattern.length === 0) {
    issues.push(`${label} requires a non-empty \`pattern\` string`);
  } else {
    try {
      new RegExp(value.pattern, typeof value.flags === "string" ? value.flags : undefined);
    } catch {
      issues.push(`${label} pattern is not a valid regular expression`);
    }
  }
  if (value.flags !== undefined && typeof value.flags !== "string") {
    issues.push(`${label} \`flags\`, if present, must be a string`);
  }
}

function validateWorkspaceSetup(value: unknown, label: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`\`${label}\` must be an object`);
    return;
  }

  if (typeof value.kind !== "string" || !includesReadonly(WORKSPACE_KIND_VALUES, value.kind)) {
    issues.push(
      `\`${label}.kind\` must be one of [${WORKSPACE_KIND_VALUES.join(", ")}]`,
    );
    return;
  }

  switch (value.kind) {
    case "empty":
      return;
    case "seeded":
      if (!Array.isArray(value.sources)) {
        issues.push(`\`${label}.sources\` must be an array`);
      } else {
        for (let i = 0; i < value.sources.length; i++) {
          const source = value.sources[i];
          if (!isRecord(source)) {
            issues.push(`\`${label}.sources[${i}]\` must be an object`);
            continue;
          }
          if (typeof source.from !== "string" || source.from.length === 0) {
            issues.push(`\`${label}.sources[${i}].from\` must be a non-empty string`);
          }
          if (source.to !== undefined && typeof source.to !== "string") {
            issues.push(`\`${label}.sources[${i}].to\`, if present, must be a string`);
          }
        }
      }
      if (
        value.mountMode !== undefined &&
        (typeof value.mountMode !== "string" || !includesReadonly(WORKSPACE_MOUNT_MODE_VALUES, value.mountMode))
      ) {
        issues.push(
          `\`${label}.mountMode\`, if present, must be one of [${WORKSPACE_MOUNT_MODE_VALUES.join(", ")}]`,
        );
      }
      return;
    case "fixture":
      validateFixtureRef(value.fixture, `${label}.fixture`, issues);
      return;
  }
}

function validateFixtureRef(value: unknown, label: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`\`${label}\` must be an object`);
    return;
  }
  if (typeof value.kind !== "string" || !includesReadonly(FIXTURE_KIND_VALUES, value.kind)) {
    issues.push(`\`${label}.kind\` must be one of [${FIXTURE_KIND_VALUES.join(", ")}]`);
  }
  if (typeof value.source !== "string" || value.source.length === 0) {
    issues.push(`\`${label}.source\` must be a non-empty string`);
  }
  if (value.initGit !== undefined && typeof value.initGit !== "boolean") {
    issues.push(`\`${label}.initGit\`, if present, must be a boolean`);
  }
}

function validateMetadata(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("`metadata`, if present, must be an object");
    return;
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")) {
      issues.push("`metadata.tags`, if present, must be an array of strings");
    }
  }
  if (
    value.difficulty !== undefined &&
    value.difficulty !== "easy" &&
    value.difficulty !== "medium" &&
    value.difficulty !== "hard"
  ) {
    issues.push('`metadata.difficulty`, if present, must be "easy", "medium", or "hard"');
  }
  if (value.intent !== undefined && typeof value.intent !== "string") {
    issues.push("`metadata.intent`, if present, must be a string");
  }
  if (value.environment !== undefined) {
    validateEnvironmentRequirements(value.environment, "metadata.environment", issues);
  }
}

function validateEnvironmentRequirements(value: unknown, label: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`\`${label}\` must be an object`);
    return;
  }
  if (!isRecord(value.workspace)) {
    issues.push(`\`${label}.workspace\` must be an object`);
  } else {
    if (typeof value.workspace.kind !== "string" || !includesReadonly(WORKSPACE_KIND_VALUES, value.workspace.kind)) {
      issues.push(`\`${label}.workspace.kind\` must be one of [${WORKSPACE_KIND_VALUES.join(", ")}]`);
    }
    if (typeof value.workspace.writable !== "boolean") {
      issues.push(`\`${label}.workspace.writable\` must be a boolean`);
    }
  }
  if (value.git !== undefined) {
    if (!isRecord(value.git)) {
      issues.push(`\`${label}.git\` must be an object`);
    } else if (typeof value.git.required !== "boolean") {
      issues.push(`\`${label}.git.required\` must be a boolean`);
    }
  }
  if (value.network !== undefined) {
    if (!isRecord(value.network)) {
      issues.push(`\`${label}.network\` must be an object`);
    } else if (typeof value.network.mode !== "string" || !includesReadonly(NETWORK_MODE_VALUES, value.network.mode)) {
      issues.push(`\`${label}.network.mode\` must be one of [${NETWORK_MODE_VALUES.join(", ")}]`);
    }
  }
  if (value.tools !== undefined) {
    validateArrayOfRecords(value.tools, `${label}.tools`, issues, (tool, toolLabel) => {
      if (typeof tool.name !== "string" || tool.name.length === 0) {
        issues.push(`\`${toolLabel}.name\` must be a non-empty string`);
      }
      if (typeof tool.required !== "boolean") {
        issues.push(`\`${toolLabel}.required\` must be a boolean`);
      }
      if (tool.mode !== undefined && (typeof tool.mode !== "string" || !includesReadonly(TOOL_REQUIREMENT_MODE_VALUES, tool.mode))) {
        issues.push(`\`${toolLabel}.mode\`, if present, must be one of [${TOOL_REQUIREMENT_MODE_VALUES.join(", ")}]`);
      }
    });
  }
  if (value.envVars !== undefined) {
    validateArrayOfRecords(value.envVars, `${label}.envVars`, issues, (envVar, envVarLabel) => {
      if (typeof envVar.name !== "string" || envVar.name.length === 0) {
        issues.push(`\`${envVarLabel}.name\` must be a non-empty string`);
      }
      if (typeof envVar.required !== "boolean") {
        issues.push(`\`${envVarLabel}.required\` must be a boolean`);
      }
      if (envVar.secret !== undefined && typeof envVar.secret !== "boolean") {
        issues.push(`\`${envVarLabel}.secret\`, if present, must be a boolean`);
      }
    });
  }
}

function validateArrayOfRecords(
  value: unknown,
  label: string,
  issues: string[],
  validateEntry: (entry: Record<string, unknown>, entryLabel: string) => void,
): void {
  if (!Array.isArray(value)) {
    issues.push(`\`${label}\` must be an array`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    if (!isRecord(value[i])) {
      issues.push(`\`${label}[${i}]\` must be an object`);
      continue;
    }
    validateEntry(value[i], `${label}[${i}]`);
  }
}

function includesReadonly(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Shallow type guard re-exported so downstream modules don't need to
 * reach into loader internals.
 */
export function isScriptAssertion(assertion: EvalAssertion): assertion is ScriptAssertion {
  return typeof assertion !== "string" && "type" in assertion;
}

export function isIntentAssertion(assertion: EvalAssertion): assertion is IntentAssertion {
  return typeof assertion !== "string" && "kind" in assertion;
}
