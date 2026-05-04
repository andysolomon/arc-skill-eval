---
title: Grading
description: How the LLM-judge and deterministic scripts coexist in one grader, and what evidence Skeval requires for a passing assertion.
sidebar:
  order: 5
---

Grading is what turns a captured run into a verdict. The grader (`src/evals/grade.ts`) takes a case, a workspace directory, and the assistant's text, and produces a `GradingJson` record with one row per assertion plus a summary.

## The judge + script split

Two distinct mechanisms run in one pass:

1. **LLM-judge** — handles all string assertions and `kind: "output"` assertions with `method: "judge"`. Skeval batches these into **one** judge call per case, so the cost is proportional to the number of *prose* claims, not the total assertion count.
2. **Deterministic scripts** — handle `file-exists`, `regex-match`, `json-valid`, and the corresponding intent-assertion methods. They run synchronously, with a path-traversal guard on every workspace path so a malformed assertion can't escape the temp workspace.

This split matters because it lets you mix strategies inside one case without paying the LLM cost for the parts a script can answer.

## Evidence-required passing

The judge prompt follows Anthropic's guidance: *"Require concrete evidence for a PASS. Don't give the benefit of the doubt."* Each assertion result includes an `evidence` field — a quoted passage from the assistant's reply or a snippet from a workspace file — that proves the verdict. If the judge can't produce evidence, the assertion fails.

This is why string assertions are most useful when they cite proper nouns, named effects, or specific tokens. *"The response names the conventionalcommits preset"* gives the judge something to look for. *"You should explain it"* doesn't.

## The `GradingJson` shape

```json
{
  "case_id": "1",
  "assertion_results": [
    {
      "text": "file-exists: .releaserc.json",
      "passed": true,
      "evidence": "Found .releaserc.json (182 bytes)",
      "assertion": { "type": "file-exists", "path": ".releaserc.json" }
    },
    {
      "text": "The response summarizes the semantic-release plugins it installed.",
      "passed": true,
      "evidence": "\"installs @semantic-release/commit-analyzer + release-notes-generator\"",
      "assertion": "The response summarizes the semantic-release plugins it installed."
    }
  ],
  "summary": { "passed": 2, "failed": 0, "total": 2, "pass_rate": 1.0 }
}
```

The shape is Anthropic-compatible: the `assertion_results[]` array and its `text` / `passed` / `evidence` fields match the published format. Each row also keeps the originating `assertion` so a reviewer can see the exact rule that was checked, not just the rendered text.

## What the grader does *not* do

- **It does not retry on flaky judge calls.** A single judge call decides each batch, end of story. Run the suite again if you want to retry.
- **It does not aggregate across cases.** `grading.json` is per-case. The cross-case aggregate lives in `benchmark.json`, and only when you run with `--compare`.
- **It does not score subjective quality.** There is no rubric lane, no 1-5 scale, no overall quality score. An assertion either passed or it didn't.

## Picking a judge model

`evals.json` doesn't have a top-level `model` field. The skill's *assistant* runs on whatever your Pi default is; the *judge* defaults to that as well. If your default is quota-capped or you want to grade with a different (typically cheaper) model than you ran with, override the judge model at the CLI invocation layer or via `~/.pi/agent/settings.json`.

In practice: run with the model you'd ship behind, judge with whatever's reliable. The judge's job is reading evidence, not generating it.
