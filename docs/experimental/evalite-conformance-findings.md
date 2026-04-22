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
