# `arc-skill-eval create` dogfood report

Date: 2026-06-17

## Scope

Dry-ran the starter eval scaffolder against representative skills in `/Users/andrewsolomon/Documents/Github/arc-skills`:

- `arc-planning-work`
- `arc-defining-work`
- `arc-creating-user-stories`
- `arc-implementation-plan-progress`
- `arc-creating-evals`

Command shape:

```bash
arc-skill-eval create /Users/andrewsolomon/Documents/Github/arc-skills/<skill> --dry-run
```

## Findings

### Good

- All sampled skills produced valid starter suites with the expected three cases:
  - `trigger-explicit`
  - `execution-golden-path`
  - `adjacent-negative`
- Artifact inference found explicit output files for `arc-implementation-plan-progress`, including `progress.txt` and `IMPLEMENTATION_PLAN.md`.
- Artifact inference found the main output for `arc-creating-evals`: `evals/evals.json`.

### Improvements made from dogfood

1. **YAML block-scalar descriptions**

   `arc-creating-evals` uses `description: >`. The initial parser treated the description as the literal string `>` rather than collecting the indented continuation lines. `create` now supports simple `>` and `|` block scalar frontmatter values.

2. **Example-code false positives**

   `arc-creating-evals` includes example assertion text mentioning `.releaserc.json`. The initial artifact inference treated that example path as a required generated output. Inference now strips fenced code blocks before scanning for artifact paths.

## Remaining opportunities

- Infer fixture inputs separately from output artifacts.
- Generate more domain-specific adjacent-negative prompts.
- Emit a human-readable summary of inferred artifacts and assumptions.
