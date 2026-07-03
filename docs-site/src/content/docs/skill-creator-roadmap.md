---
title: Skill Creator Roadmap
description: What Skeval already has, and what it plans to add from Claude's skill-creator workflow.
---

Claude's `skill-creator` skill is more than an eval generator. It is a skill authoring, testing, review, and iteration loop. Skeval already has the core eval runner. The next product work is to add the workflow around that runner.

## Already shipped

Skeval can already:

- discover `SKILL.md` + `evals/evals.json` pairs
- materialize fixture files into isolated workspaces
- run cases through Pi with the target skill attached
- grade outputs with deterministic and LLM-judged assertions
- write `assistant.md`, `outputs/`, `grading.json`, `timing.json`, `trace.json`, `tool-summary.json`, and `context-manifest.json`
- run with-skill vs without-skill comparisons with `--compare`
- pin runner and judge models with `--model` and `--judge-model`
- use low-cost cloud providers such as Ollama Cloud through Pi
- create eval-owned Pi config/runtime directories with `init-runtime`
- use eval-owned Pi config/runtime directories with `--agent-dir`
- generate static run reports and feedback templates with `review`
- propose eval-suite improvements from review feedback with `improve`
- scaffold starter eval suites with `create`

Those pieces make the eval signal real. The roadmap below focuses on making the skill improvement loop easier to drive.

## Planned commands

### `init-runtime` ✅

Create a tiny eval-owned Pi runtime directory:

```bash
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b
```

This writes minimal `models.json` and `settings.json` files while keeping secrets in environment variables such as `OLLAMA_API_KEY`.

### `create` ✅

Generate a starter eval suite for an existing skill:

```bash
arc-skill-eval create ./skills/my-skill
```

The first version inspects `SKILL.md` frontmatter and writes trigger, execution, and adjacent-negative starter cases. It also infers deterministic `file-exists` and `json-valid` assertions from obvious artifact paths such as `plan.md` or `report.json`, scaffolds likely input fixtures such as `notes/input.md` under `evals/files/starter-inputs/`, generates domain-aware adjacent-negative prompts for common skill types, and `--summary` prints a human-readable review of generated cases and assertions.

### `review` ✅

Turn run or compare artifacts into a static human-review report:

```bash
arc-skill-eval review ./skills/my-skill/evals-runs/<runId>
```

The first version shows case summaries, with-skill and without-skill outputs for compare runs, grading evidence, timing/model/tool metadata when available, benchmark deltas, and a `feedback.json` template.

### `improve` ✅

Convert review feedback into a targeted improvement plan:

```bash
arc-skill-eval improve --from-feedback ./skills/my-skill/evals-runs/<runId>/feedback.json --summary
```

The first version is plan-first rather than auto-edit-first: it reads human notes and failing assertion summaries from `feedback.json`, then proposes prompt, assertion, fixture, and adjacent-negative improvements with rationale. No eval files change unless `--apply` writes validated improvement metadata to the matching `evals/evals.json`.

### `optimize-description` ✅

Generate trigger and non-trigger prompts, then evaluate candidate frontmatter descriptions with a train/test split:

```bash
# 1. Generate a routing eval set, then review it by hand
arc-skill-eval optimize-description ./skills/my-skill --generate-only

# 2. Score the current description (one no-tools routing probe per prompt)
arc-skill-eval optimize-description ./skills/my-skill \
  --eval-set ./skills/my-skill/evals/description-evals.json

# 3. Optimize: propose from train failures, select by held-out test accuracy
arc-skill-eval optimize-description ./skills/my-skill \
  --eval-set ./skills/my-skill/evals/description-evals.json \
  --max-iterations 5
```

The first version generates should-trigger prompts (explicit and implicit) plus adjacent near-miss negatives with train/test split tags, and asks for human review before optimizing. Scoring presents the target description alongside real distractor skill frontmatter (sibling skills by default, `--distractor` to add more) with rotated option ordering, and reports per-prompt verdicts with separate train and held-out test accuracy. The optimizer proposes candidates from train-split failures only and selects the winner by test accuracy, so it cannot overfit the prompts it trains on; when nothing beats the current description on held-out prompts it says to keep it. `SKILL.md` changes only with `--apply`, which rewrites just the frontmatter description (block-scalar safe), verifies the file reads back cleanly, and restores the original otherwise.

### `package`

Package a validated skill plus evals and fixtures into a distributable artifact:

```bash
arc-skill-eval package ./skills/my-skill
```

Packaging is lower priority than runtime, review, and creation because distribution is only useful after behavior is proven.

## Runtime future

The groundwork is shipped: an internal `AgentRuntime` interface (`src/runtime/`) now sits between the eval pipeline and whatever executes a case. Pi's SDK runner is the default implementation behind it — unchanged behavior, unchanged artifacts — and the runtime's id is recorded in every trace identity. A deterministic **replay** runtime proves the seam is real: it runs cases with no model and no network, writing scripted files and assistant text so the full grade-and-artifact pipeline (including honest failures) can be exercised in tests and CI provider-free.

Still future: an experimental OpenAI-compatible custom runtime behind the same interface. That needs a model adapter layer, a safe tool loop, read/write/edit/bash tools, skill loading, workspace safety, and trace normalization — the interface now defines exactly the contract it has to meet.

## Detailed planning artifacts

The detailed engineering plan lives in the repository:

- [`docs/skill-creator-parity-plan.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-creator-parity-plan.md)
- [`docs/skill-creator-parity-progress.txt`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-creator-parity-progress.txt)
- [`docs/agent-runtime-strategy.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/agent-runtime-strategy.md)
