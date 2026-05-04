---
title: With/without skill
description: The dual-run comparison and why the pass-rate delta — not the absolute pass rate — is the canonical signal that a skill works.
sidebar:
  order: 4
---

The single most load-bearing comparison in skill evaluation is **the same case, run twice, with and without the skill attached**. Skeval implements this as opt-in `--compare` mode.

## Why the delta, not the absolute

A case that passes 100% of the time *with* the skill is meaningless if it would pass 100% of the time without it — the model would do the right thing anyway, and the skill is contributing nothing. The signal a skill author wants is the *delta*: how much does attaching this skill change the outcome?

This isn't a Skeval invention. It maps directly onto what Anthropic publishes as the `with_skill` / `without_skill` execution model. What Skeval does is treat that delta as the canonical run-level metric — the question `benchmark.json` answers in one number.

## How `--compare` runs

For each case, Skeval runs the case twice in the same iteration:

- **`with_skill`** — the target skill is attached to the model. This is the same execution path as a default run.
- **`without_skill`** — the same prompt, the same model, the same fresh workspace, but the target skill is *not* attached. If `--extra-skill` paths are supplied, they're loaded into both variants — only the *target* skill is removed for the baseline.

Both variants materialize equivalent fresh workspaces before execution, so any pass-rate delta reflects the skill's contribution and not workspace contamination from a previous run.

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

Every variant produces the full set of artifacts independently. You can diff `with_skill/assistant.md` against `without_skill/assistant.md` for the same case; you can diff their `tool-summary.json` files to see whether the skill changed the tool-call profile; you can diff `context-manifest.json` to confirm the only difference between the two variants was the target skill itself.

## What `benchmark.json` aggregates

Per case:
- `with_skill.pass_rate`
- `without_skill.pass_rate`
- `delta = with_skill.pass_rate − without_skill.pass_rate`
- timing, token, model, cost, context-window, and tool summaries per variant
- runtime or grading errors per variant

Plus an overall (across-cases) summary with the mean pass rate per variant and the mean delta.

The artifact's *core* — per-case results, overall pass rates, overall delta, error summaries — stays Anthropic-compatible. Pi-specific extensions (artifact paths, trace paths, model metadata, estimated cost) live under `metadata.extensions` so the file remains portable while preserving debugging detail.

## Conflict mode: `--extra-skill`

`--extra-skill <path>` loads explicit distractor or conflict skills into the model's context. With `--compare`, the loadout becomes:

- `with_skill` = target + extras
- `without_skill` = extras only

This makes it possible to test whether some other skill conflicts with the target — or, conversely, whether some other skill's presence changes how often the target wins — without contaminating the no-target baseline. Good for "does this stack of skills coexist?" tests.

## When `--compare` is *not* the right loop

Two cases:

1. **Iterating on a single assertion.** A default single-variant run is faster (one model call per case instead of two). Use `--compare` once you've stabilized the case.
2. **Single-case smoke tests.** If you're sanity-checking that a case runs end-to-end, you don't need the baseline yet.

Default to single-variant runs while authoring; turn on `--compare` when you want the trust signal.
