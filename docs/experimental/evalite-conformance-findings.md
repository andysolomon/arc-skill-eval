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
