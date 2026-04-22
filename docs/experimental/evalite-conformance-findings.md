# Evalite Conformance — Spike Findings

Lives on `experiment/evalite-conformance` only. Not merged to main.

## Iteration 1 — minimal wiring proof (2026-04-22)

### What ran
```
npm run evalite:spike
```

That invokes `evalite tests/fixtures/evalite-skill-repo`, which:
1. Loaded `tests/fixtures/evalite-skill-repo/skills/alpha/skill.eval.ts`
2. That file imports `defineSkillEval` from `src/evalite/define-skill-eval.ts` and calls it with a minimal routing-only contract.
3. `defineSkillEval` flattened `routing.explicit` into Evalite's `data[]`, registered a stub `task`, and a placeholder `mentions-skill` scorer.
4. Evalite ran both routing cases in ~12 ms; both scored 100%.

### What worked
- **Zero generation step.** Our existing authoring pattern (`export default {...}`) becomes `defineSkillEval({...})` with the same shape. No cache dir, no pre-processor.
- **Evalite's hard-coded include glob (`**/*.eval.?(m)ts`) is fine** once the spike directory is narrowed via the positional `path` argument. `evalite tests/fixtures/evalite-skill-repo` scopes discovery cleanly without touching the rest of the repo.
- **Types are tight.** `Evalite.Task<TInput, TOutput>` and `Evalite.Scorer<TInput, TOutput, TExpected>` compose directly with our domain types; no adapter types needed.
- **Existing `tsc --noEmit -p tsconfig.json` still passes** with the new `src/evalite/` module in place.

### What the stub task and scorer are hiding
The spike's `task` just echoes the input into a summary string. Real work the next iteration must replace:
- fixture materialization via `materializeFixture`
- Pi SDK execution via `runPiSdkCase`
- trace normalization via `normalizePiSdkCaseRunResult`
- deterministic scoring via `scoreDeterministicCase`, mapped into one or more Evalite scorers

### Design-pick status on the experimental branch
- **A (CLI parity):** still open — the spike only covers routing. Current lean: both SDK + CLI runtimes inside one `task`, returning `{ sdkTrace, cliTrace }`.
- **B (live-smoke gating):** implemented as designed — `defineSkillEval` filters live-smoke cases out of `data[]` unless `ARC_INCLUDE_LIVE_SMOKE=1`.
- **C (report.json survival):** retired for now; Evalite's SQLite + UI are the reporting surface. `evalite --outputPath report.json` is a cheap restore path if we decide we need CI-consumable JSON later (Evalite supports this natively).

### Smell check — is `src/` starting to shrink?
Not yet; spike only *adds* `src/evalite/`. The shrink comes when we point the Evalite-backed task at existing Pi/fixture/scorer internals and then remove `src/cli/*` + `src/reporting/*`. That is iteration 2+ work.

### Next iteration plan
1. **Wire real task.** Replace stubbed task with: `materializeFixture → runPiSdkCase → normalizePiSdkCaseRunResult`. Start with the existing `tests/fixtures/valid-skill-repo/skills/alpha` routing case structure (no fixture needed yet).
2. **Port one deterministic scorer.** Wrap `scoreDeterministicCase` as an Evalite scorer and replace the placeholder `mentions-skill`. Keep dimensions (trigger/process/outcome) as separate Evalite scorers for UI drill-down.
3. **Prove fixture flow.** Pick one execution-lane case with a fixture (or add one) and verify that temp workspace materialization + cleanup still works inside an Evalite `task`.
4. **Measure the delete list.** After iterations 2–3, walk through `src/cli/*`, `src/reporting/*`, and orchestration in `src/pi/sdk-runner.ts` to identify what is now dead code under the Evalite path.

### Risks surfaced so far
- Evalite's `include` glob is hardcoded and non-overridable. If we ever want to run Evalite from repo root (not a subdirectory), we'd need to exclude `tests/fixtures/valid-skill-repo/**/*.eval.ts` via `vitest.config.ts`, or migrate those fixtures to `defineSkillEval` too. For now the positional path argument is enough.
- `evalite@0.19.0` with v1 still in beta. Worth pinning strictly and watching releases.

---

## Iteration 2 — real deterministic scorer wired (2026-04-22)

### What changed
- `src/evalite/synthesize-trace.ts` — builds a realistic `EvalTrace` per input lane without calling Pi. Explicit/implicit-positive/execution lanes get a "skill invoked" trace; adjacent/hard-negative get a "skill not invoked" trace.
- `src/evalite/define-skill-eval.ts` now normalizes the contract, registers a `PiSdkRunnableCase` per data entry, and runs `scoreDeterministicCase` inside `task`. Output carries `{ input, trace, scorecard, summary }`.
- Two Evalite scorers in place of five:
  - **`deterministic`** — returns `scorecard.score` with the full dimension breakdown + executionStatus + passed + deferredExpectations in `metadata`.
  - **`hard-assertions`** — returns `hardPassed ? 1 : 0` with the assertion list in `metadata`.

### Result
```
Score        100%
Eval Files   1
Evals        2
Duration     17ms
```
Scorer breakdown per case:
```
deterministic: 1   metadata-keys=scorePercent,executionStatus,passed,dimensions,deferredExpectations
hard-assertions: 1 metadata-keys=assertions
```
Evalite's displayed average (1.0) matches our canonical `scorecard.scorePercent` (100%).

### Key finding: Evalite averages scorers equally; null == 0
Iteration 2.0 used five scorers (overall + trigger/process/outcome + hard-assertions). When a dimension wasn't applicable to a lane (e.g. `process` for routing), `dimensions[dim].score` is `null`. Evalite's types document that null scores are reported as 0, which **pulled the displayed average to 60% even though our deterministic score was 100%**.

Fix: collapse to a single authoritative scorer plus hard-assertions, and move dimension breakdown into `metadata`. This is the right pattern for any domain where "not applicable" is distinct from "failed."

### Call on dimension breakdown UI
Evalite's default table view renders one column per scorer and hides `metadata`. For dimension drill-down we'd want either:
- the Evalite web UI (`evalite watch` → `:3006`) — not verified yet on this branch
- post-processing `--outputPath` JSON
- a custom `columns` callback on the eval to surface dimensions inline

Defer the decision until someone's actually consuming the UI.

### What still isn't real
- `task` still synthesizes the trace. Iteration 3 replaces with `materializeFixture → runPiSdkCase → normalizePiSdkCaseRunResult`. That needs Pi SDK credentials in the environment; the spike so far is reproducible without any auth.
- CLI parity + live-smoke lanes are still stubbed out at registration time (deferred).
- No execution lane yet — alpha only has routing.explicit cases. Next iteration's new case should declare a fixture so fixture lifecycle inside an Evalite task is exercised.

### Shrink watch
- `src/evalite/` is now ~290 lines across 2 files.
- Still zero lines deleted from `src/cli/*` or `src/reporting/*`. That deletion starts once the Evalite path covers execution + parity + reporting.

---

## Iteration 3 — real Pi SDK wired behind env flag (2026-04-22)

### What changed
- `src/evalite/pi-runner-task.ts` — new module. `runCaseViaPi()` builds a `ValidatedSkillDiscovery` from a `DiscoveredSkillFiles`, calls `runPiSdkCase`, normalizes via `normalizePiSdkCaseRunResult`, and constructs a `DeterministicWorkspaceContext` for the scorer. Returns `{ trace, workspace, cleanup }`.
- `src/evalite/define-skill-eval.ts` — new options: `skillDir` (required for Pi mode), `repositoryRoot`. Task branches on `ARC_EVALITE_USE_PI=1`. Pi branch always calls `runPiSdkCase().cleanup()` in a `finally` so temp workspaces don't leak when scoring throws.
- `tests/fixtures/evalite-skill-repo/skills/alpha/skill.eval.ts` — now derives `skillDir` from `import.meta.url` and passes it through.
- `tests/fixtures/evalite-skill-repo/skills/alpha/execution.ts` — first execution case with a fixture reference (`./fixtures/hello-world`).
- `tests/fixtures/evalite-skill-repo/skills/alpha/fixtures/hello-world/README.md` — minimal fixture content for the execution case to read.
- `tests/fixtures/evalite-skill-repo/skills/alpha/SKILL.md` — now has YAML frontmatter (`name`, `description`). Required by `@mariozechner/pi-coding-agent`'s `loadSkillsFromDir` — without a non-empty `description` the loader silently drops the skill and `runPiSdkCase` throws `Unable to load Pi skill definition`.

### Run modes
```
# synthetic, free, deterministic
npm run evalite:spike

# real Pi SDK, costs API calls (~$0.05–0.30/case)
ARC_EVALITE_USE_PI=1 npx evalite tests/fixtures/evalite-skill-repo
```

### Synthetic result (3 evals)
```
Score  83%      # routing 100%+100%, execution 50% (no workspace outcomes applicable)
Time   16ms
```
Execution case lands at 50% in synthetic mode because our synthesized trace has no file edits / no applicable outcome checks — exactly the gap Pi mode should fill.

### Pi result (3 evals, same session)
```
Score  50%
Time   8.8s
```
All 3 cases scored 50%. Inspecting the trace showed the LLM responded with empty content. Raw session explains why:
```
"stopReason": "error",
"errorMessage": "You have hit your ChatGPT usage limit (plus plan). Try again in ~91 min."
```
So **the Evalite→defineSkillEval→runPiSdkCase→normalize→score pipeline worked end-to-end**; the 50% average came from a real rate-limit on the model provider, not a wiring bug. Notably the scorer correctly flagged `routing.target-skill-engagement: failed` even though the session returned cleanly — i.e. the scorer treats "no assistant output" as "skill not engaged," which is the correct signal.

### Cost/time profile (Pi mode)
- 3 cases × ~8.8s each = ~27s wall time (concurrency 5 in Evalite's default).
- Actual wall clock: 8.8s thanks to the concurrent runner.
- Tokens: 0 on all three (quota-gated). Real tokens on a healthy day would dwarf the evals themselves, so Evalite's default `maxConcurrency: 5` will need a think when the pilot cohort is large.

### Pi-mode still-open items
- Haven't seen a fully green Pi run yet. Worth a retry after ~91 min or with a provider switch.
- `normalizePiSdkCaseRunResult` is producing `model: null` on the trace. Expected? The session itself records `"model": "gpt-5.4"`, so the normalizer may be losing this. Minor; worth a follow-up.
- `createWorkspaceContextFromPiSdkCaseResult` runs synchronously on an (un)awaited path in `pi-runner-task.ts` — I had to drop the `await` after tsc complained. Double-check that it's actually synchronous (it is — `workspace.ts:22` returns a plain object, no await needed).

### Cumulative shrink watch
- `src/evalite/` is now ~380 lines across 3 files.
- Still zero deletions in `src/cli/*` / `src/reporting/*`. Iteration 4 is when the CLI stops being necessary for Evalite-backed runs.

### Next iteration — options (pick in the next turn)
1. **Retry Pi on healthy quota** to confirm green routing + execution scoring. No code needed.
2. **Parity lanes.** Wire `cli-parity` by running the same case through both runners inside one `task` and attaching parity comparison as a third scorer.
3. **Delete-list walk.** Now that the Evalite path is structurally complete, audit `src/cli/*` + `src/reporting/*` for what's dead under the new model and draft a deprecation plan.

---

## Iteration 4 — cli-parity lane + unified scorer (2026-04-22)

### What changed
- `src/evalite/pi-runner-task.ts` gains `runParityCaseViaPi()` — runs the case through both `runPiSdkCase` and `runPiCliJsonCase`, normalizes each via `normalizePiSdkCaseRunResult` / `normalizePiCliJsonCaseRunResult`, compares via `compareEvalTraceParity`, and returns a unified `{ sdkTrace, cliTrace, comparison, cleanup }`. The `cleanup` tears down **both** temp workspaces.
- `src/evalite/define-skill-eval.ts` now handles `cli-parity` cases: synthetic mode emits two synthesized traces (one tagged `pi-sdk`, one `pi-cli-json`) and runs `compareEvalTraceParity` against them; Pi mode dispatches to `runParityCaseViaPi`.
- `SkillEvalOutput` gained `parity: { cliTrace, comparison } | null` so the output carries both sides of a parity case.
- Alpha fixture: new `parity.ts` with one `cli-parity` case, wired into `skill.eval.ts`.

### Scorer model: collapsed three scorers to one
Iteration 2's lesson repeated itself. Having separate `deterministic` / `hard-assertions` / `parity-match` scorers meant every lane produced `null` for at least one scorer, and Evalite's null-to-0 coercion dragged displayed averages below canonical `scorecard.score`. The fix: one unified `arc-skill` scorer that dispatches by lane kind and puts the breakdown (dimensions, hard assertions, parity mismatches) in `metadata`.

This is a **structural mismatch worth noting**: Evalite's scorer array is designed for homogeneous per-result dimensions (all scorers apply to every result) — not for our lane-conditional model where "process" / "parity" / "hard-assertions" only apply to specific lane kinds. Folding into one scorer loses Evalite's UI drill-down columns, but the metadata is complete and any consumer that wants drill-down can project from `--outputPath` JSON.

### Synthetic result (4 evals)
```
Score       75%
Eval Files  1
Evals       4
Duration    18ms
```
Breakdown:
- `routing-explicit-001`: 100%
- `routing-explicit-002`: 100%
- `execution-read-readme`: 0% (synth mode has no workspace → scorecard.score null → 0; expected)
- `parity-echo-readme`: 100% (synthetic SDK and CLI traces match)

### Pi mode status
Not yet re-run — blocked on the user's ChatGPT Plus quota reset. Wiring is identical to iteration 3's Pi path; parity adds one more Pi invocation per parity case (two runtimes × one case = ~17s wall time on top of existing cases). Cost should be considered before re-running.

### Cumulative shrink watch
- `src/evalite/` is now ~470 lines across 3 files.
- Still zero deletions in `src/cli/*` / `src/reporting/*` — iteration 5 material (below).

---

## Delete-list walk — what `src/cli/*` and `src/reporting/*` become under Evalite

(Captured by a background audit agent on 2026-04-22.)

### `src/cli/` module audit
| File | Purpose | Status | Rationale |
|---|---|---|---|
| `argv.ts` | Parses CLI flags (`list`/`validate`/`test`, `--skill`, `--case`, `--json`, `--html`). | **delete** | Absorbed by `evalite run`/`evalite watch` + `--outputPath`. |
| `run-cli.ts` | Command dispatcher: parse → run → format → exit. | **delete** | Orchestration layer superseded by Evalite's discovery + runner. |
| `list-command.ts` | Lists discovered skills. | **delete** | Evalite storage/UI surface discovery. |
| `validate-command.ts` | Validates contracts without running. | **delete** | Validation folds into case discovery; invalid skills surface in Evalite results. |
| `test-command.ts` | Core runner: Pi SDK/CLI, normalize, score, write report. | **rewrite/extract** | Logic stays but moves into `defineSkillEval`'s `task` + scorers. |
| `render.ts` | Terminal output formatting. | **delete** | Evalite UI + JSON export replace. |
| `types.ts` | Command/result/error types. | **keep/shrink** | Error classes retire; a few types still shape `test-command` pieces that move into the Evalite path. |
| `shared.ts` | Repo loading, skill selection, framework version, output dir. | **keep/extract** | Skill loading + selection stays (used indirectly by `defineSkillEval`); `resolveReportOutputDir` deletable; `resolveFrameworkVersion` stays for report metadata. |
| `index.ts` | Barrel. | **delete** | Nothing left to re-export. |

### `src/reporting/` module audit
| File | Purpose | Status | Rationale |
|---|---|---|---|
| `types.ts` | Report schema (`ArcSkillEvalJsonReport`, case/skill/parity/issue entries). | **keep/shrink** | Domain shapes still needed where `EvalTrace` + scorecard are transported, but report-specific shapes can retire once nothing consumes them. |
| `json-report.ts` | Builds + writes canonical `report.json`. | **delete** | Evalite's SQLite + `--outputPath` JSON replace. |
| `html-report.ts` | Renders HTML summary from JSON. | **delete** | Evalite's web UI at `:3006` replaces. |
| `index.ts` | Barrel. | **delete** | Nothing left to re-export. |

### Entrypoint + SDK orchestration
| File | Status | Notes |
|---|---|---|
| `src/bin/arc-skill-eval.ts` | **delete** | `evalite` binary is the entrypoint. |
| `src/pi/sdk-runner.ts` (incl. `runValidatedSkillViaPiSdk`) | **keep** | Canonical Pi SDK adapter — `defineSkillEval`'s task still wraps it via `runCaseViaPi`. |

### Index + test impact
- `src/index.ts` drops `export * from "./cli/index.js"` and `export * from "./reporting/index.js"`. Everything else stays.
- `tests/cli.test.mjs` (~256 LOC) and `tests/reporting.test.mjs` (~426 LOC) would be retired or rewritten against Evalite output. That's ~682 LOC of test code chasing ~1,800 LOC of deletable implementation.

### Rough delete budget
- `src/cli/`: ~1,161 LOC deletable (most of the dir) minus ~200 LOC of shared+types that stay
- `src/reporting/`: ~630 LOC deletable minus ~150 LOC of types that stay
- tests: ~682 LOC deletable
- **Net target: ~2,100+ LOC** (≈ 35% reduction in orchestration/reporting/CLI surface)

### Top 3 consumers that would break if deletion went too fast
1. **`src/cli/test-command.ts` → `src/evalite/define-skill-eval.ts`** — scoring + parity orchestration currently lives in `test-command`; pieces must be extracted cleanly into `defineSkillEval`'s task before the file is deleted.
2. **`src/index.ts` public barrel** — removing CLI/reporting re-exports breaks any downstream import. Needs coordinated changes.
3. **`tests/cli.test.mjs` + `tests/reporting.test.mjs`** — integration tests that assume the `CliInvocationResult` + `ArcSkillEvalJsonReport` shapes. Rewrite against `evalite --outputPath` JSON.

### Go / no-go signal so far
The experiment's original "go if `src/` shrinks meaningfully" bar is ~30% reduction in orchestration/reporting/CLI lines. The delete-list shows ~2,100 LOC is plausibly removable, which clears that bar. What we still haven't validated:
- A fully green real Pi run (iteration 3 blocked on quota).
- Whether Evalite's web UI is good enough that we don't miss our HTML report.
- Whether beta churn in `evalite@0.x` is tolerable over a release cycle.
