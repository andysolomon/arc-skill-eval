# arc-skill-eval Roadmap

## Current direction

`arc-skill-eval` has pivoted to the Anthropic skill-eval shape: skills ship `SKILL.md` plus adjacent `evals/evals.json`, cases run through Pi with the skill attached, and assertions produce per-case `grading.json` + `timing.json` artifacts.

The slim MVP is complete: discovery, loading/validation, workspace setup, Pi execution, grading, CLI run command, and the bundled `arc-creating-evals` authoring skill are in place.

## Planning assumptions

- Keep `evals/evals.json` as the author-facing contract.
- Keep Pi as the v1 runtime.
- Add capability in vertical slices, each behind tests and docs.
- Prefer additive schema extensions over breaking changes.
- Do not reintroduce the deprecated TypeScript `skill.eval.ts` authoring surface.

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
- [x] Include Pi-specific token counts, timings, and artifact paths under a metadata/extensions section.
- [x] Write `benchmark.json` at the run root for `--compare` runs only.
- [x] Add JSON shape tests.

**Acceptance criteria**
- [x] A `--compare` run writes a machine-readable `benchmark.json`.
- [x] The aggregate distinguishes assertion failures from runtime errors.
- [x] The artifact can answer: “does this skill improve results, and by how much?”

---

### P3 — Iteration workspaces

**Goal:** support repeated eval/improvement cycles without overwriting prior run evidence.

**Work items**
- Add iteration-aware output layout, e.g. `iteration-1/`, `iteration-2/`.
- Keep current per-case artifacts nested under each iteration.
- Treat iteration workspaces as runner artifacts only at first; do not add an auto-improvement loop yet.
- Optionally record the evaluated `SKILL.md` snapshot per iteration.
- Provide a deterministic way to select or create the next iteration.

**Acceptance criteria**
- Multiple iterations can coexist for the same skill.
- `benchmark.json` can summarize one iteration and optionally compare across iterations.
- Prior artifacts are not overwritten by later runs.

---

### P4 — Pilot skill onboarding

**Goal:** prove the framework against representative real skills.

**Initial pilot cohort**
1. `arc-conventional-commits` — first pilot; lowest external dependency risk and strong fixture/workspace assertion coverage.
2. `arc-creating-evals`
3. `arc-linear-issue-creator`

**Work items**
- Ensure each pilot skill has meaningful `evals/evals.json` coverage.
- Add or tighten fixtures for repo-mutation cases.
- Identify any live API requirements and gate them explicitly.
- Run the pilot cohort with dual-run + benchmark aggregation once P1/P2 are available.

**Acceptance criteria**
- Each pilot skill has at least one passing eval case.
- Each pilot skill produces a `benchmark.json`.
- Gaps are documented as actionable eval or skill improvements.

---

### P5 — Release hardening

**Goal:** make the package reliable for external installation and CI use.

**Work items**
- Verify semantic-release dry run.
- Add CI checks for typecheck/test.
- Confirm package contents before publish.
- Document install and usage against published versions.

**Acceptance criteria**
- Release automation can run without manual local steps.
- CI blocks broken typecheck/test changes.
- Published package contains the CLI, runtime code, and docs needed by users.

## Suggested sequence

1. Finish P0 immediately.
2. Implement P1 in the smallest vertical slice: one case, two variants, two grading files, one delta.
3. Add P2 once the dual-run artifact shape stabilizes.
4. Add P3 only after P1/P2 are useful in practice.
5. Use P4 pilots to validate and reprioritize.
6. Run P5 release hardening before wider adoption.

## Open design questions

1. **Resolved:** single-run remains the default; dual-run starts as opt-in behind a flag.
2. **Resolved:** `benchmark.json` should keep an Anthropic-compatible core and put Pi-specific trace refs, token counts, model info, and artifact paths under metadata/extensions.
3. **Resolved:** iteration workspaces are runner artifacts only at first; no automatic `SKILL.md` improvement loop in the initial implementation.
4. **Resolved:** pilot `arc-conventional-commits` first, then `arc-creating-evals`, then `arc-linear-issue-creator`.
