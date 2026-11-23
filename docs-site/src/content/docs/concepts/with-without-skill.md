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

## Which assertions the skill earned

A positive delta says the skill helped somewhere. It does not say which assertions did the telling. Each case in `benchmark.json` lists its assertions with the verdict in both variants:

```json
"assertions": [
  { "index": 0, "text": "file-exists: package.json", "with_skill": true, "without_skill": true, "discriminates": false },
  { "index": 1, "text": "file-exists: .releaserc.json", "with_skill": true, "without_skill": false, "discriminates": true }
]
```

An assertion that passes without the skill too does not show the skill helped. `summary.assertions_passing_in_both` counts them, and the text report prints the count. Tighten those assertions, or keep them as guards and stop counting them as evidence.

## Is the delta real? `--trials`

One run per variant cannot tell an effect from luck. `--trials <n>` runs every case `n` times and writes `trials.json` at the run root:

```json
"delta": { "per_trial": [0.5, 0, 0.5], "median": 0.5, "min": 0, "max": 0.5, "spread": 0.5, "measurable": false }
```

`spread` is how far the delta moves from one trial to the next. `measurable` is true only when the median delta is larger than the spread. A smaller gap is not a measured difference, however good one of the runs looks.

`trials.json` also lists each assertion with `passed_trials` and `graded_trials`, and marks it `flaky` when it passed in some trials and failed in others. A hard failure in any trial fails the run, so a suite that only passes sometimes does not pass. The first trial writes the usual artifacts. Later trials write under `trial-<k>/` in the run directory, in the same layout.

## The agent should not know it is being tested

The agent under test works in a temp directory named `project-*`, with nothing in the path that says eval. Every runtime is pointed at a copy of the skill, in a temp directory named `skills-*`, never at the real skill directory. The copy leaves out `evals/` and `evals-runs/`, so the agent cannot read the suite that grades it or earlier results. An `--extra-skill` is copied the same way. The copies are removed after the case, and `context-manifest.json` still names the real `SKILL.md` files.

The judge is a separate concern. With no `--judge-model`, the model that ran the case also grades it. The run summary counts those cases (`summary.selfJudgedCases`) and the text report says so. Pass `--judge-model` with a different model to avoid it.

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
