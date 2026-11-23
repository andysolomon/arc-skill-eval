# arc-skill-eval Roadmap

## Current direction

`arc-skill-eval` has pivoted to the Anthropic skill-eval shape: skills ship `SKILL.md` plus adjacent `evals/evals.json`, cases run through an agent runtime (Pi by default) with the skill attached, and assertions produce per-case `grading.json` + `timing.json` + observability artifacts.

The slim MVP is complete: discovery, loading/validation, workspace setup, Pi execution, grading, CLI run command, and the bundled `arc-creating-evals` authoring skill are in place.

As of 0.27.0 the CLI also ships these commands and features:

- `--json` on every command except `browse`, defined in `docs/cli-json-contract.md`.
- `install-skills`, which copies the bundled `arc-creating-evals` and `arc-running-evals` skills into a project.
- The `codex`, `claude-code`, `cursor-agent` and `copilot` runtimes, selected with `run --runtime`.
- `package`, which bundles a validated skill into a `.skill.tgz` file.
- `emit`, `audit`, `optimize-description`, `review`, `improve`, the `browse` TUI and the web app.

## Planning assumptions

- Keep `evals/evals.json` as the author-facing contract.
- Keep Pi (`pi-sdk`) as the default runtime. The other runtimes stay opt-in through `--runtime`.
- Add capability in vertical slices, each behind tests and docs.
- Prefer additive schema extensions over breaking changes.
- Do not bring back the retired `skill.eval.ts` contract format. Typed `defineSkillEval` suites are fine because `emit` compiles them to `evals/evals.json`, which is the only file the runner reads.

## Next priorities

### P0 — Repo hygiene and roadmap consolidation ✅

**Goal:** remove local/generated state from version control and make this roadmap the single next-work source of truth.

**Work items**
- Ignore `skills-lock.json`.
- Remove `skills-lock.json` from git tracking while preserving local copies.
- Keep `docs/evals-json-pivot.md` as historical direction context.
- Treat this file as the forward-looking roadmap.

**Acceptance criteria**
- `skills-lock.json` is ignored and untracked.
- A fresh clone does not require or modify `skills-lock.json`.
- `git status` stays clean after normal skill install/sync operations.

---

### P1 — Dual-run skill delta: `with_skill` vs `without_skill` ✅

**Goal:** measure whether a skill adds value by running each case twice and comparing pass rates.

**Work items**
- [x] Add run configuration for `with_skill` and `without_skill` variants.
- [x] Execute both variants against equivalent fresh workspaces.
- [x] Grade each variant independently.
- [x] Compute per-case pass-rate delta.
- [x] Compute per-skill pass-rate delta in `benchmark.json` during P2.
- [x] Keep current single-run behavior as the default.
- [x] Add dual-run as an opt-in mode first via `--compare`.

**Design notes**
- The `with_skill` variant attaches the target skill as today.
- The `without_skill` variant should run the same prompt/model/workspace without attaching the skill.
- Each variant should get an isolated workspace to avoid cross-run contamination.
- Case setup materialization should be deterministic and shared by both variants.

**Acceptance criteria**
- [x] A case can emit both `with_skill/grading.json` and `without_skill/grading.json`.
- [x] The framework computes a delta: `with_skill.pass_rate - without_skill.pass_rate`.
- [x] Tests cover deterministic workspace isolation between variants.

---

### P2 — `benchmark.json` aggregation ✅

**Goal:** emit a standard aggregate artifact that summarizes skill value across cases and variants.

**Work items**
- [x] Define `BenchmarkJson` TypeScript types.
- [x] Aggregate per-case `with_skill` / `without_skill` grading summaries.
- [x] Include an Anthropic-compatible core with totals, pass rates, deltas, and failures.
- [x] Include Pi-specific token counts, timings, model/thinking metadata, estimated cost, context usage, assistant response paths, trace/tool/context paths, tool-call counts, MCP-looking tool counts, and artifact paths under a metadata/extensions section.
- [x] Write `benchmark.json` at the run root for `--compare` runs only.
- [x] Add JSON shape tests.

**Acceptance criteria**
- [x] A `--compare` run writes a machine-readable `benchmark.json`.
- [x] The aggregate distinguishes assertion failures from runtime errors.
- [x] The artifact can answer: “does this skill improve results, and by how much?”

---

### P3 — Iteration workspaces 🚧

**Goal:** support repeated eval/improvement cycles without overwriting prior run evidence.

**Work items**
- [x] Add opt-in iteration-aware output layout, e.g. `iteration-1/`, `iteration-2/`.
- [x] Keep current per-case artifacts nested under each iteration.
- [x] Treat iteration workspaces as runner artifacts only at first; do not add an auto-improvement loop yet.
- [ ] Optionally record the evaluated `SKILL.md` snapshot per iteration.
- [x] Provide deterministic explicit iteration selection via `--iteration <name>`.
- [ ] Add automatic next-iteration selection if needed after pilot usage.

**Acceptance criteria**
- [x] Multiple explicit iterations can coexist for the same skill.
- [x] `benchmark.json` can summarize one selected iteration.
- [ ] Cross-iteration comparison in `benchmark.json` remains deferred. The `browse` TUI can already pin one run as a baseline and compare other iterations with it.
- [x] Prior artifacts are not overwritten by later runs unless the same explicit run id is reused.

---

### P4 — Pilot skill onboarding 🚧

**Goal:** prove the framework against representative real skills.

**Status:** `arc-conventional-commits` pilot vendored at `pilots/arc-conventional-commits/` with runbook in `docs/pilot/arc-conventional-commits.md`. No automated test covers the pilot. Commit fd964d1 deleted `tests/pilot-arc-conventional-commits.test.mjs` in September 2026. The first live `--compare` run is still pending.

**Initial pilot cohort**
1. `arc-conventional-commits` — first pilot; lowest external dependency risk and strong fixture/workspace assertion coverage.
2. `arc-creating-evals`
3. `arc-linear-issue-creator`

**Work items**
- Ensure each pilot skill has meaningful `evals/evals.json` coverage.
- Use `assistant.md`, `trace.json`, `tool-summary.json`, `context-manifest.json`, explicit `--extra-skill` conflict loadouts, optional `--context-mode ambient`, and model/token/cost/context timing metadata to explain pilot pass/fail deltas.
- Add or tighten fixtures for repo-mutation cases.
- Identify any live API requirements and gate them explicitly.
- Run the pilot cohort with `--compare`, which writes `benchmark.json`.

**Acceptance criteria**
- Each pilot skill has at least one passing eval case.
- Each pilot skill produces a `benchmark.json`.
- Gaps are documented as actionable eval or skill improvements.

---

### P5 — Release hardening 🚧

**Goal:** make the package reliable for external installation and CI use.

**Work items**
- [x] Run semantic-release on every push to `main` (`.github/workflows/release.yml`). It publishes to npm through trusted publishing. The first 0.27.0 attempt failed on an npm 2FA error and was re-cut.
- [x] Add CI checks for typecheck/test. `.github/workflows/ci.yml` runs `npm test`, which builds with `tsc`, plus the web typecheck, the web build and the Playwright smoke tests.
- [ ] Confirm package contents before publish. Commit fd964d1 removed the `npm pack` test, so nothing checks the tarball now.
- [x] Document install and usage against published versions in `README.md` and the docs site.

**Acceptance criteria**
- Release automation can run without manual local steps.
- CI blocks broken typecheck/test changes.
- Published package contains the CLI, runtime code, and docs needed by users.

## Suggested sequence

P0, P1 and P2 are done. P3 is done except the `SKILL.md` snapshot and automatic iteration naming.

1. Run the P4 pilot cohort live with `--compare` and record the gaps it finds.
2. Finish P5 by adding a package contents check before publish.
3. Revisit the open P3 items after pilot usage.

## Open design questions

1. **Resolved:** single-run remains the default; dual-run starts as opt-in behind a flag.
2. **Resolved:** `benchmark.json` should keep an Anthropic-compatible core and put Pi-specific trace refs, tool/context refs, token counts, model info, and artifact paths under metadata/extensions.
3. **Resolved:** iteration workspaces are runner artifacts only at first; no automatic `SKILL.md` improvement loop in the initial implementation.
4. **Resolved:** pilot `arc-conventional-commits` first, then `arc-creating-evals`, then `arc-linear-issue-creator`.
