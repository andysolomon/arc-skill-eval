---
title: CLI reference
description: Every flag of `arc-skill-eval run`, with examples and exit-code semantics.
---

The CLI surface is intentionally small: one command, one positional argument, a handful of flags.

## Synopsis

```text
arc-skill-eval run <skill-dir-or-repo>
                   [--skill <name>]...
                   [--case <id>]...
                   [--output-dir <path>]
                   [--iteration <name>]
                   [--extra-skill <path>]...
                   [--context-mode isolated|ambient]
                   [--compare]
                   [--json]
```

The positional `<skill-dir-or-repo>` is resolved as a skill directory if it contains `evals/evals.json`, otherwise as a repo whose tree is walked for `SKILL.md` + `evals/evals.json` pairs.

Exit code: `0` when every case has no failing assertions; `1` otherwise (any assertion fail, any case error).

## Flags

### `--skill <name>` *(repeatable)*

Restrict the run to a specific discovered skill by name. Useful when you point the CLI at a repo root that contains many skills but only want to run one.

```bash
arc-skill-eval run . --skill arc-conventional-commits
```

### `--case <id>` *(repeatable)*

Restrict the run to a specific case by id. Combine with `--skill` to drill all the way down to a single case.

```bash
arc-skill-eval run ./skills/hello-world --case default-world
arc-skill-eval run . --skill hello-world --case named-ada --case assistant-names-file
```

### `--output-dir <path>`

Override where artifacts are written. Default is `<skillDir>/evals-runs/<runId>/`. Useful in CI when you want all artifacts under a single workspace path.

```bash
arc-skill-eval run . --output-dir ./evals-runs
```

### `--iteration <name>`

Group artifacts under an iteration bucket: `<skillDir>/evals-runs/iteration-<name>/<runId>/`. String names are normalized — `baseline` becomes `iteration-baseline`. Useful for repeated cycles where you want previous iterations' artifacts to stay immutable.

```bash
arc-skill-eval run ./skills/hello-world --iteration 1
arc-skill-eval run ./skills/hello-world --iteration baseline
```

### `--extra-skill <path>` *(repeatable)*

Load explicit distractor or conflict skills into the model's context — either a skill directory or a path to a `SKILL.md`. With `--compare`, `with_skill` receives the target plus extras while `without_skill` receives extras only. This makes it possible to test whether an extra skill conflicts with the target without contaminating the no-target baseline.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1
```

### `--context-mode isolated|ambient`

- `isolated` *(default)* — no ambient Pi skills, extensions, prompt templates, themes, or context files are loaded. Only the target skill (and any `--extra-skill` paths) are exposed to the model.
- `ambient` — opt into normal Pi ambient resources, including configured extension tools and MCP-like tools when present.

The resolved loadout is recorded in each variant's `context-manifest.json` so reviewers can see which skills, tools, and context were exposed.

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

# Retarget output.
arc-skill-eval run . --output-dir ./evals-runs

# Compare with vs without the skill, group under an iteration bucket.
arc-skill-eval run ./skills/arc-conventional-commits --compare --iteration 1

# Add a distractor skill for conflict testing.
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1
```

## Help

```bash
arc-skill-eval --help
```

prints the usage block. There is no separate `--version`; check `package.json` or `npm ls -g arc-skill-eval`.
