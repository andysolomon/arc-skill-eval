---
title: CLI reference
description: Every flag of `arc-skill-eval run`, with model pinning, compare mode, and exit-code semantics.
---

The current stable CLI centers on one command: `run`. It discovers skills, materializes fixtures, runs cases through Pi, grades assertions, and writes artifacts.

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
                   [--compare]
                   [--json]
```

The positional `<skill-dir-or-repo>` is resolved as a skill directory if it contains `evals/evals.json`, otherwise as a repo whose tree is walked for `SKILL.md` + `evals/evals.json` pairs.

Exit code: `0` when every case has no failing assertions; `1` otherwise.

## Flags

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

## Examples

```bash
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
