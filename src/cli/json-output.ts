import type { CliInvocationResult } from "./types.js";

/**
 * Version of the `--json` stdout contract (docs/cli-json-contract.md).
 * Bump only for a breaking change to a payload's existing fields; adding
 * fields is not breaking.
 */
export const CLI_JSON_SCHEMA_VERSION = 1;

export type CliJsonErrorKind = "usage" | "command" | "internal" | "cancelled";

/** Render a command result as the single JSON object `--json` promises on stdout. */
export function jsonResult(payload: object, exitCode: 0 | 1 = 0): CliInvocationResult {
  return {
    exitCode,
    stdout: `${JSON.stringify({ schemaVersion: CLI_JSON_SCHEMA_VERSION, ...payload }, null, 2)}\n`,
    stderr: "",
  };
}

/**
 * Render a failure in JSON mode. The message goes to stdout only, so an agent
 * that merges stderr into stdout still gets parseable output.
 */
export function jsonError(kind: CliJsonErrorKind, message: string, exitCode: 1 | 130 = 1): CliInvocationResult {
  return {
    exitCode,
    stdout: `${JSON.stringify({ schemaVersion: CLI_JSON_SCHEMA_VERSION, error: { kind, message } }, null, 2)}\n`,
    stderr: "",
  };
}
