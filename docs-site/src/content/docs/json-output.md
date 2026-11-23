---
title: JSON output
description: The --json contract that scripts and coding agents rely on, with error kinds, exit codes, and the payload of every command.
---

Pass `--json` to any command except `browse` to get machine-readable output. Coding agents use it to drive the CLI from a shell tool, and the bundled `arc-running-evals` and `arc-creating-evals` skills depend on it. Treat the contract on this page as a public API.

## Rules

1. With `--json`, stdout holds exactly one JSON object and nothing else. Progress and warnings go to stderr. Don't merge the two streams with `2>&1` when you parse the output.
2. Every object has `"schemaVersion": 1`. The version changes only when an existing field is removed, renamed, or changes meaning. New fields can appear at any time, so ignore fields you don't recognize.
3. Paths in results are absolute.
4. When a command can't finish, it prints an error object instead of the result:

   ```json
   { "schemaVersion": 1, "error": { "kind": "usage", "message": "Unknown flag: --bogus." } }
   ```

| `error.kind` | Meaning |
| --- | --- |
| `usage` | A bad flag or argument. Fix the command line. |
| `command` | The command started but couldn't finish, for example because a file is missing, it refused to overwrite a file, the runtime is not ready, or `evals.json` is invalid. |
| `internal` | An unexpected exception. Please report it. |
| `cancelled` | `run` was cancelled with Ctrl-C. The current case was stopped and cleaned up. |

## Exit codes

| Exit | `error` in stdout? | Meaning |
| --- | --- | --- |
| 0 | no | Success. For `run`, every hard assertion passed. |
| 1 | no | A verdict, not a crash. `run` had a failing case or hard assertion, or a soft miss under `--strict`. `emit --check` found drift. |
| 1 | yes | The command did not complete. Read `error.kind`. |
| 130 | yes | `run` was cancelled with Ctrl-C, and `error.kind` is `cancelled`. |

Read the verdict from the JSON, not only from the exit code. Exit code `1` with an `error` object means the command never ran to the end. Don't report that as failed evals.

## Payloads

Each payload has `schemaVersion` plus these fields.

| Command | Fields |
| --- | --- |
| `run` | `runId`, `iteration` (optional), `summary`, `skills[]` |
| `create` | `skillDir`, `evalsJsonPath`, `dryRun`, `written`, `guided`, `interactive`, `evals` (the generated `evals.json`), `fixtureInputs`, `rationale`, `adjacentNegativeAssumption` |
| `emit` | `fromPath`, `outPath`, `skillName`, `caseCount`, `bytes`, `check`, `changed`, `wrote` |
| `review` | `runDir`, `reviewPath`, `feedbackPath`, `compare`, `caseCount` |
| `improve` | `feedbackPath`, `runDir`, `evalsJsonPath`, `dryRun`, `applied`, `suggestions[]`, `updatedEvals` (optional) |
| `audit` | `input`, `skills[]` with each skill's findings, `summary`, `outputPath` (optional) |
| `optimize-description` | `mode` (`generate-only`, `score`, or `optimize`) plus the report for that mode |
| `package` | `skillDir`, `skillName`, `outputPath`, `fileCount`, `totalBytes`, `manifest` |
| `init-runtime` | `targetDir`, `modelsPath`, `settingsPath`, `provider`, `model`, `overwritten` |
| `install-skills` | `target`, `installed[]` with `skill` and `path`, `skipped[]` with `skill`, `path`, and `reason` |
| `--help`, `<command> --help` | `command` (the command name, or `null` for the root help), `help` (the text) |
| `--version` | `version` |

For `run`, `summary` has `totalCases`, `passedCases`, `failedCases`, `totalAssertions`, `passedAssertions`, `failedAssertions`, `softFailedAssertions`, and `assertionPassRate`. Each entry in `skills[]` has `skillName`, `skillDir`, `outputDir`, `cases[]`, and `errors[]`. Compare runs also have `benchmark` and `benchmarkPath`.

For `audit`, `summary` has `skillCount`, `findingCount`, `highCount`, `warnCount`, and `infoCount`. `audit` exits `0` even when it reports findings, so a CI job should read these counts.

`bundled --json` is the one exception to the contract. It prints a bare array of `{ "name", "path" }` objects with no `schemaVersion`, so scripts written before the contract keep working.

## Examples

A run where one assertion failed. The exit code is `1` and there is no `error` key:

```bash
arc-skill-eval run ./skills/my-skill --json > result.json
echo $?   # 1
jq '.summary.failedAssertions' result.json
```

A usage error. The exit code is also `1`, but stdout has an `error` object:

```bash
$ arc-skill-eval run ./skills/hello-world --model foo --json
{
  "schemaVersion": 1,
  "error": {
    "kind": "usage",
    "message": "Invalid --model: foo. Expected provider/model or provider/model:thinking."
  }
}
```

A drift check in CI:

```bash
arc-skill-eval emit ./skills/my-skill --check --json
```

```json
{
  "schemaVersion": 1,
  "fromPath": "/repo/skills/my-skill/evals/evals.eval.ts",
  "outPath": "/repo/skills/my-skill/evals/evals.json",
  "skillName": "my-skill",
  "caseCount": 1,
  "bytes": 358,
  "check": true,
  "changed": true,
  "wrote": false
}
```

## Commands that need a terminal

`browse` and `create --interactive` need a terminal and refuse to start without one. `--json` can't be combined with `--interactive`. An agent should use `run --json` and `create --dry-run --json` instead.

The source of this contract is [`docs/cli-json-contract.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/cli-json-contract.md) in the repository.
