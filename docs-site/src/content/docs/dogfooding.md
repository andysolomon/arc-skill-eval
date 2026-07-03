---
title: Dogfooding & Authoring Loop
description: Use arc-creating-evals, compare mode, and iteration artifacts to improve skills from evidence.
---

Skeval works best when eval authoring and skill improvement are the same loop: write a small suite, run it, compare with and without the skill, inspect failures, tighten assertions, and repeat.

## The loop

1. **Create or update evals** for the target skill. Use deterministic `create` for concrete artifacts; use `create --guided --interactive` for conceptual or semantic behavior.
2. **Run one case** to catch obvious fixture, assertion, or model issues.
3. **Run with `--compare`** to measure whether the skill helps relative to the no-skill baseline.
4. **Generate a review report** and inspect assistant output, files, grading evidence, traces, and benchmark deltas.
5. **Capture feedback** in `feedback.json` and use it to improve the skill or evals.
6. **Record the next run under a new iteration**.

```bash
arc-skill-eval create ./skills/my-skill --guided --interactive
arc-skill-eval run ./skills/my-skill --case golden-path

arc-skill-eval run ./skills/my-skill \
  --case golden-path \
  --compare \
  --iteration dogfood-1

arc-skill-eval review ./skills/my-skill/evals-runs/iteration-dogfood-1/<runId>
arc-skill-eval improve ./skills/my-skill \
  --from-feedback ./skills/my-skill/evals-runs/iteration-dogfood-1/<runId>/feedback.json
```

## Creating evals with `create`

Use deterministic create when the success criteria are obvious and mechanical:

```bash
arc-skill-eval create ./skills/my-skill --dry-run --summary
arc-skill-eval create ./skills/my-skill
```

Use guided create when you need help designing the cases:

```bash
arc-skill-eval create ./skills/my-skill --guided --interactive
```

A conceptual skill such as `grill-me` should usually lean on judge assertions and adjacent negatives. It does not need fake artifact checks; it needs evidence that the assistant asks hard follow-up questions, challenges assumptions, and does not trigger for nearby summarization or editing tasks.

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

## Review before improving

`review` turns raw run artifacts into a human-readable handoff:

```bash
arc-skill-eval review ./skills/my-skill/evals-runs/<runId>
```

Open `review.html` for case summaries, assistant output, assertion evidence, timing/model/tool metadata, and compare deltas. Use `feedback.json` for human notes such as:

- the case passed but did not prove the skill helped
- the adjacent negative is too broad or too easy
- a judge assertion is vague or accepts paraphrase without evidence
- a fixture is missing a real-world constraint

Then feed those notes into the improvement workflow:

```bash
arc-skill-eval improve ./skills/my-skill \
  --from-feedback ./skills/my-skill/evals-runs/<runId>/feedback.json
```

The improvement plan should tell you whether to change the skill description, add fixtures, tighten assertions, or add/remove cases.

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

## Optimize the description for routing accuracy

Most skill failures we've measured are routing failures: the description either misses implicit phrasings it should catch or captures adjacent requests it shouldn't. `optimize-description` turns that into a measurable loop:

```bash
# Generate should-trigger + adjacent near-miss prompts, tagged train/test
arc-skill-eval optimize-description ./skills/my-skill --generate-only

# Review evals/description-evals.json by hand — the near-miss negatives are
# the ones worth editing — then score the current description
arc-skill-eval optimize-description ./skills/my-skill \
  --eval-set ./skills/my-skill/evals/description-evals.json

# Optimize with a held-out split; nothing touches SKILL.md without --apply
arc-skill-eval optimize-description ./skills/my-skill \
  --eval-set ./skills/my-skill/evals/description-evals.json \
  --max-iterations 5
```

Every probe is a single no-tools completion that pits the description against real sibling-skill descriptions in rotated order — cheap enough to run ~100 probes for less than one agent-session eval case. Candidates are proposed from **train**-split failures and the winner is chosen by **held-out test** accuracy, so a description that merely memorizes the train prompts never wins. Apply the winner only after the report shows a held-out improvement, and re-run your regular eval suite afterwards — a description tuned for routing must not break execution behavior.

## Run the bundled dogfood suite

`arc-creating-evals` — the bundled skill that teaches eval authoring — ships with its own eval suite at `skills/arc-creating-evals/evals/`, so the eval-creation skill is held to the standard it teaches. From the repo root:

```bash
arc-skill-eval run skills/arc-creating-evals
```

The suite seeds a tiny fixture skill (`arc-demo-file-writer`) and checks that the assistant, guided by `arc-creating-evals`, actually authors a valid `evals/evals.json` for it — plus an adjacent-negative case proving a plain unit-test request does not trigger eval authoring. This is the same skill `create --guided` uses as its authoring reference, so a green run here backs both the documented workflow and the guided-create path.

When triaging failures, follow the skill's own Phase 5 rules: `Judge error:` evidence means the judge infrastructure failed (fix `--judge-model` or provider auth, not the assertion); paraphrased evidence means the assertion should be tightened or replaced with a script assertion.

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
