# CLI `--json` contract

`--json` is how a coding agent drives `arc-skill-eval` from its shell tool, in any harness (Claude Code, Codex, Cursor Agent, Copilot CLI, Pi). The bundled `arc-running-evals` and `arc-creating-evals` skills depend on it. Treat this page as a public API.

## Rules

1. With `--json`, stdout holds **exactly one JSON object** and nothing else. Progress and warnings go to stderr. Don't merge the two streams (`2>&1`) when parsing.
2. Every object has `"schemaVersion": 1`. The version only changes when an existing field is removed, renamed, or changes meaning. New fields can appear at any time, so ignore fields you don't recognise.
3. Failures that stop a command from completing print an error object instead of the result. In JSON mode the error goes to stdout only:

   ```json
   { "schemaVersion": 1, "error": { "kind": "usage", "message": "Unknown flag: --bogus." } }
   ```

   | `kind` | Meaning |
   |---|---|
   | `usage` | Bad flags or arguments. Fix the command line. |
   | `command` | The command ran but couldn't finish: missing file, refused overwrite, runtime not ready (missing API key), invalid `evals.json`. |
   | `internal` | An unexpected exception. Please report it. |
   | `cancelled` | `run` was cancelled with Ctrl-C (exit 130). The in-flight case was stopped and cleaned up. |

4. Paths in results are absolute.

## Exit codes

| Exit | stdout has `error`? | Meaning |
|---|---|---|
| 0 | no | Success. For `run`, every hard assertion passed in every trial. |
| 1 | no | A verdict, not a crash: `run` had a failing case or hard assertion (or a soft miss with `--strict`, or a failed trial with `--trials`), or `emit --check` found drift. |
| 1 | yes | The command did not complete. See `error.kind`. |
| 130 | yes | `run` was cancelled with Ctrl-C (`error.kind` is `cancelled`). |

## Payloads

| Command | Payload (besides `schemaVersion`) |
|---|---|
| `run` | `runId`, `iteration?`, `summary` (`totalCases`, `passedCases`, `failedCases`, `totalAssertions`, `passedAssertions`, `failedAssertions`, `softFailedAssertions`, `assertionPassRate`, `selfJudgedCases`, `selfJudgeModel?`, `failedTrials`), `skills[]` (`skillName`, `skillDir`, `outputDir`, `cases[]`, `errors[]`, `benchmark?`, `benchmarkPath?`, `trials?`, `trialsPath?`, `sync?`) |
| `create` | `skillDir`, `evalsJsonPath`, `dryRun`, `written`, `guided`, `interactive`, `evals` (the generated `evals.json`), `fixtureInputs`, `rationale`, `adjacentNegativeAssumption` |
| `emit` | `fromPath`, `outPath`, `skillName`, `caseCount`, `bytes`, `check`, `changed`, `wrote` |
| `review` | `runDir`, `reviewPath`, `feedbackPath`, `compare`, `caseCount` |
| `improve` | `feedbackPath`, `runDir`, `evalsJsonPath`, `dryRun`, `applied`, `suggestions[]`, `updatedEvals?` |
| `audit` | `input`, `skills[]` (each with its findings), `summary` (`skillCount`, `findingCount`, `highCount`, `warnCount`, `infoCount`), `outputPath?` |
| `optimize-description` | `mode` (`generate-only`, `score`, `optimize`) plus that mode's report |
| `package` | `skillDir`, `skillName`, `outputPath`, `fileCount`, `totalBytes`, `manifest` |
| `init-runtime` | `targetDir`, `modelsPath`, `settingsPath`, `provider`, `model`, `overwritten` |
| `install-skills` | `target`, `installed[]` (`skill`, `path`), `skipped[]` (`skill`, `path`, `reason`) |
| `--help`, `<command> --help` | `command` (the command name, or `null` for the root help), `help` (the text) |
| `--version` | `version` |

Notes on `run`:

- `summary.selfJudgedCases` counts cases whose judge assertions were graded by the model that ran them. `selfJudgeModel` names it.
- `skills[].benchmark.cases[].assertions[]` (with `--compare`) gives `index`, `text`, `with_skill`, `without_skill` and `discriminates` for each assertion. `benchmark.summary.assertions_passing_in_both` counts the ones that passed without the skill too.
- `skills[].trials` (with `--trials <n>`, `n` above 1) is the content of `trials.json`: per case `errored_trials`, `failed_trials` and `assertions[]` (`passed_trials`, `graded_trials`, `flaky`), plus `delta` (`per_trial`, `median`, `min`, `max`, `spread`, `measurable`) with `--compare`. `skills[].cases[]` holds the first trial. `summary.failedTrials` counts trials with a hard failure or a crash.
- `skills[].sync` (with `--stamp`) is `{ "stamped": true, "path" }` or `{ "stamped": false, "reason" }`.

`audit` findings carry a `category`. The suite checks use `eval-suite`, `vacuous-assertion`, `absence-only-case`, `eval-sync` and `eval-coverage`; the [CLI reference](https://andysolomon.github.io/arc-skill-eval/cli-reference/#audit-skill-dir-or-repo) explains each.

`bundled --json` is the one exception: it prints a bare array of `{ name, path }` and has no `schemaVersion`, to stay compatible with scripts written before this contract.

## Interactive commands

`browse` and `create --interactive` need a terminal. They refuse to start without one, and `--json` can't be combined with `--interactive`. Agents should use `run --json` and `create --dry-run --json`.

## Installing the agent skills

```bash
arc-skill-eval install-skills                        # .agents/skills + .claude/skills in the cwd
arc-skill-eval install-skills --harness codex        # only the folder Codex reads
arc-skill-eval install-skills --target ../my-project --force
```

| `--harness` | Folders |
|---|---|
| `claude-code` | `.claude/skills` |
| `codex`, `copilot`, `pi` | `.agents/skills` |
| `cursor-agent` | `.agents/skills`, `.cursor/skills` |

The default (no `--harness`) is `.agents/skills` + `.claude/skills`, which covers every harness above. Skills are copied without their `evals/` folder, because those fixture `SKILL.md` files would otherwise be picked up as real skills. An existing install is skipped unless you pass `--force`, which replaces it completely.
