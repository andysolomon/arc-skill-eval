# Framework Domain Model

## Purpose
This doc describes the runtime entities `arc-skill-eval` operates on after the pivot to [Anthropic's `evals/evals.json` standard](https://platform.claude.com/docs/en/agents-and-tools/agent-skills). It tracks what lives in `src/` today. The pre-pivot lane / profile / scorer architecture is gone; see [evals-json-pivot.md](evals-json-pivot.md) for what moved and why.

## Status
- **Implemented now:** `evals/evals.json` loading + validation, SKILL.md adjacency discovery, per-case Pi SDK execution with the skill attached, fixture materialization for `files`, assertion grading (LLM-judge + `file-exists` / `regex-match` / `json-valid` scripts), per-case `grading.json` + `timing.json` outputs, CLI `run` command with per-case artifact layout.
- **Deferred post-MVP:** `with_skill` vs `without_skill` dual-run, iteration workspaces, `benchmark.json` aggregation, human-review `feedback.json`.

## Pipeline

```text
<skill-dir>
  ├── SKILL.md                        # agentskills.io format
  └── evals/
      ├── evals.json                  # Anthropic format
      └── files/<fixture-name>/…      # optional per-case inputs
         ↓ discoverEvalSkills
DiscoveredEvalSkill
         ↓ readEvalsJson
EvalsJsonFile (+ EvalCase[])
         ↓ runEvalCase
{ assistantText, workspaceDir, timing, trace }
         ↓ gradeEvalCase
GradingJson ({ assertion_results, summary })
         ↓ write to disk
<skillDir>/evals-runs/<runId>/eval-<id>/{outputs, timing.json, grading.json}
```

## Core entities

### Discovered Eval Skill (`src/evals/discover.ts`)
A skill directory that ships both `SKILL.md` and `evals/evals.json`. Discovery walks a repo, respects `.gitignore`-style ignored dirs, skips dot-prefixed dirs unless `includeDotDirs` is set.

### Evals JSON File (`src/evals/types.ts`, `src/evals/loader.ts`)
`{ skill_name, evals: EvalCase[] }`. Loaded + validated via `readEvalsJson` with an issue-collecting error type. Each `EvalCase` has `{ id, prompt, expected_output?, files?, assertions? }`.

### Eval Assertion (`src/evals/types.ts`)
Discriminated union:
- **string** — graded by an LLM-judge, result is `{ passed, evidence }`.
- **`{ type: "file-exists", path }`** — pass iff the file exists in the case workspace.
- **`{ type: "regex-match", pattern, flags?, target? }`** — pass iff the regex matches `assistant-text` (default) or a file read from the workspace.
- **`{ type: "json-valid", path }`** — pass iff the file parses as JSON.

### Eval Case Runner (`src/evals/run-case.ts`)
`runEvalCase({ skill, case, evalsDir, model?, createSession? })` → `{ caseId, assistantText, workspaceDir, timing, trace, cleanup }`. Materializes `case.files` into a temp workspace before invoking Pi. Caller owns `cleanup()`.

### Grader (`src/evals/grade.ts`)
`gradeEvalCase({ case, workspaceDir, assistantText, judge?, judgeModel? })` → `GradingJson`. Batches string assertions into one LLM-judge call; runs script assertions synchronously. Path-traversal guard on every script path.

### Run Command (`src/cli/run-evals-command.ts`)
`runEvalsCommand({ input, skillNames?, caseIds?, outputDirOverride?, ... })` — the top-level CLI handler. Discovers, loops over cases, writes artifacts, aggregates a summary. Per-case failures are captured in `skill.errors[]` rather than aborting the run.

### Grading Output (`grading.json`, `timing.json`)
Per Anthropic's shape. `grading.json`: `assertion_results[]` with `text`, `passed`, `evidence`, and the originating `assertion`; plus a `summary` block. `timing.json`: `{ total_tokens, duration_ms }`.

## Runtime adapters (kept from pre-pivot)
- **`src/pi/`** — Pi SDK runner + CLI JSON runner. `runPiSdkCase` is what the case runner wraps internally.
- **`src/fixtures/`** — temp workspace materialization with git-state support. Used when a case declares `files`.
- **`src/traces/`** — `EvalTrace` canonical trace type + SDK / CLI JSON normalizers. Kept because the trace is useful scaffolding for debugging runs.

## Deprecated and removed
- `src/contracts/` + `src/load/` — the old `SkillEvalContract` TypeScript authoring surface and its loaders. Replaced by `evals/evals.json`.
- `src/scorers/` — lane + profile + dimension scoring engine. Replaced by assertion grading in `src/evals/grade.ts`.
- `src/reporting/` — custom `report.json` / `report.html` output. Replaced by per-case `grading.json` + `timing.json`.
- `src/traces/compare-parity.ts` — parity lane comparison. Parity as a first-class lane is deferred; when it returns it will be an execution strategy, not an authoring concern.
- `src/cli/{list,validate,test}-command.ts` — old CLI commands. Replaced by a single `run` command.

See [evals-json-pivot.md](evals-json-pivot.md) for the rationale and the full milestone log.
