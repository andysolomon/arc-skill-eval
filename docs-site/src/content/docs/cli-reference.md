---
title: CLI reference
description: Every flag of `arc-skill-eval run`, `init-runtime`, `review`, `browse`, and `audit`, with model pinning, compare mode, and exit-code semantics.
---

The current CLI centers on `create` for starter/guided suites, `run` for executing evals, `init-runtime` for creating tiny eval-owned Pi runtime config, `review` for static run reports, `improve` for feedback-driven planning, `browse` for an interactive run browser, and `audit` for deterministic skill-quality checks.

## Synopsis

```text
arc-skill-eval run <skill-dir-or-repo>
                   [--skill <name>]...
                   [--case <id>]...
                   [--model <provider/model[:thinking]>]
                   [--judge-model <provider/model[:thinking]>]
                   [--agent-dir <path>]
                   [--output-dir <path>]
                   [--iteration <name>]
                   [--extra-skill <path>]...
                   [--context-mode isolated|ambient]
                   [--sandbox none|just-bash]
                   [--compare]
                   [--laminar]
                   [--json]

arc-skill-eval init-runtime <agent-dir>
                            --provider <provider>
                            --model <model>
                            [--force]

arc-skill-eval review <run-dir>
                      [--output <dir>]
                      [--force]

arc-skill-eval improve --from-feedback <feedback.json>
                       [--dry-run]
                       [--summary]
                       [--apply]

arc-skill-eval create <skill-dir>
                      [--guided]
                      [--interactive]
                      [--model <provider/model[:thinking]>]
                      [--agent-dir <path>]
                      [--authoring-skill <path>]
                      [--dry-run]
                      [--summary]
                      [--force]

arc-skill-eval improve <skill-dir>
                       --from-feedback <feedback.json>

arc-skill-eval browse [<skill-dir-or-repo>]
                      [--no-baseline]

arc-skill-eval audit <skill-dir-or-repo>
                     [--json]
                     [--output <path>]
```

## Commands

### `create <skill-dir>`

Scaffold a starter `evals/evals.json` next to a `SKILL.md` file:

```bash
arc-skill-eval create ./skills/my-skill
```

The command reads `SKILL.md` frontmatter and writes three starter cases:

- `trigger-explicit`
- `execution-golden-path`
- `adjacent-negative`

When obvious output artifacts are mentioned in `SKILL.md`, such as `plan.md` or `report.json`, the execution case also gets deterministic `file-exists` and `json-valid` assertions. When likely input files are mentioned, such as `notes/input.md`, `requirements.md`, `prd.md`, `issue.md`, or `task.md`, the execution case gets seeded fixture inputs under `evals/files/starter-inputs/`. The adjacent-negative case is domain-aware for common skill types like eval authoring, planning, releases, docs, and auth/webhooks, with a generic fallback.

Use deterministic `create` when a repeatable starter suite is enough: file-writing skills, JSON/config skills, CLI automation, or CI fixtures where the obvious assertions are mechanical. Use guided create when case design is the hard part: conceptual skills, planning/review skills, routing behavior, and subtle adjacent negatives. Guided suggestions are proposals, not authority; review them before committing.

Guided mode asks a configured Pi model to act as an eval designer using the bundled `skills/arc-creating-evals/SKILL.md` procedure before files are written:

```bash
arc-skill-eval create ./skills/my-skill --guided --dry-run --summary
```

The guided proposal is validated through the same eval loader/schema used by `run`. Invalid model output fails with a clear validation error instead of writing files.

For a conceptual `grill-me` skill, prefer judge assertions and adjacent negatives over fake file assertions:

```bash
arc-skill-eval create .agents/skills/grill-me --guided --interactive
```

The useful assertions ask whether the assistant challenges assumptions, asks sharp follow-up questions, and stays in interview mode. Adjacent negatives check that ordinary editing or summarization requests do not trigger the skill.

Options:

- `--guided`: ask the configured model to propose cases, fixture inputs, assertions, and rationale.
- `--interactive`: launch a lightweight prompt flow for guided create. You can include/skip cases and assertions, and edit case prompts, expected output, and judge/regex assertion text before writing.
- `--model <provider/model[:thinking]>`: pin the guided eval designer model. Without this flag, guided mode uses the configured Pi default.
- `--agent-dir <path>`: load model registry, settings, and auth from an eval-owned Pi agent directory for guided mode.
- `--authoring-skill <path>`: override the bundled `arc-creating-evals` instructions, useful when dogfooding a revised eval-authoring skill.
- `--dry-run`: print the proposed JSON without writing files.
- `--summary`: print a human-readable review of generated cases, fixtures, rationale, deterministic assertions, and judge assertions. With `--dry-run`, this prints the summary instead of raw JSON.
- `--force`: overwrite an existing `evals/evals.json`.

Interactive guided mode:

```bash
arc-skill-eval create ./skills/my-skill --guided --interactive
```

Existing overwrite protections still apply before the interactive prompts run unless `--force` is supplied.

### `init-runtime <agent-dir>`

Create a tiny eval-owned Pi runtime directory with `models.json` and `settings.json`:

```bash
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b
```

Options:

- `--provider <provider>`: currently `ollama-cloud` and `ollama` are supported.
- `--model <model>`: model id to register and set as the Pi default for this runtime.
- `--force`: overwrite existing `models.json` or `settings.json`. Without this flag, the command refuses to overwrite existing runtime files.

For Ollama Cloud, the generated `models.json` references `OLLAMA_API_KEY`; it does not store a literal API key.

### `review <run-dir>`

Generate a static review bundle for an eval run directory:

```bash
arc-skill-eval review ./skills/hello-world/evals-runs/<runId>
```

Outputs:

- `review.html` — a standalone report with case summaries, assertion evidence, assistant output, timing/model/tool metadata when available, and side-by-side variants for compare runs.
- `feedback.json` — a structured skeleton for human notes that future `improve` workflows can consume.

Options:

- `--output <dir>`: write the report files outside the run directory.
- `--force`: overwrite existing `review.html` or `feedback.json`.

### `improve --from-feedback <feedback.json>`

Suggest eval-suite improvements from review feedback. Start by creating a report, then add human notes to `feedback.json`:

```bash
arc-skill-eval review ./skills/my-skill/evals-runs/<runId>
arc-skill-eval improve --from-feedback ./skills/my-skill/evals-runs/<runId>/feedback.json \
  --dry-run --summary
```

Use this after a compare run when the report shows neutral/negative deltas, flaky judge evidence, missing fixture coverage, or assertions that pass without proving the skill helped.

The command reads human notes and failing assertion summaries from `feedback.json`, then proposes prompt, assertion, fixture, or adjacent-negative improvements with rationale. It preserves human approval by default: no eval files are changed unless `--apply` is supplied. Applied changes annotate matching eval cases with validated improvement metadata and then re-run the existing eval loader.

Options:

- `--from-feedback <feedback.json>`: path to the feedback artifact written by `review`.
- `--dry-run`: force proposal-only mode.
- `--summary`: print a human-readable proposal instead of raw JSON.
- `--apply`: write validated improvement metadata to the matching `evals/evals.json`.

### `browse [<skill-dir-or-repo>]`

Open an interactive terminal run browser (an Ink TUI) over the artifacts under `evals-runs/`. The optional positional resolves as a skill directory (contains `evals/evals.json`) or a repo root; it defaults to the current directory.

```bash
arc-skill-eval browse ./skills/arc-conventional-commits   # one skill
arc-skill-eval browse .                                    # whole repo
```

It renders a four-panel layout — Skills, Cases, Assertions, Runs — with the selected case's prompt, grading evidence, metrics, tool calls, and `with_skill` vs `without_skill` comparison in the detail pane. It reads the same per-case `grading.json` / `timing.json` artifacts that `run` writes, so no extra setup is needed. Press `?` inside the TUI for the full keybinding overlay; `r` re-runs the selected skill (or case) and reloads in place.

Options:

- `--no-baseline`: hide the `without_skill` comparison rows in the detail pane.

The TUI adapts to the terminal: truecolor degrades to 16-color ANSI on low-color terminals, and block/box glyphs fall back to ASCII off a UTF-8 locale. Force the fallbacks with `NO_COLOR` / `FORCE_COLOR=0` (no color) or `ARC_TUI_ASCII=1` (ASCII glyphs). The re-run child is launched as `arc-skill-eval` (must be on `PATH`); override with `ARC_SKILL_EVAL_BIN`.

See [Browse (TUI)](/arc-skill-eval/browse/) for the full panel reference and keybindings.

### `audit <skill-dir-or-repo>`

Run deterministic skill-quality checks without invoking a model: frontmatter validity, content sprawl, eval coverage, local-link integrity, and duplicate skill families.

```bash
arc-skill-eval audit ./skills/arc-conventional-commits
arc-skill-eval audit . --json --output ./audit.json
```

Like `run`, the positional resolves as a single skill directory or a repo root whose tree is walked for `SKILL.md` + `evals/evals.json` pairs.

Options:

- `--json`: emit a machine-readable JSON report instead of human-readable lines.
- `--output <path>`: write the report to a file instead of stdout.

### `run <skill-dir-or-repo>`

Discover skills, materialize fixtures, run cases through Pi, grade assertions, and write artifacts. The positional `<skill-dir-or-repo>` is resolved as a skill directory if it contains `evals/evals.json`, otherwise as a repo whose tree is walked for `SKILL.md` + `evals/evals.json` pairs.

Exit code: `0` when every case has no failing assertions; `1` otherwise.

## Run flags

### `--skill <name>` *(repeatable)*

Restrict the run to a specific discovered skill by name. Useful when you point the CLI at a repo root that contains many skills but only want to run one.

```bash
arc-skill-eval run . --skill arc-conventional-commits
```

### `--case <id>` *(repeatable)*

Restrict the run to one or more cases by id. Combine with `--skill` to drill all the way down to a single case.

```bash
arc-skill-eval run ./skills/hello-world --case default-world
arc-skill-eval run . --skill hello-world --case named-ada --case assistant-names-file
```

### `--model <provider/model[:thinking]>`

Pin the model used by the skill-running agent. Without this flag, Skeval inherits Pi's configured default provider, model, and thinking level from the active Pi agent settings.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-5.5:medium
```

### `--judge-model <provider/model[:thinking]>`

Pin the model used for LLM-judged string assertions. Deterministic assertions such as `file-exists`, `regex-match`, and `json-valid` do not use the judge model.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-5.5:medium \
  --judge-model mistral/ministral-8b-latest
```

Model IDs may contain colons. Ollama-style IDs like `gpt-oss:20b` are treated as model IDs unless the final suffix is a known thinking level.

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

See [Runtime & Models](/arc-skill-eval/runtime-and-models/) for provider setup, Pi defaults, and Ollama Cloud examples.

### `--agent-dir <path>`

Use an eval-owned Pi agent directory for model registry, settings, and auth lookup. This is useful for reproducible team or CI runs that should not depend on a developer's personal `~/.pi/agent` defaults.

```bash
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

When supplied, both the runner and default LLM judge use this directory for Pi config.

### `--output-dir <path>`

Override where artifacts are written. Default is `<skillDir>/evals-runs/<runId>/`. Useful in CI when you want all artifacts under a single workspace path.

```bash
arc-skill-eval run . --output-dir ./evals-runs
```

### `--iteration <name>`

Group artifacts under an iteration bucket: `<skillDir>/evals-runs/iteration-<name>/<runId>/`. String names are normalized — `baseline` becomes `iteration-baseline`. Useful for repeated improvement cycles.

```bash
arc-skill-eval run ./skills/hello-world --iteration 1
arc-skill-eval run ./skills/hello-world --iteration baseline
```

### `--extra-skill <path>` *(repeatable)*

Load explicit distractor or conflict skills into the model's context — either a skill directory or a path to a `SKILL.md`. With `--compare`, `with_skill` receives the target plus extras while `without_skill` receives extras only.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1
```

### `--context-mode isolated|ambient`

- `isolated` *(default)* — no ambient Pi skills, extensions, prompt templates, themes, or context files are loaded. Only the target skill and any `--extra-skill` paths are exposed to the model.
- `ambient` — opt into normal Pi ambient resources, including configured extension tools and MCP-like tools when present.

The resolved loadout is recorded in each variant's `context-manifest.json`.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --context-mode ambient \
  --iteration ambient-1
```

### `--sandbox none|just-bash`

- `none` *(default)* — run each case through the standard temp-workspace runner with the host shell and real filesystem.
- `just-bash` — route the agent's `bash` tool through an in-process [`just-bash`](https://www.npmjs.com/package/just-bash) virtual shell whose filesystem is rooted at the case workspace. Commands run without the host shell, the repository working tree is never touched, and generated files are still captured under `outputs/`. `npm`/`npx`/`git` resolve to deterministic mocks (no-op success by default).

This flag overrides each case's own `sandbox` field. Per-case `sandbox` selection and `sandboxMocks` (to return specific stdout/exit codes and file effects) are configured in `evals.json` — see [Eval cases](/arc-skill-eval/concepts/eval-cases/).

```bash
arc-skill-eval run . --sandbox just-bash
```

### `--compare`

Opt into `with_skill` vs `without_skill` dual runs. Each case runs twice, isolated workspaces are materialized fresh for each variant, and a top-level `benchmark.json` aggregates per-case pass rates and the overall delta.

```bash
arc-skill-eval run . --compare
```

See [Dogfooding & Authoring Loop](/arc-skill-eval/dogfooding/) for how to interpret the delta.

### `--json`

Emit a machine-readable JSON summary on stdout instead of human-readable lines. Useful for CI scripts that want to gate on the summary.

```bash
arc-skill-eval run . --json
```

### `--laminar`

Opt into reporting the run to [Laminar](https://www.lmnr.ai/)'s **Evaluations** view: one evaluation per run variant (`with_skill` / `without_skill`), one scored datapoint per case, grouped by skill name for side-by-side comparison. The run summary prints a direct dashboard URL per evaluation. **Disabled by default** — without this flag no Laminar SDK is loaded and no network calls occur. Laminar export is strictly additive: local artifacts under `evals-runs/` remain the canonical source of truth, and an export failure never fails the run.

Configuration is read from the environment when the flag is set:

| Variable | Required | Purpose |
| --- | --- | --- |
| `LMNR_PROJECT_API_KEY` | yes | Laminar project API key. The command fails fast (before any case runs) if this is missing, naming the key. |
| `LMNR_BASE_URL` | no | Override the Laminar endpoint. |
| `LMNR_PROJECT_NAME` | no | Override the evaluation group name (default: the skill name). |

```bash
LMNR_PROJECT_API_KEY=lmnr_... arc-skill-eval run . --laminar
```

The Laminar Node SDK (`@lmnr-ai/lmnr`) is an **optional** dependency, loaded on demand only when the flag is enabled. If it is not installed, the run reports a clear error naming the package. See [Artifacts → External observability](/arc-skill-eval/concepts/artifacts/#external-observability-laminar) for the datapoint mapping.

## Examples

```bash
# Scaffold a starter eval suite.
arc-skill-eval create ./skills/my-skill

# Preview a starter suite without writing files.
arc-skill-eval create ./skills/my-skill --dry-run

# Review generated cases and assertions as text.
arc-skill-eval create ./skills/my-skill --dry-run --summary

# Ask an LLM eval designer for a richer dry-run proposal.
arc-skill-eval create ./skills/my-skill --guided --dry-run --summary

# Run every eval in every discovered skill under the current repo.
arc-skill-eval run .

# Run one skill.
arc-skill-eval run ./skills/arc-conventional-commits

# Run one case inside one skill.
arc-skill-eval run ./skills/arc-conventional-commits --case 1

# Pin GPT 5.5 for both runner and judge.
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-5.5:medium \
  --judge-model openai-codex/gpt-5.5:medium

# Use the verified Ollama Cloud smoke-test lane.
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b

# Create a tiny eval-owned Pi config/runtime directory.
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b

# Generate a static review report from artifacts.
arc-skill-eval review ./skills/hello-world/evals-runs/<runId>

# Propose improvements from review feedback.
arc-skill-eval improve --from-feedback ./skills/hello-world/evals-runs/<runId>/feedback.json \
  --dry-run --summary

# Use an eval-owned Pi config/runtime directory.
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b

# Retarget output.
arc-skill-eval run . --output-dir ./evals-runs

# Compare with vs without the skill, grouped under an iteration bucket.
arc-skill-eval run ./skills/arc-conventional-commits --compare --iteration 1

# Add a distractor skill for conflict testing.
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1

# Opt into normal Pi ambient resources and record the loadout.
arc-skill-eval run ./skills/arc-conventional-commits \
  --context-mode ambient \
  --iteration ambient-1
```

## Help

```bash
arc-skill-eval --help
```

prints the usage block. There is no separate `--version`; check `package.json` or `npm ls -g arc-skill-eval`.
