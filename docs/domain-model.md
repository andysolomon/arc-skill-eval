# Framework Domain Model

## Purpose
This doc describes the runtime entities `arc-skill-eval` operates on after the pivot to [Anthropic's `evals/evals.json` standard](https://platform.claude.com/docs/en/agents-and-tools/agent-skills). It tracks what lives in `src/` today. The pre-pivot lane / profile / scorer architecture is gone; see [evals-json-pivot.md](evals-json-pivot.md) for what moved and why.

## Status
- **Implemented now:** `evals/evals.json` loading + validation, SKILL.md adjacency discovery, per-case Pi SDK execution with the skill attached, workspace materialization via legacy `files` or explicit `setup`, assertion grading (LLM-judge + legacy scripts + intent-based output/workspace assertions), per-case `grading.json` + `timing.json` outputs, CLI `run` command with per-case artifact layout, and opt-in `with_skill` vs `without_skill` comparison via `--compare`.
- **Deferred post-MVP:** iteration workspaces, `benchmark.json` aggregation, human-review `feedback.json`.

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
         ↓ materialize WorkspaceSetup / legacy files
         ↓ runEvalCase
{ assistantText, workspaceDir, timing, trace }
         ↓ gradeEvalCase
GradingJson ({ assertion_results, summary })
         ↓ write to disk
<skillDir>/evals-runs/<runId>/eval-<id>/{outputs, timing.json, grading.json}
```

Opt-in comparison pipeline extension:

```text
EvalCase
  ├── with_skill     → runEvalCase → gradeEvalCase → with_skill/grading.json
  └── without_skill  → runEvalCase → gradeEvalCase → without_skill/grading.json
          ↓ aggregate
benchmark.json ({ per-case pass rates, skill deltas, timing/token summaries })
```

## Core entities

### Discovered Eval Skill (`src/evals/discover.ts`)
A skill directory that ships both `SKILL.md` and `evals/evals.json`. Discovery walks a repo, respects `.gitignore`-style ignored dirs, skips dot-prefixed dirs unless `includeDotDirs` is set.

### Skill Domain Types (`src/contracts/types.ts`)
New code should distinguish classification, capabilities, policy, and environment instead of overloading the old `profile` enum:
- `SkillCategory` / `SkillClassification` — what the skill is for, with primary/secondary categories and confidence.
- `SkillCapabilities` — what the skill can do (`readsRepo`, `writesRepo`, `usesGit`, external APIs, orchestration, planning, validation).
- `SkillPolicy` — thinking level, enforcement mode, and target tier.
- `EnvironmentRequirements` — workspace/git/network/tool/env-var requirements.
- `InferenceMetadata` — source, confidence, and rationale for inferred values.
- `SkillDefinition<EvalSuiteT>` — first-class aggregate tying descriptor, source, and optional eval suite together.

`PROFILE_VALUES` and `SkillProfile` remain as deprecated aliases for compatibility.

### Evals JSON File (`src/evals/types.ts`, `src/evals/loader.ts`)
`{ version?, skill_name, evals: EvalCase[] }`. Loaded + validated via `readEvalsJson` with an issue-collecting error type. Each `EvalCase` has `{ id, description?, prompt, expected_output?, setup?, files?, assertions?, metadata? }`. Prefer `setup` for new cases; `files` remains supported as a legacy shorthand.

### Workspace Setup (`src/contracts/types.ts`, `src/evals/run-case.ts`)
`WorkspaceSetup` unifies the ways a case prepares its workspace:
- **`{ kind: "empty" }`** — start with an empty temp workspace.
- **`{ kind: "seeded", sources, mountMode? }`** — copy files from `evals/`, either preserving source paths or flattening directory contents into `to`.
- **`{ kind: "fixture", fixture }`** — use the existing `FixtureRef` materializer, including git setup/hooks.

Legacy `files: [...]` compiles to a seeded setup with `mountMode: "preserve-path"`, preserving current copy behavior.

### Eval Assertion (`src/evals/types.ts`)
Discriminated union:
- **string** — legacy LLM-judged assertion.
- **legacy script assertions** — `{ type: "file-exists" | "regex-match" | "json-valid", ... }`.
- **intent assertions** — `{ id, kind, method, ... }`, split by purpose:
  - `kind: "output"` with `method: "judge" | "regex" | "exact"`.
  - `kind: "workspace"` with `method: "file-exists" | "file-contains" | "json-valid" | "snapshot-diff"`.
  - `kind: "behavior"` and `kind: "safety"` for trace-aware checks. These validate now; deterministic grading for them is still deferred.

### Eval Case Runner (`src/evals/run-case.ts`)
`runEvalCase({ skill, case, evalsDir, model?, createSession? })` → `{ caseId, assistantText, workspaceDir, timing, trace, cleanup }`. Materializes `case.setup` and legacy `case.files` into a temp workspace before invoking Pi. Caller owns `cleanup()`.

### Grader (`src/evals/grade.ts`)
`gradeEvalCase({ case, workspaceDir, assistantText, judge?, judgeModel? })` → `GradingJson`. Batches legacy string assertions and `output/judge` assertions into one LLM-judge call; runs legacy scripts plus `output/regex`, `output/exact`, and workspace intent assertions synchronously. Path-traversal guard remains on every workspace path.

### Run Command (`src/cli/run-evals-command.ts`)
`runEvalsCommand({ input, skillNames?, caseIds?, outputDirOverride?, ... })` — the top-level CLI handler. Discovers, loops over cases, writes artifacts, aggregates a summary. Per-case failures are captured in `skill.errors[]` rather than aborting the run.

### Grading Output (`grading.json`, `timing.json`)
Per Anthropic's shape. `grading.json`: `assertion_results[]` with `text`, `passed`, `evidence`, and the originating `assertion`; plus a `summary` block. `timing.json`: `{ total_tokens, duration_ms }`.

## Comparison and planned post-MVP entities

### Run Variant
A run variant is the execution strategy for one eval case. Single-run remains the default execution mode; variant comparison is opt-in via `--compare`. The current variants are:
- **`with_skill`** — current behavior: run through Pi with the target skill attached.
- **`without_skill`** — baseline behavior: run the same prompt/model/workspace setup without attaching the target skill.

Both variants should materialize equivalent fresh workspaces before execution so pass-rate deltas reflect skill value rather than workspace contamination.

### Case Comparison Result
A case-level aggregate that points at both variant grading outputs and computes:
- `with_skill` pass rate
- `without_skill` pass rate
- delta = `with_skill.pass_rate - without_skill.pass_rate`
- timing/token summaries per variant
- runtime or grading errors per variant

### Benchmark JSON (`benchmark.json`)
A planned run-level aggregate over all cases in a skill. It should answer the product question: “does this skill improve results?” Keep the core artifact Anthropic-compatible: per-case results, overall pass rates, overall delta, and error summaries. Put Pi-specific trace refs, token counts, model info, and artifact paths under a metadata/extensions section so the artifact remains portable while preserving debugging detail.

### Iteration Workspace
A durable grouping for repeated eval cycles, e.g. `iteration-1/`, `iteration-2/`. In the initial implementation, iterations are runner artifacts only: they group outputs without proposing or applying `SKILL.md` edits. Iterations should keep prior artifacts immutable and may optionally include the evaluated `SKILL.md` snapshot. Generated feedback or improvement proposals can layer on later.

## Runtime adapters (kept from pre-pivot)
- **`src/pi/`** — Pi SDK runner + CLI JSON runner. `runPiSdkCase` is what the case runner wraps internally.
- **`src/fixtures/`** — temp workspace materialization with git-state support. Used when a case declares `setup: { kind: "fixture" }`.
- **`src/traces/`** — `EvalTrace` canonical trace type + SDK / CLI JSON normalizers. Kept because the trace is useful scaffolding for debugging runs.

## Deprecated and removed
- `src/load/` plus the legacy portions of `src/contracts/` — the old `SkillEvalContract` TypeScript authoring surface and its loaders. Replaced for authoring by `evals/evals.json`; `src/contracts/types.ts` now also hosts the newer domain descriptor types.
- `src/scorers/` — lane + profile + dimension scoring engine. Replaced by assertion grading in `src/evals/grade.ts`.
- `src/reporting/` — custom `report.json` / `report.html` output. Replaced by per-case `grading.json` + `timing.json`.
- `src/traces/compare-parity.ts` — parity lane comparison. Parity as a first-class lane is deferred; when it returns it will be an execution strategy, not an authoring concern.
- `src/cli/{list,validate,test}-command.ts` — old CLI commands. Replaced by a single `run` command.

See [evals-json-pivot.md](evals-json-pivot.md) for the rationale and the full milestone log.
