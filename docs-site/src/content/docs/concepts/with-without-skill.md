---
title: With/without skill
description: Compare the same case with and without a skill to measure the skill's effect.
sidebar:
  order: 4
---

Use `--compare` to run the same case with and without the target skill. The difference between the results measures the skill's effect.

## Why compare the results

A 100% pass rate with the skill does not show that the skill helped. If the case also passes without the skill, the model already knew how to handle the task. The delta shows how much the skill changed the pass rate.

Anthropic publishes this as the `with_skill` / `without_skill` execution model. Skeval records the run-level delta in `benchmark.json`.

## How `--compare` runs

For each case, Skeval runs the case twice in the same iteration:

- `with_skill` attaches the target skill. This variant uses the same execution path as a default run.
- `without_skill` omits the target skill but uses the same prompt, model, and fresh workspace. If you pass `--extra-skill`, both variants load those extra skills.

Skeval creates a fresh, equivalent workspace for each variant. Files from one variant cannot affect the other.

## The artifact layout

```text
<skillDir>/evals-runs/<runId>/
├── benchmark.json
├── eval-<case-id>/
│   ├── with_skill/
│   │   ├── assistant.md
│   │   ├── outputs/
│   │   ├── timing.json
│   │   ├── grading.json
│   │   ├── trace.json
│   │   ├── tool-summary.json
│   │   └── context-manifest.json
│   └── without_skill/
│       ├── assistant.md
│       ├── outputs/
│       ├── timing.json
│       ├── grading.json
│       ├── trace.json
│       ├── tool-summary.json
│       └── context-manifest.json
└── ...
```

Each variant writes its own artifacts. Compare `assistant.md` for response changes, `tool-summary.json` for tool-use changes, and `context-manifest.json` to check that only the target skill differs.

## What `benchmark.json` aggregates

Per case:
- `with_skill.pass_rate`
- `without_skill.pass_rate`
- `delta = with_skill.pass_rate − without_skill.pass_rate`
- timing, token, model, cost, context-window, and tool summaries per variant
- runtime or grading errors per variant

The file also includes the mean pass rate for each variant and the mean delta across cases.

The top level keeps Anthropic's per-case results, overall pass rates, overall delta, and error summaries. Pi-specific fields such as artifact paths, trace paths, model metadata, and estimated cost live under `metadata.extensions`.

## Test conflicts with `--extra-skill`

`--extra-skill <path>` loads a distractor or conflicting skill into both variants:

- `with_skill` = target + extras
- `without_skill` = extras only

This setup tests whether another skill changes the target skill's results while keeping the baseline comparable.

## When to skip `--compare`

1. When editing one assertion, use a single-variant run to avoid the second model call. Compare after the case is stable.
2. When checking that a case runs end to end, run one variant first.

Use single-variant runs while editing a case. Use `--compare` when you need to measure the skill's effect.
