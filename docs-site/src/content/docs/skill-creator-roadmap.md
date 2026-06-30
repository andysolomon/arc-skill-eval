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

### `improve`

Convert review feedback into a targeted improvement plan:

```bash
arc-skill-eval improve ./skills/my-skill --from-feedback feedback.json
```

The first version should be plan-first rather than auto-edit-first: group recurring failures, cite evidence, propose `SKILL.md` edits, and recommend new eval cases.

### `optimize-description`

Generate trigger and non-trigger prompts, then evaluate candidate frontmatter descriptions with a train/test split:

```bash
arc-skill-eval optimize-description ./skills/my-skill --generate-only
arc-skill-eval optimize-description ./skills/my-skill --eval-set trigger-evals.json --max-iterations 5
```

The command should apply the best description only with `--apply` or explicit confirmation.

### `package`

Package a validated skill plus evals and fixtures into a distributable artifact:

```bash
arc-skill-eval package ./skills/my-skill
```

Packaging is lower priority than runtime, review, and creation because distribution is only useful after behavior is proven.

## Runtime future

Skeval should keep Pi as the default runtime for now. A future internal `AgentRuntime` interface can make Pi one runtime among several and allow an experimental OpenAI-compatible custom runtime behind the same eval contract.

That custom runtime would need a model adapter layer, a safe tool loop, read/write/edit/bash tools, skill loading, workspace safety, and trace normalization. It is worth exploring, but only after eval-owned Pi config and the review loop are working.

## Detailed planning artifacts

The detailed engineering plan lives in the repository:

- [`docs/skill-creator-parity-plan.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-creator-parity-plan.md)
- [`docs/skill-creator-parity-progress.txt`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/skill-creator-parity-progress.txt)
- [`docs/agent-runtime-strategy.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/agent-runtime-strategy.md)
