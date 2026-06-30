---
title: Dogfooding & Authoring Loop
description: Use arc-creating-evals, compare mode, and iteration artifacts to improve skills from evidence.
---

Skeval works best when eval authoring and skill improvement are the same loop: write a small suite, run it, compare with and without the skill, inspect failures, tighten assertions, and repeat.

## The loop

1. **Create or update evals** for the target skill.
2. **Run one case** to catch obvious fixture, assertion, or model issues.
3. **Run with `--compare`** to measure whether the skill helps relative to the no-skill baseline.
4. **Inspect artifacts**: assistant output, files, grading evidence, traces, and benchmark deltas.
5. **Improve the skill or evals** based on failures.
6. **Record the next run under a new iteration**.

```bash
arc-skill-eval run ./skills/my-skill --case golden-path

arc-skill-eval run ./skills/my-skill \
  --case golden-path \
  --compare \
  --iteration dogfood-1
```

## Creating evals with `arc-creating-evals`

The companion `arc-creating-evals` skill is the recommended authoring path. Ask your agent to use it with prompts like:

- "Create evals for this skill."
- "Make `arc-conventional-commits` testable."
- "Write `evals/evals.json` and fixtures for this skill."

It should:

- locate and summarize the target `SKILL.md`
- confirm success criteria before writing cases
- draft trigger, execution, and negative cases
- prefer deterministic assertions for file and JSON effects
- write `evals/evals.json` and fixture files
- dry-run at least one case before declaring the suite ready

See [Authoring evals](/arc-skill-eval/authoring-evals/) for the full contract.

## Why compare mode matters

An absolute pass rate can be misleading. A skill that passes because the base model already knew what to do is less valuable than a skill that creates a measurable improvement over baseline.

`--compare` runs every case twice:

- `with_skill` — target skill plus any explicit extras
- `without_skill` — no target skill, but the same prompt and fixtures

Skeval writes a `benchmark.json` with per-case and aggregate deltas.

Interpretation:

- **Positive delta** — the skill is helping. Keep or expand coverage.
- **Neutral delta** — the case may be too easy, too generic, or not discriminating.
- **Negative delta** — the skill may be confusing the model, over-constraining the task, or triggering the wrong behavior.

## Make assertions discriminating

A good assertion checks the effect of the skill, not whether the assistant repeated the skill's instructions.

Prefer this:

```json
{ "type": "file-exists", "path": ".releaserc.json" }
```

and this:

```json
{
  "type": "regex-match",
  "pattern": "conventionalcommits",
  "target": { "file": ".releaserc.json" }
}
```

over a weak prose assertion like:

```json
"The assistant says it used Conventional Commits."
```

Use LLM-judged string assertions for tone, explanation quality, or semantic properties that cannot be checked mechanically.

## Use iteration buckets

Group runs by iteration so you can keep evidence from each improvement cycle:

```bash
arc-skill-eval run ./skills/my-skill --compare --iteration 1
arc-skill-eval run ./skills/my-skill --compare --iteration 2
arc-skill-eval run ./skills/my-skill --compare --iteration description-tuning
```

The artifacts land under:

```text
<skillDir>/evals-runs/iteration-<name>/<runId>/
```

## Add distractor skills for conflict testing

Use `--extra-skill` to test routing and context conflicts:

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1
```

In compare mode, `with_skill` receives the target plus extras. `without_skill` receives only the extras. That isolates whether the target skill adds value in a realistic crowded context.

## Concrete dogfood evidence

The `arc-skills` repo contains a dogfood suite for `arc-creating-evals`, the meta-skill that authors evals for other skills. A recent golden-path compare run showed a positive `+16.7%` with-skill delta after the suite was tightened to assert behavior unique to `arc-creating-evals`.

That is the shape of useful dogfooding:

1. start with a real skill
2. create a small eval suite
3. run with and without the skill
4. inspect failures
5. tighten assertions so the suite measures the skill's unique contribution
6. repeat

For deeper notes, see [`docs/skill-eval-authoring-debrief.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-eval-authoring-debrief.md).
