---
title: Skill creator roadmap
description: What Skeval already has, and what it plans to add from Claude's skill-creator workflow.
---

Claude's `skill-creator` covers authoring, testing, review, and iteration. Skeval already runs evals. This roadmap tracks the surrounding workflow.

## Already shipped

Skeval can:

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

The remaining work focuses on packaging and runtime support.

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

The command reads `SKILL.md` frontmatter and writes trigger, execution, and adjacent-negative starter cases. It infers `file-exists` and `json-valid` assertions from paths such as `plan.md` or `report.json`, creates likely inputs such as `notes/input.md` under `evals/files/starter-inputs/`, and tailors adjacent-negative prompts to common skill types. `--summary` prints the proposed cases and assertions.

### `review` ✅

Turn run or compare artifacts into a static human-review report:

```bash
arc-skill-eval review ./skills/my-skill/evals-runs/<runId>
```

The report shows case summaries, both variants for compare runs, grading evidence, timing and tool data, benchmark deltas, and a `feedback.json` template.

### `improve` ✅

Convert review feedback into a targeted improvement plan:

```bash
arc-skill-eval improve --from-feedback ./skills/my-skill/evals-runs/<runId>/feedback.json --summary
```

The command reads notes and failed assertions from `feedback.json`, then proposes changes to prompts, assertions, fixtures, and adjacent-negative cases. It changes `evals/evals.json` only when you pass `--apply`.

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

The command generates explicit and implicit trigger prompts plus adjacent negatives, tagged for train and test splits. Scoring compares the target description with sibling skill descriptions and any `--distractor` entries, rotates option order, and reports train and held-out test accuracy. It proposes candidates from train failures and chooses by test accuracy. `--apply` changes only the frontmatter description, verifies the result, and restores the original if validation fails.

### `package`

Package a validated skill plus evals and fixtures into a distributable artifact:

```bash
arc-skill-eval package ./skills/my-skill
```

Packaging remains planned.

## Runtime future

The internal `AgentRuntime` interface in `src/runtime/` separates case execution from the eval pipeline. Pi's SDK runner is the default implementation, and each trace records the runtime ID. A deterministic replay runtime runs scripted cases without a model or network so tests and CI can exercise grading and artifact writing.

A custom OpenAI-compatible runtime remains planned. It needs model adapters, a tool loop, read/write/edit/bash tools, skill loading, workspace controls, and trace normalization.

## Detailed planning artifacts

The detailed engineering plan lives in the repository:

- [`docs/skill-creator-parity-plan.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-creator-parity-plan.md)
- [`docs/skill-creator-parity-progress.txt`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-creator-parity-progress.txt)
- [`docs/agent-runtime-strategy.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/agent-runtime-strategy.md)
