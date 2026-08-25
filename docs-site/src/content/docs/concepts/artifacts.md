---
title: Artifacts
description: The per-case artifact tree (assistant.md, outputs/, grading.json, timing.json, trace.json, tool-summary.json, context-manifest.json) and the run-level benchmark.json.
sidebar:
  order: 6
---

Each run writes case artifacts under `<skillDir>/evals-runs/<runId>/`. In `--compare` mode, each case contains separate directories for the two variants.

## Default layout

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

## Per-case artifacts

### `assistant.md`

The final response in plain markdown.

### `outputs/`

The workspace snapshot after the run. If the skill writes `greeting.txt`, the file appears here. Deterministic script assertions read from this directory.

### `grading.json`

The per-assertion verdict. Its Anthropic-compatible `assertion_results[]` array contains `text`, `passed`, and `evidence`. The `summary` block contains `passed`, `failed`, `total`, and `pass_rate`. See [Grading](/arc-skill-eval/concepts/grading/).

### `timing.json`

Runtime measurements:

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

Records duration, model identity, thinking level, token counts, estimated cost, context-window size, and context-window use.

### `trace.json`

The normalized runtime trace: response text, tool calls and results, file changes, skill reads, external calls, and references to raw runtime data. The `EvalTrace` shape is the same for the Pi SDK and Pi CLI JSON runners.

### `tool-summary.json`

Tool-use counters:

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

Use these counters to spot unexpected behavior without opening the full trace. For example, `bash` in the call counts shows that the case ran shell commands.

### `context-manifest.json`

The skills, tools, and ambient resources available during the case:

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

For `--compare` runs, compare the manifests to confirm that only the target skill differs.

## The run-level `benchmark.json` (compare runs only)

`--compare` adds a top-level `benchmark.json` that aggregates per-case pass rates and the with/without delta:

```text
<skillDir>/evals-runs/<runId>/
├── benchmark.json
├── eval-<case-id>/
│   ├── with_skill/...
│   └── without_skill/...
```

Per-case results, overall pass rates, overall delta, and errors stay at the top level. Pi-specific fields such as artifact paths, trace paths, token counts, timing, model metadata, estimated cost, context-window use, tool-call counts, MCP tool counts, and attached-skill summaries live under `metadata.extensions`.

## External observability (Laminar)

Local artifacts remain available whether or not export succeeds. `run --laminar` can also send results to [Laminar](https://www.lmnr.ai/)'s Evaluations view. See the [`--laminar` flag](/arc-skill-eval/cli-reference/#--laminar) for setup.

The export creates one evaluation per run variant (`with_skill` and `without_skill`) and one scored datapoint per case. Both evaluations share a group: the skill name, or `LMNR_PROJECT_NAME` when set. The run summary prints a dashboard URL for each evaluation.

Each datapoint includes grading verdicts, metrics, and artifact paths. It does not export response text, prompts, or file contents.

| Local source | Laminar datapoint fields |
| --- | --- |
| run id, iteration, skill name, variant | evaluation name + group; datapoint `data` |
| case id, model | datapoint `data` (`case_id`, `provider/model`) |
| `timing.json` | scores: `total_tokens`, `cost_usd`, `duration_ms`; token breakdown in metadata |
| `grading.json` summary | scores: `pass_rate`, `passed`, `failed` |
| `grading.json` assertion results | output: per-assertion text, pass/fail, short evidence quote |
| `tool-summary.json` | score: `tool_calls`; error/MCP/file-touch counts in metadata |
| per-case artifact paths | output `artifacts`, which links to the local files |

When a case has no gradable assertions, its `pass_rate` is `null` and the export omits the score instead of reporting `0`.

If Laminar export fails, the run still completes, uses assertion results for its exit code, and writes local artifacts. The run reports the failed export without aborting.

## Not yet included

- Cross-iteration comparison. Iteration directories group outputs but do not aggregate results or change `SKILL.md`.
- Human-review `feedback.json`.
- An evaluated `SKILL.md` snapshot for each iteration.
