---
title: Artifacts
description: The per-case artifact tree (assistant.md, outputs/, grading.json, timing.json, trace.json, tool-summary.json, context-manifest.json) and the run-level benchmark.json.
sidebar:
  order: 6
---

Every case produces the same artifact tree, and every run rolls up to a directory under `<skillDir>/evals-runs/<runId>/`. The tree is the same in default and `--compare` modes — `--compare` just nests two copies under per-variant directories.

## Default layout (single variant)

```text
<skillDir>/evals-runs/<runId>/
├── eval-<case-id>/
│   ├── assistant.md
│   ├── outputs/
│   ├── timing.json
│   ├── grading.json
│   ├── trace.json
│   ├── tool-summary.json
│   └── context-manifest.json
```

Add `--iteration <name>` and the layout becomes `<skillDir>/evals-runs/iteration-<name>/<runId>/...`.

## The seven per-case artifacts

### `assistant.md`

The final assistant response for the run. Plain markdown. This is what the model said back.

### `outputs/`

The workspace filesystem snapshot after the run completes. If the skill writes `greeting.txt`, you'll find it here. If it writes nothing, the directory is empty. This is what the deterministic script assertions read against.

### `grading.json`

The per-assertion verdict. Anthropic-compatible `assertion_results[]` array with `text` / `passed` / `evidence`, plus a `summary` block with `passed` / `failed` / `total` / `pass_rate`. See [Grading](/arc-skill-eval/concepts/grading/) for the shape and rationale.

### `timing.json`

Runtime observability:

```json
{
  "total_tokens": 12345,
  "duration_ms": 50123,
  "model": { "provider": "anthropic", "id": "claude-opus-4-5", "thinking": "medium" },
  "thinking_level": "medium",
  "token_usage": {
    "input_tokens": 10000,
    "output_tokens": 2000,
    "cache_read_tokens": 300,
    "cache_write_tokens": 45,
    "total_tokens": 12345
  },
  "estimated_cost_usd": 0.1234,
  "context_window_tokens": 200000,
  "context_window_used_percent": 6.2
}
```

Captures duration, model identity, thinking level, token counts (including cache reads/writes), estimated cost, context-window size, and context-window percentage used. Enough to answer "how expensive was this case?" and "did the skill blow the context window?" without re-running.

### `trace.json`

The normalized runtime trace — assistant text, tool calls and their results, file touches, skill reads, external calls, and references to the raw runtime telemetry. Useful for debugging a specific case without replaying it. The `EvalTrace` shape is the same whether the case ran via the Pi SDK or the Pi CLI JSON runner.

### `tool-summary.json`

Compact behavior counters:

```json
{
  "tool_call_count": 8,
  "tool_error_count": 0,
  "tool_calls_by_name": { "read": 2, "bash": 3, "write": 2, "edit": 1 },
  "skill_read_count": 1,
  "skill_reads_by_name": { "arc-conventional-commits": 1 },
  "external_call_count": 0,
  "mcp_tool_call_count": 0
}
```

Made-for-grepping. If a skill should never run shell commands and `bash` shows up in the call counts, that's an obvious red flag without opening the trace.

### `context-manifest.json`

The loadout — what was actually exposed to the model:

```json
{
  "runtime": "pi",
  "mode": "isolated",
  "attached_skills": [
    { "name": "arc-conventional-commits", "path": ".../SKILL.md", "role": "target" }
  ],
  "available_tools": [{ "name": "bash", "source": "builtin" }],
  "active_tools": ["read", "bash", "edit", "write"],
  "mcp_tools": [],
  "mcp_servers": [],
  "ambient": {
    "extensions": false,
    "skills": false,
    "prompt_templates": false,
    "themes": false,
    "context_files": false
  }
}
```

Critical for `--compare` runs: a reviewer can confirm that the *only* difference between `with_skill` and `without_skill` was the target skill, not some ambient resource.

## The run-level `benchmark.json` (compare runs only)

`--compare` adds a top-level `benchmark.json` that aggregates per-case pass rates and the with/without delta:

```text
<skillDir>/evals-runs/<runId>/
├── benchmark.json
├── eval-<case-id>/
│   ├── with_skill/...
│   └── without_skill/...
```

The Anthropic-compatible core (per-case results, overall pass rates, overall delta, errors) stays at the top level of the document. Pi-specific extensions — artifact paths, trace paths, token counts, timing, model metadata, estimated cost, context-window usage, tool-call counts, MCP-looking tool counts, and attached-skill summaries — live under `metadata.extensions`. The artifact remains portable to any Anthropic-format consumer while keeping the debugging detail.

## What's not yet in the artifact tree

- **Cross-iteration comparison.** Today, iterations are runner-only artifact buckets — they group outputs without proposing or applying `SKILL.md` edits or aggregating across iterations. A cross-iteration aggregate is on the post-MVP list.
- **Human-review `feedback.json`.** Authoring ergonomic; not structural; deferred.
- **Optional evaluated `SKILL.md` snapshot per iteration.** Useful for proving "this version of the skill scored this delta"; deferred until iterations need to carry skill mutations.
