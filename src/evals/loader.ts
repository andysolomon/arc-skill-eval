import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  EvalAssertion,
  EvalCase,
  EvalsJsonFile,
  ScriptAssertion,
} from "./types.js";

const SCRIPT_ASSERTION_TYPES = new Set(["file-exists", "regex-match", "json-valid"]);

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

  if (typeof value.prompt !== "string" || value.prompt.length === 0) {
    issues.push("`prompt` must be a non-empty string");
  }

  if (value.expected_output !== undefined && typeof value.expected_output !== "string") {
    issues.push("`expected_output`, if present, must be a string");
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

  if (issues.length > 0) return null;

  return Object.freeze({
    id: value.id as string | number,
    prompt: value.prompt as string,
    expected_output: value.expected_output as string | undefined,
    files: value.files as string[] | undefined,
    assertions: value.assertions as EvalAssertion[] | undefined,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Shallow type guard re-exported so downstream modules don't need to
 * reach into loader internals.
 */
export function isScriptAssertion(assertion: EvalAssertion): assertion is ScriptAssertion {
  return typeof assertion !== "string";
}
